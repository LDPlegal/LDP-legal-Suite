// lib/storage/local.ts
//
// Local-filesystem implementation of StorageProvider. Used in dev. The
// STORAGE_ROOT env var (default `./storage`) is the bucket equivalent.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageProvider } from "./index";

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
}
