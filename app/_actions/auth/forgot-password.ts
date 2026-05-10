"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

const Schema = z.object({
  email: z.string().trim().email("Email inválido").toLowerCase(),
});

export type ForgotPasswordState =
  | { ok: true }
  | { ok: false; error: string };

// Ask better-auth to mint a reset token and (in dev) log it. We don't
// reveal whether the email exists — same response shape either way so the
// page can't be used to enumerate accounts.
export async function forgotPasswordAction(
  _prev: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = Schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: "Email inválido." };
  }
  try {
    await auth.api.requestPasswordReset({
      body: {
        email: parsed.data.email,
        redirectTo: "/reset-password",
      },
      headers: await headers(),
    });
  } catch {
    // Silently succeed even if better-auth threw — typical when the email
    // doesn't exist. Don't leak that fact.
  }
  return { ok: true };
}

const ResetSchema = z.object({
  token: z.string().min(10).max(500),
  newPassword: z.string().min(8).max(72),
});

export type ResetPasswordState =
  | { ok: true }
  | { ok: false; error: string };

export async function resetPasswordAction(
  _prev: ResetPasswordState | undefined,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = ResetSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }
  try {
    await auth.api.resetPassword({
      body: {
        newPassword: parsed.data.newPassword,
        token: parsed.data.token,
      },
      headers: await headers(),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No se pudo restablecer la contraseña.",
    };
  }
}
