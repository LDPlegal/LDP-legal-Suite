// GET /api/oauth/google/connect
// GET /api/oauth/microsoft/connect
//
// Redirige al consent screen del provider. Firma un state opaco con
// BETTER_AUTH_SECRET para verificar el callback.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/session";
import { buildAuthorizeUrl, isProviderConfigured, type OAuthProvider } from "@/lib/oauth";

function signState(payload: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
  }
  if (!isProviderConfigured(provider as OAuthProvider)) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: `Faltan variables de entorno para ${provider}. Configurá las OAuth credentials en Vercel.`,
      },
      { status: 503 },
    );
  }
  const user = await requireUser();
  const nonce = randomUUID();
  // State payload: provider|userId|firmId|nonce|sig
  const base = `${provider}|${user.userId}|${user.firmId}|${nonce}`;
  const sig = signState(base);
  const state = `${base}|${sig}`;
  const url = buildAuthorizeUrl(provider as OAuthProvider, state, {
    // Pedimos los scopes de mail.read sólo si el usuario activó la
    // funcionalidad. Por defecto NO se pide hasta que active explícitamente
    // en /configuracion → Seguridad. Esto cumple lo que pide Gabriel:
    // opt-in explícito por socio para lectura de inbox.
    includeMailRead: false,
  });
  if (!url) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  return NextResponse.redirect(url);
}
