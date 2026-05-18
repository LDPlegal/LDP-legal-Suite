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

export async function GET(
  req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      new URL(`/configuracion?tab=seguridad&oauth_error=${encodeURIComponent(error)}`, req.url),
    );
  }
  if (!code || !state) {
    return NextResponse.json({ error: "missing_code_or_state" }, { status: 400 });
  }
  const verified = verifyState(state);
  if (!verified || verified.provider !== provider) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  // Re-check the session matches the user encoded in state (defense in
  // depth against another logged-in user intercepting the callback).
  const user = await requireUser();
  if (user.userId !== verified.userId || user.firmId !== verified.firmId) {
    return NextResponse.json({ error: "session_mismatch" }, { status: 403 });
  }

  try {
    const tokens = await exchangeCodeForTokens(provider as OAuthProvider, code, false);
    await saveCalendarIntegration(user.firmId, user.userId, provider as OAuthProvider, tokens);
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "user",
      entityId: user.userId,
      action: "updated",
      summary: `Conectó calendario ${provider} (${tokens.externalAccountId})`,
      diff: { provider, externalAccountId: tokens.externalAccountId },
    });
    return NextResponse.redirect(
      new URL(`/configuracion?tab=seguridad&oauth_connected=${provider}`, req.url),
    );
  } catch (err) {
    console.error(`[oauth/${provider}/callback]`, err);
    return NextResponse.redirect(
      new URL(
        `/configuracion?tab=seguridad&oauth_error=${encodeURIComponent(
          err instanceof Error ? err.message : "internal",
        )}`,
        req.url,
      ),
    );
  }
}
