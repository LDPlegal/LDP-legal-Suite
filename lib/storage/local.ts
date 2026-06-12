// lib/storage/local.ts
//
// Local-filesystem implementation of StorageProvider. Used in dev. The
// STORAGE_ROOT env var (default `./storage`) is the bucket equivalent.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PresignedPut, StorageProvider } from "./index";

/**
 * Para dev queremos ejercitar el mismo 2-step flow que prod (browser → presigned
 * URL → storage). Como no hay un servicio remoto, firmamos un token con HMAC
 * usando el secret de better-auth y lo emitimos como query string. El endpoint
 * `/api/uploads/local` verifica el token antes de aceptar el PUT.
 *
 * Exportamos el verificador para que el route handler lo importe.
 */
function getSigningSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) {
    throw new Error(
      "BETTER_AUTH_SECRET no está set — necesario para firmar uploads locales.",
    );
  }
  return s;
}

function signKey(key: string, expiresAt: number): string {
  const payload = `${key}:${expiresAt}`;
  return createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
}

export function verifyLocalUploadToken(
  key: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) return false;
  const expected = signKey(key, expiresAt);
  // timingSafeEqual exige Buffers del mismo length.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sanitizeFilename(name: string): string {
  // Strip path separators and parent traversal; keep extension.
  const base = name.replace(/[\\/]/g, "_").replace(/\.{2,}/g, "_");
  // Keep alphanumerics, dot, dash, underscore. Replace anything else with _.
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
}

export class LocalStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  buildKey(parts: {
    firmId: string;
    scope: "documents" | "invoices" | "avatars" | "receipts" | "marketing";
    entityId: string;
    filename: string;
  }): string {
    const safeName = sanitizeFilename(parts.filename);
    // Prepend a short UUID-ish prefix so two uploads with the same name don't collide.
    const prefix = crypto.randomUUID().slice(0, 8);
    return [parts.firmId, parts.scope, parts.entityId, `${prefix}-${safeName}`].join("/");
  }

  private absoluteFor(key: string): string {
    // Defensive: forbid absolute keys / parent traversal.
    if (key.includes("..") || path.isAbsolute(key)) {
      throw new Error(`LocalStorage: refusing unsafe key "${key}"`);
    }
    return path.join(this.root, key);
  }

  async put(key: string, data: Uint8Array | Buffer, _mimeType: string): Promise<string> {
    const abs = this.absoluteFor(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
    return key;
  }

  async get(key: string): Promise<Uint8Array> {
    const abs = this.absoluteFor(key);
    const buf = await fs.readFile(abs);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  async remove(key: string): Promise<void> {
    const abs = this.absoluteFor(key);
    try {
      await fs.unlink(abs);
    } catch (e: unknown) {
      // ENOENT is fine; bubble up everything else.
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw e;
    }
  }

  async presignedPut(
    key: string,
    contentType: string,
    _sizeBytes: number,
    expiresInSeconds = 15 * 60,
  ): Promise<PresignedPut> {
    // En dev, el browser hace PUT al endpoint local `/api/uploads/local` con
    // el key + firma como query string. La firma es HMAC-SHA256(BETTER_AUTH_SECRET,
    // "${key}:${expiresAt}"). El endpoint verifica antes de aceptar el body.
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const sig = signKey(key, expiresAt);
    const qs = new URLSearchParams({
      key,
      exp: String(expiresAt),
      sig,
    });
    return {
      uploadUrl: `/api/uploads/local?${qs.toString()}`,
      requiredHeaders: { "Content-Type": contentType },
      expiresAt: new Date(expiresAt),
    };
  }
}
