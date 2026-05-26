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

/** Error específico cuando los tokens cifrados de un usuario no pueden
 *  descifrarse — típicamente porque APP_CRYPTO_MASTER_KEY cambió entre
 *  el save y el read. El UI lo trata como "necesita reconectar". */
export class IntegrationTokenUndecryptableError extends Error {
  constructor(public provider: OAuthProvider) {
    super(`No se pudieron descifrar los tokens de ${provider}. Reconectá la cuenta.`);
    this.name = "IntegrationTokenUndecryptableError";
  }
}

function isAuthTagError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("unable to authenticate data") ||
    m.includes("unsupported state") ||
    m.includes("aad mismatch") ||
    m.includes("invalid iv length")
  );
}

export async function saveCalendarIntegration(
  firmId: string,
  userId: string,
  provider: OAuthProvider,
  tokens: ExchangedTokens,
): Promise<void> {
  // Si no pudimos resolver un externalAccountId (id_token sin claims
  // útiles + /me API falló), guardamos con placeholder en vez de fallar
  // el flow entero. El sync funciona igual porque usa el access_token
  // directamente — el accountId es solo para mostrar en la UI.
  const externalAccountId =
    tokens.externalAccountId ?? `${provider}-account-${userId.slice(0, 8)}`;
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
        externalAccountId: externalAccountId,
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
      externalAccountId,
      accessTokenCipher: accessEnc.cipher,
      refreshTokenCipher: refreshEnc?.cipher ?? null,
      tokenMeta: meta,
      scopes,
    });
  }
}

// Read + auto-refresh: devuelve un access_token válido. Si el actual está
// expirado o por expirar en <2 min, usa el refresh token y actualiza la fila.
//
// Si los tokens no pueden descifrarse (típicamente porque
// APP_CRYPTO_MASTER_KEY cambió desde que se guardaron), auto-disconnecta
// la integración y tira IntegrationTokenUndecryptableError. El usuario
// debe reconectar la cuenta — los tokens viejos son irrecuperables.
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
    try {
      const accessToken = decryptTokenString(
        row.accessTokenCipher,
        row.tokenMeta,
        scope,
      );
      return { accessToken, externalAccountId: row.externalAccountId };
    } catch (err) {
      if (isAuthTagError(err)) {
        await autoDisconnect(row.id, "tokens_undecryptable");
        throw new IntegrationTokenUndecryptableError(provider);
      }
      throw err;
    }
  }
  if (!row.refreshTokenCipher) {
    throw new Error("Token expirado y no hay refresh_token; el usuario debe reconectar.");
  }
  let refreshToken: string;
  try {
    refreshToken = decryptTokenString(
      row.refreshTokenCipher,
      row.tokenMeta,
      scope,
    );
  } catch (err) {
    if (isAuthTagError(err)) {
      await autoDisconnect(row.id, "tokens_undecryptable");
      throw new IntegrationTokenUndecryptableError(provider);
    }
    throw err;
  }

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
