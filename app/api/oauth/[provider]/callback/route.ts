// GET /api/oauth/google/callback
// GET /api/oauth/microsoft/callback
//
// Recibe el authorization code del provider, lo intercambia por tokens,
// los cifra con APP_CRYPTO_MASTER_KEY y persiste en calendar_integrations.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { exchangeCodeForTokens, type OAuthProvider } from "@/lib/oauth";
import { saveCalendarIntegration } from "@/lib/oauth/persistence";
import { requireUser } from "@/lib/auth/session";
import { logAuditStandalone } from "@/lib/audit/log";

function verifyState(state: string): {
  provider: OAuthProvider;
  userId: string;
  firmId: string;
} | null {
  const parts = state.split("|");
  if (parts.length !== 5) return null;
  const [provider, userId, firmId, nonce, sig] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (provider !== "google" && provider !== "microsoft") return null;
  const base = `${provider}|${userId}|${firmId}|${nonce}`;
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  const expected = createHmac("sha256", secret).update(base).digest("hex").slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    return timingSafeEqual(a, b)
      ? { provider: provider as OAuthProvider, userId, firmId }
      : null;
  } catch {
    return null;
  }
}

/** Helper para construir la redirección a /configuracion con un error,
 *  evitando duplicación de URLs hardcodeadas. */
function redirectWithError(req: Request, error: string): NextResponse {
  return NextResponse.redirect(
    new URL(
      `/configuracion?tab=seguridad&oauth_error=${encodeURIComponent(error.slice(0, 500))}`,
      req.url,
    ),
  );
}

export async function GET(
  req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "google" && provider !== "microsoft") {
    return redirectWithError(req, "unsupported_provider");
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const adminConsent = url.searchParams.get("admin_consent");

  // ---- ADMIN CONSENT FLOW ----
  // Si viene admin_consent (True/False), es la respuesta del endpoint
  // /adminconsent. No hay `code` para intercambiar, solo confirma que el
  // admin autorizó (o no) la app para toda la organización.
  if (adminConsent !== null) {
    if (error) {
      console.warn(`[oauth/${provider}/admin-consent] error:`, error, errorDescription);
      return redirectWithError(req, errorDescription || error);
    }
    if (adminConsent.toLowerCase() === "true") {
      return NextResponse.redirect(
        new URL(`/configuracion?tab=seguridad&admin_consent=ok`, req.url),
      );
    }
    return redirectWithError(
      req,
      "El admin no completó la autorización de la organización.",
    );
  }

  // El provider devolvió un error (admin consent required, access denied, etc).
  if (error) {
    console.warn(`[oauth/${provider}/callback] provider error:`, error, errorDescription);
    return redirectWithError(req, errorDescription || error);
  }

  if (!code || !state) {
    return redirectWithError(req, "missing_code_or_state, el flow OAuth se cortó antes de obtener autorización");
  }
  const verified = verifyState(state);
  if (!verified || verified.provider !== provider) {
    return redirectWithError(req, "invalid_state, la sesión OAuth ya no es válida. Volvé a clickear Conectar.");
  }

  // requireUser() puede tirar si la sesión expiró mientras esperabas
  // la aprobación del admin. Lo capturamos y redirigimos con error claro
  // en vez de mandar al user a /login (donde no entendería qué pasó).
  let user;
  try {
    user = await requireUser();
  } catch {
    return redirectWithError(
      req,
      "session_mismatch, tu sesión en la app expiró mientras autorizabas. Iniciá sesión y volvé a clickear Conectar.",
    );
  }
  if (user.userId !== verified.userId || user.firmId !== verified.firmId) {
    return redirectWithError(
      req,
      "session_mismatch, la sesión actual no coincide con la que inició OAuth.",
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(provider as OAuthProvider, code, false);
    await saveCalendarIntegration(
      user.firmId,
      user.userId,
      provider as OAuthProvider,
      tokens,
    );
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "user",
      entityId: user.userId,
      action: "updated",
      summary: `Conectó calendario ${provider} (${tokens.externalAccountId ?? "cuenta sin email"})`,
      diff: { provider, externalAccountId: tokens.externalAccountId },
    });
    return NextResponse.redirect(
      new URL(`/configuracion?tab=seguridad&oauth_connected=${provider}`, req.url),
    );
  } catch (err) {
    // Logueamos el error completo en el server para que veamos los detalles
    // en Vercel logs. La URL solo lleva una versión resumida.
    console.error(`[oauth/${provider}/callback] save failed:`, err);
    return redirectWithError(
      req,
      err instanceof Error ? err.message : "internal_error_saving_tokens",
    );
  }
}
