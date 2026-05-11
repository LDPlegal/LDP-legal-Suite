// lib/storage/index.ts
//
// Storage abstraction. The maestro § 1 says "S3-compatible (configurable;
// default a almacenamiento local en dev)". For Fase 2 dev we use the local
// filesystem; production self-hosting can swap in an S3 driver without
// changing call sites.
//
// Layout for the local driver:
//   <STORAGE_ROOT>/<firmId>/<entityType>/<entityId>/<filename>
//
// All paths are relative inside the bucket (or under STORAGE_ROOT) and are
// referred to as `storageKey` in the DB. The driver translates a key to an
// absolute filesystem path or to an S3 object identifier.

import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

export interface StorageProvider {
  /** Persist `data` under `key` (overwrites). Returns the canonical key. */
  put(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string>;
  /** Fetch raw bytes for `key`. Throws if missing. */
  get(key: string): Promise<Uint8Array>;
  /** Delete `key`. Idempotent — missing keys do not throw. */
  remove(key: string): Promise<void>;
  /**
   * Build a key from logical components. The driver decides path separators.
   * `filename` is sanitized inside the implementation (no `..`, no `/`).
   */
  buildKey(parts: {
    firmId: string;
    scope: "documents" | "invoices" | "avatars" | "receipts";
    entityId: string;
    filename: string;
  }): string;
}

let providerSingleton: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (providerSingleton) return providerSingleton;

  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    const root = process.env.STORAGE_ROOT ?? "./storage";
    providerSingleton = new LocalStorage(root);
  } else if (driver === "s3") {
    providerSingleton = new S3Storage();
  } else {
    throw new Error(
      `Unknown STORAGE_DRIVER='${driver}'. Use 'local' (dev) or 's3' (production with S3/R2/B2).`,
    );
  }
  return providerSingleton;
}
