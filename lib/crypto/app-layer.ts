// F7 bloque 4, Cifrado a nivel de aplicación para casos "ultra confidenciales".
//
// Modelo de amenaza que cubre:
//   1. El proveedor de storage (Cloudflare R2) es comprometido o sirve un
//      pliego judicial extranjero: solo ve blobs opacos. No hay cabeceras,
//      no hay nombres legibles.
//   2. Un admin del firm con acceso a la consola de R2 quiere descargar
//      documentos de un caso "ultra" sin el flujo de la app: ve blobs.
//   3. Un backup de la DB se filtra: las filas de `documents` tienen
//      storage_key y encryption_meta pero NO la master key (env-only).
//
// Modelo de amenaza que NO cubre:
//   • App server comprometido al nivel donde APP_CRYPTO_MASTER_KEY es legible
//     (logs leakeados, RCE en el servidor). Para ese caso necesitarías HSM
//     o KMS por cliente; está fuera del alcance V1.
//   • Cliente (browser) comprometido. El descifrado siempre ocurre server-side
//     y se entrega vía signed URL temporal.
//
// Algoritmo:
//   • AES-256-GCM (autenticado, no requiere HMAC adicional).
//   • Key derivation: HKDF-SHA256 con `keyId` como info parameter, master
//     key del env como IKM. Permite rotar la master sin re-cifrar todo.
//   • IV: 12 bytes aleatorios por archivo (NIST SP 800-38D §8.2.1.2).
//   • AAD: { documentId, firmId } binding criptográfico para que un blob
//     copiado entre filas falle al descifrar.
//
// Formato del ciphertext en el blob storage:
//   [version u8=1][ciphertext...][auth_tag 16 bytes]
//   IV y AAD viven en `documents.encryption_meta` (jsonb).

import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;
const VERSION_BYTE = 1;

export type EncryptionMeta = {
  v: number;
  iv: string; // base64
  aad: string; // base64 (AAD pre-image as JSON string)
  keyId: string;
};

function mustMasterKey(): Buffer {
  const raw = process.env.APP_CRYPTO_MASTER_KEY;
  if (!raw) {
    throw new Error(
      "APP_CRYPTO_MASTER_KEY missing. Generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"` " +
        "and set it in the env. ROTATING IT WILL BREAK ACCESS TO EXISTING ULTRA-CONFIDENTIAL DOCS.",
    );
  }
  // Accept base64 (>=32 bytes) or hex (>=64 chars). Strip whitespace.
  const s = raw.trim();
  let buf: Buffer;
  if (/^[a-f0-9]+$/i.test(s) && s.length >= 64) {
    buf = Buffer.from(s, "hex");
  } else {
    buf = Buffer.from(s, "base64");
  }
  if (buf.length < 32) {
    throw new Error("APP_CRYPTO_MASTER_KEY must decode to >=32 bytes.");
  }
  return buf;
}

function deriveKey(keyId: string): Buffer {
  // HKDF-SHA256(master, salt='ldp-app-layer-v1', info=keyId, length=32).
  // Salt is constant per app version; rotating it would invalidate keys.
  const master = mustMasterKey();
  const out = hkdfSync("sha256", master, "ldp-app-layer-v1", keyId, KEY_BYTES);
  return Buffer.from(out);
}

export type EncryptInput = {
  plaintext: Buffer | Uint8Array;
  documentId: string;
  firmId: string;
  keyId?: string;
};

export type EncryptResult = {
  ciphertext: Buffer; // [version][cipher...][tag]
  meta: EncryptionMeta;
};

export function encryptDocument(input: EncryptInput): EncryptResult {
  const keyId = input.keyId ?? "default";
  const key = deriveKey(keyId);
  const iv = randomBytes(IV_BYTES);
  // AAD binds the ciphertext to (firmId, documentId): a blob copied to
  // another row will fail authentication on decrypt. Keep it short and
  // deterministic.
  const aadPreimage = JSON.stringify({
    f: input.firmId,
    d: input.documentId,
  });
  const aad = Buffer.from(aadPreimage, "utf8");

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const plaintext = Buffer.isBuffer(input.plaintext)
    ? input.plaintext
    : Buffer.from(input.plaintext);
  const enc1 = cipher.update(plaintext);
  const enc2 = cipher.final();
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([Buffer.from([VERSION_BYTE]), enc1, enc2, tag]);

  return {
    ciphertext,
    meta: {
      v: 1,
      iv: iv.toString("base64"),
      aad: aad.toString("base64"),
      keyId,
    },
  };
}

export type DecryptInput = {
  ciphertext: Buffer | Uint8Array;
  meta: EncryptionMeta;
  documentId: string;
  firmId: string;
};

export function decryptDocument(input: DecryptInput): Buffer {
  if (input.meta.v !== 1) {
    throw new Error(`Unsupported encryption version: ${input.meta.v}`);
  }
  const key = deriveKey(input.meta.keyId);
  const iv = Buffer.from(input.meta.iv, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error("Invalid IV length in encryption_meta.");
  }
  const expectedAad = Buffer.from(
    JSON.stringify({ f: input.firmId, d: input.documentId }),
    "utf8",
  );
  const storedAad = Buffer.from(input.meta.aad, "base64");
  // Constant-time compare prevents an attacker from learning anything by
  // probing AADs (not a strong attack but cheap to defend against).
  if (
    storedAad.length !== expectedAad.length ||
    !timingSafeEqual(storedAad, expectedAad)
  ) {
    throw new Error(
      "AAD mismatch, document does not belong to this firm/document pair.",
    );
  }

  const buf = Buffer.isBuffer(input.ciphertext)
    ? input.ciphertext
    : Buffer.from(input.ciphertext);
  if (buf.length < 1 + TAG_BYTES + 1) {
    throw new Error("Ciphertext too short to be valid.");
  }
  const version = buf[0];
  if (version !== VERSION_BYTE) {
    throw new Error(`Unsupported blob version byte: ${version}`);
  }
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const body = buf.subarray(1, buf.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(storedAad);
  decipher.setAuthTag(tag);
  // If the tag check fails, `final()` throws, GCM authenticates everything.
  const dec1 = decipher.update(body);
  const dec2 = decipher.final();
  return Buffer.concat([dec1, dec2]);
}

// Smoke test helper, useful in tests and CLI tools to verify the master key
// is configured correctly without touching real data.
export function selfTest(): { ok: true; bytesRoundtrip: number } {
  const sample = Buffer.from("LDP cifrado app-layer OK", "utf8");
  const { ciphertext, meta } = encryptDocument({
    plaintext: sample,
    documentId: "00000000-0000-0000-0000-000000000000",
    firmId: "00000000-0000-0000-0000-000000000000",
  });
  const out = decryptDocument({
    ciphertext,
    meta,
    documentId: "00000000-0000-0000-0000-000000000000",
    firmId: "00000000-0000-0000-0000-000000000000",
  });
  if (!out.equals(sample)) throw new Error("Self-test mismatch.");
  return { ok: true, bytesRoundtrip: sample.length };
}
