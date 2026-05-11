"use server";

// Admin/partner action to add another staff member to the firm.
// Mirrors invitarPortalAction but for internal roles (lawyer / paralegal /
// partner / admin). Same trick: go through auth.$context.internalAdapter
// directly so we don't sustitute the inviter's session via signUpEmail.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { adminDb } from "@/lib/db/admin";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { logAuditStandalone } from "@/lib/audit/log";
import { sessions, users } from "@/lib/db/schema";

const InviteSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "partner", "lawyer", "paralegal", "tester"]),
  password: z.string().min(8).max(72),
  hourlyRate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/u)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type InvitarStaffState =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function invitarStaffAction(
  _prev: InvitarStaffState | undefined,
  formData: FormData,
): Promise<InvitarStaffState> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    return {
      ok: false,
      error: "Solo admin y socios pueden agregar miembros al equipo.",
    };
  }

  // Only admins can create other admins. Partners can only invite lower roles.
  const parsed = InviteSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    password: formData.get("password"),
    hourlyRate: formData.get("hourlyRate"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  if (parsed.data.role === "admin" && user.role !== "admin") {
    return { ok: false, error: "Solo un admin puede crear otro admin." };
  }

  const ctx = await auth.$context;
  const normalizedEmail = parsed.data.email.toLowerCase();

  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail, {
    includeAccounts: false,
  });
  if (existing) {
    return { ok: false, error: "Ya existe un usuario con ese email." };
  }

  let createdId: string;
  try {
    const hash = await ctx.password.hash(parsed.data.password);
    const created = await ctx.internalAdapter.createUser({
      email: normalizedEmail,
      name: parsed.data.name,
      emailVerified: false,
      firmId: user.firmId,
      role: parsed.data.role,
      status: "invited",
      hourlyRate: parsed.data.hourlyRate ?? null,
    } as Parameters<typeof ctx.internalAdapter.createUser>[0]);
    if (!created?.id) throw new Error("No se pudo crear el usuario.");
    createdId = created.id;

    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: hash,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo crear el acceso.",
    };
  }

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: createdId,
    action: "created",
    summary: `Agregó al equipo: ${parsed.data.name} (${normalizedEmail}) como ${parsed.data.role}`,
  });

  // Send invitation email (best-effort, no rompe el action si falla).
  try {
    const { sendEmail } = await import("@/lib/email");
    const { buildStaffInviteEmail } = await import("@/lib/email/templates");
    const { getCurrentFirm } = await import("@/lib/db/queries/firms");
    const firm = await getCurrentFirm(user.firmId, user.userId);
    const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const { subject, html } = buildStaffInviteEmail({
      recipientName: parsed.data.name,
      firmName: firm?.name ?? "tu firma",
      inviterName: user.name,
      role: parsed.data.role,
      loginUrl: `${baseUrl}/login`,
      tempPassword: parsed.data.password,
    });
    await sendEmail({ to: normalizedEmail, subject, html });
  } catch (err) {
    console.error("[invitarStaff] email failed:", err);
  }

  revalidatePath("/configuracion");
  return { ok: true, userId: createdId };
}

const UpdateRoleSchema = z.object({
  targetId: z.string().uuid(),
  role: z.enum(["admin", "partner", "lawyer", "paralegal", "tester"]),
});

export type UpdateRoleState =
  | { ok: true }
  | { ok: false; error: string };

export async function actualizarRolStaffAction(
  _prev: UpdateRoleState | undefined,
  formData: FormData,
): Promise<UpdateRoleState> {
  const user = await requireUser();
  if (user.role !== "admin") {
    return { ok: false, error: "Solo un admin puede cambiar roles." };
  }
  const parsed = UpdateRoleSchema.safeParse({
    targetId: formData.get("targetId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos." };
  }
  if (parsed.data.targetId === user.userId && parsed.data.role !== "admin") {
    return { ok: false, error: "No puedes quitarte tu propio rol de admin." };
  }

  await adminDb
    .update(users)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(
      and(
        eq(users.id, parsed.data.targetId),
        eq(users.firmId, user.firmId),
        isNull(users.deletedAt),
      ),
    );

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: parsed.data.targetId,
    action: "updated",
    summary: `Cambió rol a ${parsed.data.role}`,
  });

  revalidatePath("/configuracion");
  return { ok: true };
}

const DeactivateSchema = z.object({ targetId: z.string().uuid() });

export async function desactivarStaffAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    throw new Error("Solo admin y socios pueden desactivar miembros.");
  }
  const parsed = DeactivateSchema.parse({ targetId: formData.get("targetId") });
  if (parsed.targetId === user.userId) {
    throw new Error("No puedes desactivarte a ti mismo.");
  }

  // Soft-delete + kill sessions. The user can't log in anymore (getCurrentUser
  // rejects deletedAt rows; session.create.before hook rejects new logins).
  await adminDb
    .update(users)
    .set({
      deletedAt: new Date(),
      status: "suspended",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, parsed.targetId),
        eq(users.firmId, user.firmId),
        isNull(users.deletedAt),
      ),
    );

  await adminDb.delete(sessions).where(inArray(sessions.userId, [parsed.targetId]));

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: parsed.targetId,
    action: "deleted",
    summary: "Desactivó miembro del equipo",
  });

  revalidatePath("/configuracion");
}
