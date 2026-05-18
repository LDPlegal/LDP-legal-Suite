// F7+ Bloque 5 — OAuth con Google y Microsoft Graph para conectar el
// calendario y el correo personal de cada socio.
//
// Diseño:
//   - Sin SDK pesado: las dos APIs son OAuth 2.0 estándar y se pueden hacer
//     con fetch directo. Si más adelante necesitamos features avanzadas
//     (push notifications, watch channels) consideraremos `googleapis` /
//     `@microsoft/microsoft-graph-client`.
//   - Tokens se cifran con APP_CRYPTO_MASTER_KEY (lib/crypto/app-layer.ts)
//     antes de persistir en calendar_integrations.
//   - El refresh token vive indefinidamente; el access token tiene TTL ~1h
//     y se renueva on-demand cuando un sync lo requiere.
//
// Scopes mínimos:
//   - Google: calendar.events + gmail.send + gmail.readonly (este último
//     sólo cuando el socio activa la lectura de inbox).
//   - Microsoft: Calendars.ReadWrite + Mail.Send + Mail.Read (idem).
//
// Endpoints expuestos al usuario:
//   GET /api/oauth/google/connect    → redirige a Google consent.
//   GET /api/oauth/google/callback   → recibe el code, guarda tokens.
//   GET /api/oauth/microsoft/connect → idem MS.
//   GET /api/oauth/microsoft/callback → idem MS callback.
//   POST /api/oauth/<provider>/disconnect → borra (soft) la conexión.

import "server-only";

export type OAuthProvider = "google" | "microsoft";

export type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

function readClientConfig(provider: OAuthProvider, includeMailRead: boolean): OAuthClientConfig | null {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return null;
    const scopes = [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/gmail.send",
      ...(includeMailRead ? ["https://www.googleapis.com/auth/gmail.readonly"] : []),
    ];
    return { clientId, clientSecret, redirectUri, scopes };
  }
  // microsoft
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  const scopes = [
    "openid",
    "email",
    "offline_access",
    "Calendars.ReadWrite",
    "Mail.Send",
    ...(includeMailRead ? ["Mail.Read"] : []),
  ];
  return { clientId, clientSecret, redirectUri, scopes };
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return readClientConfig(provider, false) !== null;
}

const AUTH_URL: Record<OAuthProvider, string> = {
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
};
const TOKEN_URL: Record<OAuthProvider, string> = {
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

// Build the consent URL the user is redirected to. `state` is opaque
// (signed by us out-of-band) so callback can verify the response.
export function buildAuthorizeUrl(
  provider: OAuthProvider,
  state: string,
  opts: { includeMailRead?: boolean } = {},
): string | null {
  const cfg = readClientConfig(provider, opts.includeMailRead ?? false);
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    access_type: provider === "google" ? "offline" : "",
    prompt: "consent",
  });
  // Trim empty ones.
  for (const k of Array.from(params.keys())) {
    if (!params.get(k)) params.delete(k);
  }
  return `${AUTH_URL[provider]}?${params.toString()}`;
}

export type ExchangedTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string | null;
  externalAccountId: string | null;
};

// Exchange the authorization code for tokens.
export async function exchangeCodeForTokens(
  provider: OAuthProvider,
  code: string,
  includeMailRead: boolean,
): Promise<ExchangedTokens> {
  const cfg = readClientConfig(provider, includeMailRead);
  if (!cfg) throw new Error(`OAuth provider ${provider} no configurado.`);
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL[provider], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${provider} token exchange failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
  };
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  // Extract the user's email from id_token (JWT, middle segment is base64url
  // JSON). Best-effort; if it fails we leave it null and resolve later.
  let externalAccountId: string | null = null;
  if (json.id_token) {
    try {
      const middle = json.id_token.split(".")[1];
      if (middle) {
        const padded = middle + "=".repeat((4 - (middle.length % 4)) % 4);
        const decoded = JSON.parse(
          Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
        ) as { email?: string; preferred_username?: string };
        externalAccountId = decoded.email ?? decoded.preferred_username ?? null;
      }
    } catch {
      // ignore
    }
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt,
    scope: json.scope ?? null,
    externalAccountId,
  };
}

// Refresh an expired access token using the refresh token.
export async function refreshAccessToken(
  provider: OAuthProvider,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const cfg = readClientConfig(provider, true);
  if (!cfg) throw new Error(`OAuth provider ${provider} no configurado.`);
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL[provider], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${provider} token refresh failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
  };
}
