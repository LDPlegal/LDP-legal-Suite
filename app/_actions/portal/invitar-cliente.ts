"use server";

// Admin action: create a portal-cliente account for a given client. The
// admin/partner provides email + temporary password; the client uses these
// to sign in at /login (better-auth signin works for role='client' too) and
// is automatically routed to /portal/dashboard by the requireUser flow.
//
// Why a temp password instead of a magic link: Fase 4 keeps the auth surface
// area minimal. better-auth supports magic-link / passwordless flows but
// adopting them is its own decision (email infra, deliverability, etc.).
// We can swap this action for a magic-link version without changing the
// portal layer.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { adminDb } from "@/lib/db/admin";
import { requireUser } from "@/lib/auth/session";
import { getClientById } from "@/lib/db/queries/clients";
import { logAuditStandalone } from "@/lib/audit/log";
import { users } from "@/lib/db/schema";

const Schema = z.object({
  clientId: z.string().uuid(),
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(72),
});

export type InvitarPortalState =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function invitarPortalAction(
  _prev: InvitarPortalState | undefined,
  formData: FormData,
): Promise<InvitarPortalState> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    return {
      ok: false,
      error: "Solo admin y socios pueden crear accesos al portal.",
    };
  }

  const parsed = Schema.safeParse({
    clientId: formData.get("clientId"),
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  // Verify the client belongs to the firm.
  const client = await getClientById(user.firmId, user.userId, parsed.data.clientId);
  if (!client) {
    return { ok: false, error: "Cliente no encontrado." };
  }

  // Better-auth's signUpEmail expects no active session context for the new
  // user, but we're inside an admin's session. Create the row directly via
  // the admin connection so we control firmId + role + clientId, then write
  // the credential through better-auth's account adapter via signUpEmail.
  // Simpler: use signUpEmail with the additional fields. better-auth will
  // create the new session for the SIGNED-IN admin if we don't pass
  // disableCookieAuth — but it expects clientId in additionalFields.
  let createdId: string | null = null;
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name,
        firmId: user.firmId,
        role: "client",
        clientId: parsed.data.clientId,
      },
      // NOTE: we deliberately don't forward request headers so the new user's
      // session isn't planted in the admin's cookies. better-auth will still
      // create the user row + credential; the client logs in afterwards.
    });
    createdId = result.user.id;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo crear el acceso.",
    };
  }

  // Belt-and-suspenders: ensure the new row really is role=client and
  // points at the right clientId. signUpEmail goes through the admin db
  // connection (BYPASSRLS) which is fine here since we're the firm admin.
  if (createdId) {
    await adminDb
      .update(users)
      .set({ role: "client", clientId: parsed.data.clientId, status: "invited" })
      .where(eq(users.id, createdId));

    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "user",
      entityId: createdId,
      action: "created",
      summary: `Creó acceso al portal para ${parsed.data.name} (${parsed.data.email})`,
      diff: { clientId: parsed.data.clientId },
    });
  }

  revalidatePath(`/clientes/${parsed.data.clientId}`);
  return { ok: true, userId: createdId ?? "" };
}
