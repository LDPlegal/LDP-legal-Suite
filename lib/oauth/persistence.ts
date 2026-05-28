// F7+ Bloque 5 — Persistencia de tokens OAuth.
//
// Decisión post-mortem: el cifrado app-layer de tokens (AES-256-GCM con
// HKDF) causaba errores intermitentes "Unable to authenticate data" en
// producción. Cualquier desalineación de APP_CRYPTO_MASTER_KEY entre
// ambientes Vercel rompía el flow. Lo eliminamos.
//
// Los tokens viven en columnas plaintext (access_token, refresh_token).
// Protección:
//   * RLS por firmId.
//   * app_user no es superuser.
//   * Tokens expiran (access ~1h, refresh ~90d).
//   * El usuario puede revocar desde el provider en cualquier momento.
//
// Migración 0022 agregó las columnas plaintext y dropeó el NOT NULL del
// access_token_cipher. Las columnas cipher quedan por audit pero no se
// usan más.

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { calendarIntegrations } from "@/lib/db/schema";
import {
  type ExchangedTokens,
  type OAuthProvider,
  refreshAccessToken,
} from "./index";

/** Error específico cuando los tokens no se pueden leer (deberían estar
 *  en plaintext después de migración 0022, pero si una fila vieja sigue
 *  con solo cipher y la app no puede descifrar, tiramos esto y el caller
 *  fuerza reconnect). */
export class IntegrationTokenUndecryptableError extends Error {
  constructor(public provider: OAuthProvider) {
    super(`Los tokens de ${provider} no son legibles. Reconectá la cuenta.`);
    this.name = "IntegrationTokenUndecryptableError";
  }
}

export async function saveCalendarIntegration(
  firmId: string,
  userId: string,
  provider: OAuthProvider,
  tokens: ExchangedTokens,
): Promise<void> {
  // Si no resolvió externalAccountId, usamos placeholder (los tokens son
  // lo que importa funcionalmente).
  const externalAccountId =
    tokens.externalAccountId ?? `${provider}-account-${userId.slice(0, 8)}`;

  const tokenMeta = { expiresAt: tokens.expiresAt.toISOString() };
  const scopes = tokens.scope ? tokens.scope.split(" ") : [];

  // Upsert por (user_id, provider) cuando el row no está disconnected.
  const [existing] = await adminDb
    .select({ id: calendarIntegrations.id })
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, userId),
        eq(calendarIntegrations.provider, provider),
        isNull(calendarIntegrations.disconnectedAt),
      ),
    )
    .limit(1);

  if (existing) {
    await adminDb
      .update(calendarIntegrations)
      .set({
        externalAccountId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        // Legacy columns: blanqueamos para no confundir
        accessTokenCipher: null,
        refreshTokenCipher: null,
        tokenMeta,
        scopes,
        updatedAt: new Date(),
        lastError: null,
      })
      .where(eq(calendarIntegrations.id, existing.id));
  } else {
    await adminDb.insert(calendarIntegrations).values({
      firmId,
      userId,
      provider,
      externalAccountId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenMeta,
      scopes,
    });
  }
}

/** Devuelve un access_token válido. Si está expirado o por expirar en
 *  <2 min, usa el refresh token. Si las tokens están en formato viejo
 *  (cipher) y no las podemos leer, tira IntegrationTokenUndecryptableError
 *  → el caller marca needs-reconnect. */
export async function getValidAccessToken(
  userId: string,
  provider: OAuthProvider,
): Promise<{ accessToken: string; externalAccountId: string } | null> {
  const [row] = await adminDb
    .select()
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, userId),
        eq(calendarIntegrations.provider, provider),
        isNull(calendarIntegrations.disconnectedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  // Fila vieja sin plaintext y solo con cipher → no podemos leerla.
  // Esto solo pasa para integrations creadas antes de la migración 0022
  // y que todavía no se han reconectado.
  if (!row.accessToken && row.accessTokenCipher) {
    await autoDisconnect(row.id, "tokens_legacy_cipher_only");
    throw new IntegrationTokenUndecryptableError(provider);
  }
  if (!row.accessToken) {
    await autoDisconnect(row.id, "no_access_token");
    throw new IntegrationTokenUndecryptableError(provider);
  }

  const expiresAt = new Date(row.tokenMeta.expiresAt);
  const needsRefresh = expiresAt.getTime() - Date.now() < 2 * 60 * 1000;

  if (!needsRefresh) {
    return { accessToken: row.accessToken, externalAccountId: row.externalAccountId };
  }
  if (!row.refreshToken) {
    throw new Error("Token expirado y no hay refresh_token; reconectá la cuenta.");
  }

  // Refresh el access token.
  const refreshed = await refreshAccessToken(provider, row.refreshToken);
  await adminDb
    .update(calendarIntegrations)
    .set({
      accessToken: refreshed.accessToken,
      tokenMeta: { expiresAt: refreshed.expiresAt.toISOString() },
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegrations.id, row.id));
  return { accessToken: refreshed.accessToken, externalAccountId: row.externalAccountId };
}

/** Marca la integración como desconectada y registra el motivo. El user
 *  tiene que ir a /configuracion → Seguridad → Conectar de nuevo. */
async function autoDisconnect(integrationId: string, reason: string): Promise<void> {
  await adminDb
    .update(calendarIntegrations)
    .set({
      disconnectedAt: new Date(),
      lastError: `auto_disconnect:${reason}`,
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegrations.id, integrationId));
}

export async function disconnectIntegration(
  userId: string,
  provider: OAuthProvider,
): Promise<void> {
  await adminDb
    .update(calendarIntegrations)
    .set({ disconnectedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(calendarIntegrations.userId, userId),
        eq(calendarIntegrations.provider, provider),
      ),
    );
}
