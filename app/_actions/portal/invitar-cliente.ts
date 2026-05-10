"use server";

// Admin action: create a portal-cliente account for a given client. The
// admin/partner provides email + temporary password; the client uses these
// to sign in at /login and is automatically routed to /portal/dashboard by
// the requireUser flow.
//
// IMPORTANT: we do NOT use auth.api.signUpEmail() here even though it would
// be the obvious choice. With autoSignIn=true (our global config) signUpEmail
// creates a session for the new user AND the nextCookies() plugin plants
// the new session cookie in the response of THIS server action — which
// silently logs the admin out and signs them in as the just-created client.
//
// Instead we go through auth.$context.internalAdapter directly: hash the
// password, create the user with the additional fields (firmId, role,
// clientId), and link a credential account. No session, no cookies, the
// admin's session stays intact.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/session";
import { getClientById } from "@/lib/db/queries/clients";
import { logAuditStandalone } from "@/lib/audit/log";

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

  const client = await getClientById(user.firmId, user.userId, parsed.data.clientId);
  if (!client) {
    return { ok: false, error: "Cliente no encontrado." };
  }

  const ctx = await auth.$context;
  const normalizedEmail = parsed.data.email.toLowerCase();

  // Reject duplicates up front with a friendly message instead of letting
  // the unique constraint blow up.
  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail, {
    includeAccounts: false,
  });
  if (existing) {
    return {
      ok: false,
      error: "Ya existe un usuario con ese email.",
    };
  }

  let createdId: string;
  try {
    const hash = await ctx.password.hash(parsed.data.password);
    // createUser accepts our additionalFields (firmId, role, clientId) since
    // we declared them in betterAuth({ user: { additionalFields: { ... } } }).
    const created = await ctx.internalAdapter.createUser({
      email: normalizedEmail,
      name: parsed.data.name,
      emailVerified: false,
      firmId: user.firmId,
      role: "client",
      clientId: parsed.data.clientId,
      status: "invited",
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
    summary: `Creó acceso al portal para ${parsed.data.name} (${normalizedEmail})`,
    diff: { clientId: parsed.data.clientId },
  });

  revalidatePath(`/clientes/${parsed.data.clientId}`);
  return { ok: true, userId: createdId };
}
