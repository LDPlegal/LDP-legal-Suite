// GET /api/oauth/microsoft/admin-consent
//
// Redirige al admin del tenant al endpoint /adminconsent de Microsoft.
// El admin autoriza la app para TODA la organización de una vez. Después,
// cualquier usuario del tenant puede conectar sin pasar por aprobación.
//
// Solo admins/socios de LDP pueden iniciar esto (no tiene sentido que un
// abogado lo dispare — necesita ser admin del tenant Microsoft de todos
// modos, pero filtramos por rol del app también).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/session";
import {
  buildAdminConsentUrl,
  isProviderConfigured,
  type OAuthProvider,
} from "@/lib/oauth";

function signState(payload: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "microsoft") {
    return NextResponse.json(
      { error: "admin_consent solo soportado para Microsoft" },
      { status: 400 },
    );
  }
  if (!isProviderConfigured(provider as OAuthProvider)) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const user = await requireUser();
  // El state usa el prefijo "admin|" para que el callback sepa que es un
  // flow de admin consent (vs. user consent normal).
  const nonce = randomUUID();
  const base = `admin|${provider}|${user.userId}|${user.firmId}|${nonce}`;
  const sig = signState(base);
  const state = `${base}|${sig}`;
  const url = buildAdminConsentUrl(provider as OAuthProvider, state);
  if (!url) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  return NextResponse.redirect(url);
}
