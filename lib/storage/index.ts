// lib/storage/index.ts
//
// Storage abstraction. El maestro § 1 dice "S3-compatible (configurable;
// default a almacenamiento local en dev)". Para dev usamos filesystem local;
// producción usa S3 (AWS / R2 / Backblaze / etc).
//
// Layout para el driver local:
//   <STORAGE_ROOT>/<firmId>/<entityType>/<entityId>/<filename>
//
// Todos los paths son relativos (dentro del bucket o bajo STORAGE_ROOT) y se
// referencian como `storageKey` en la DB. El driver traduce un key a path
// absoluto del filesystem o a un object identifier en S3.
//
// NUEVO (Fase 7 — direct upload): presignedPut() devuelve una URL que el
// browser puede usar para PUT directo, evitando bodySizeLimit de Vercel.
//   - S3Storage: URL real de S3 firmada con SigV4.
//   - LocalStorage: URL a un endpoint interno con HMAC para verificar que
//     fue emitida por el server.

import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

export type PresignedPut = {
  /** URL absoluta a la que el browser hace PUT con el archivo como body. */
  uploadUrl: string;
  /** Headers obligatorios que el browser debe enviar (típicamente Content-Type). */
  requiredHeaders: Record<string, string>;
  /** Cuándo expira el URL — el cliente debe completar antes. */
  expiresAt: Date;
};

export interface StorageProvider {
  /** Persiste `data` bajo `key` (sobreescribe). Devuelve el key canónico. */
  put(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string>;
  /** Trae los bytes de `key`. Tira error si no existe. */
  get(key: string): Promise<Uint8Array>;
  /**
   * Devuelve metadata del objeto (tamaño real en bytes) sin descargar el
   * contenido. Null si el objeto no existe. Usado para verificar que un
   * direct-upload realmente subió lo que el cliente declaró.
   */
  head(key: string): Promise<{ sizeBytes: number } | null>;
  /** Borra `key`. Idempotente — keys faltantes no tiran. */
  remove(key: string): Promise<void>;
  /**
   * Genera un URL para PUT directo desde el browser. Evita que el archivo
   * pase por la Vercel function (que tiene bodySizeLimit + memory cap).
   */
  presignedPut(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSeconds?: number,
  ): Promise<PresignedPut>;
  /**
   * Construye un key desde componentes lógicos. El driver decide los
   * separadores. `filename` se sanitiza dentro del implementador (sin `..`,
   * sin `/`).
   */
  buildKey(parts: {
    firmId: string;
    scope: "documents" | "invoices" | "avatars" | "receipts" | "marketing";
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
      `Unknown STORAGE_DRIVER='${driver}'. Use 'local' (dev) or 's3' (production con S3/R2/B2).`,
    );
  }
  return providerSingleton;
}
