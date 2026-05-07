"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { adminDb } from "@/lib/db/admin";
import { firms } from "@/lib/db/schema";
import { SignUpSchema } from "@/lib/schemas/auth";

// Signup flow (Trampa #6 of the BRIEF):
//   * The first admin of a firm registers along with the firm itself.
//   * `withFirm` cannot wrap this insert — the firm does not exist yet —
//     so we use the admin connection to create the firm row.
//   * Better-auth then creates the user (with the new firmId + role=admin),
//     hashes the password, and starts a session in one call.
//   * If user creation fails, we roll the firm back so a half-created
//     tenant doesn't dangle.
// =============================================================================

export type SignUpState =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<"firmName" | "rnc" | "name" | "email" | "password", string[]>>;
    };

export async function signUpAction(
  _prev: SignUpState | undefined,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = SignUpSchema.safeParse({
    firmName: formData.get("firmName"),
    rnc: formData.get("rnc"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Por favor revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { firmName, rnc, name, email, password } = parsed.data;

  const [firm] = await adminDb
    .insert(firms)
    .values({ name: firmName, rnc: rnc ?? null })
    .returning();
  if (!firm) {
    return { ok: false, error: "No se pudo crear el firm. Intenta de nuevo." };
  }

  try {
    const requestHeaders = await headers();
    await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        firmId: firm.id,
        role: "admin",
      },
      headers: requestHeaders,
    });
  } catch (err) {
    // Roll back the firm row to avoid a dangling tenant on failure.
    await adminDb.delete(firms).where(eq(firms.id, firm.id));
    const message =
      err instanceof Error ? err.message : "No se pudo crear el usuario.";
    return { ok: false, error: message };
  }

  redirect("/dashboard");
}
