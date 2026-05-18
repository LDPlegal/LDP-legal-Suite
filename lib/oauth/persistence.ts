// F7+ Bloque 5 — Persistencia de tokens OAuth con cifrado app-layer.
//
// El access_token + refresh_token se cifran con AES-256-GCM antes de
// persistir en calendar_integrations. La master key vive en
// APP_CRYPTO_MASTER_KEY (lib/crypto/app-layer.ts).

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { calendarIntegrations } from "@/lib/db/schema";
import { decryptDocument, encryptDocument } from "@/lib/crypto/app-layer";
import {
  type ExchangedTokens,
  type OAuthProvider,
  refreshAccessToken,
} from "./index";

function encryptTokenString(s: string, scope: string): {
  cipher: string;
  iv: string;
  aad: string;
  keyId: string;
} {
  const { ciphertext, meta } = encryptDocument({
    plaintext: Buffer.from(s, "utf8"),
    documentId: scope, // re-using documentId slot as a binding scope
    firmId: scope,
  });
  return {
    cipher: ciphertext.toString("base64"),
    iv: meta.iv,
    aad: meta.aad,
    keyId: meta.keyId,
  };
}

function decryptTokenString(
  cipherB64: string,
  meta: { iv: string; aad: string; keyId: string },
  scope: string,
): string {
  const buf = Buffer.from(cipherB64, "base64");
  const out = decryptDocument({
    ciphertext: buf,
    meta: { v: 1, ...meta },
    documentId: scope,
    firmId: scope,
  });
  return out.toString("utf8");
}

export async function saveCalendarIntegration(
  firmId: string,
  userId: string,
  provider: OAuthProvider,
  tokens: ExchangedTokens,
): Promise<void> {
  if (!tokens.externalAccountId) {
    throw new Error("No se pudo determinar el email del proveedor — falta id_token.");
  }
  const scope = `${firmId}:${userId}:${provider}`;
  const accessEnc = encryptTokenString(tokens.accessToken, scope);
  const refreshEnc = tokens.refreshToken
    ? encryptTokenString(tokens.refreshToken, scope)
    : null;

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

  const meta = {
    iv: accessEnc.iv,
    aad: accessEnc.aad,
    keyId: accessEnc.keyId,
    expiresAt: tokens.expiresAt.toISOString(),
  };
  const scopes = tokens.scope ? tokens.scope.split(" ") : [];

  if (existing) {
    await adminDb
      .update(calendarIntegrations)
      .set({
        externalAccountId: tokens.externalAccountId,
        accessTokenCipher: accessEnc.cipher,
        refreshTokenCipher: refreshEnc?.cipher ?? null,
        tokenMeta: meta,
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
      externalAccountId: tokens.externalAccountId,
      accessTokenCipher: accessEnc.cipher,
      refreshTokenCipher: refreshEnc?.cipher ?? null,
      tokenMeta: meta,
      scopes,
    });
  }
}

// Read + auto-refresh: devuelve un access_token válido. Si el actual está
// expirado o por expirar en <2 min, usa el refresh token y actualiza la fila.
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
  const scope = `${row.firmId}:${row.userId}:${row.provider}`;
  const expiresAt = new Date(row.tokenMeta.expiresAt);
  const needsRefresh = expiresAt.getTime() - Date.now() < 2 * 60 * 1000;
  if (!needsRefresh) {
    const accessToken = decryptTokenString(
      row.accessTokenCipher,
      row.tokenMeta,
      scope,
    );
    return { accessToken, externalAccountId: row.externalAccountId };
  }
  if (!row.refreshTokenCipher) {
    throw new Error("Token expirado y no hay refresh_token; el usuario debe reconectar.");
  }
  const refreshToken = decryptTokenString(
    row.refreshTokenCipher,
    row.tokenMeta,
    scope,
  );
  const refreshed = await refreshAccessToken(provider, refreshToken);
  const reEnc = encryptTokenString(refreshed.accessToken, scope);
  await adminDb
    .update(calendarIntegrations)
    .set({
      accessTokenCipher: reEnc.cipher,
      tokenMeta: {
        iv: reEnc.iv,
        aad: reEnc.aad,
        keyId: reEnc.keyId,
        expiresAt: refreshed.expiresAt.toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegrations.id, row.id));
  return { accessToken: refreshed.accessToken, externalAccountId: row.externalAccountId };
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
