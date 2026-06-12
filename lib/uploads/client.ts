"use client";

// Helper client-side para hacer un upload directo en dos pasos.
//
//   1. Llamar prepararUploadAction(metadata) → presigned URL + storageKey
//   2. fetch(uploadUrl, { method: "PUT", body: file })  ← directo a R2/S3/local
//   3. Llamar completarUploadAction({ storageKey, ...metadata }) → documentId
//
// El browser nunca sube el archivo al server de Next.js — bypaso completo
// del bodySizeLimit y del memory cap de Vercel functions. Tope efectivo:
// 500 MB (cap del schema en preparar-upload), realmente limitado por la red
// del usuario.

import {
  prepararUploadAction,
  type PrepararUploadInput,
} from "@/app/_actions/documentos/preparar-upload";
import {
  completarUploadAction,
  type CompletarUploadInput,
} from "@/app/_actions/documentos/completar-upload";

export type UploadScope = PrepararUploadInput["scope"];

export type UploadResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

export type UploadFileDirectOptions = {
  scope: UploadScope;
  file: File;
  folderId?: string | null;
  tags?: string[];
  parentDocumentId?: string | null;
  /** Callback para reportar progreso (0-100). Usa XHR para tracking real. */
  onProgress?: (percent: number) => void;
};

export async function uploadFileDirect(
  opts: UploadFileDirectOptions,
): Promise<UploadResult> {
  const { scope, file, folderId, tags, parentDocumentId, onProgress } = opts;

  // El browser a veces pone file.type vacío para archivos sin extensión.
  // Fallback al genérico — el OCR re-detecta por magic bytes server-side.
  const contentType = file.type || "application/octet-stream";

  // ── Paso 1: pedir presigned URL ──
  const prep = await prepararUploadAction({
    scope,
    filename: file.name,
    contentType,
    sizeBytes: file.size,
  });
  if (!prep.ok) {
    return { ok: false, error: prep.error };
  }

  // ── Paso 2: PUT directo al storage ──
  // Usamos XHR (no fetch) porque XHR expone `upload.onprogress` que fetch
  // todavía no implementa universalmente. Necesario para mostrar barra de
  // progreso real con archivos de 100+ MB.
  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", prep.uploadUrl, true);
      for (const [k, v] of Object.entries(prep.requiredHeaders)) {
        xhr.setRequestHeader(k, v);
      }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(
            new Error(
              `Storage rechazó el upload: HTTP ${xhr.status} ${xhr.statusText}`,
            ),
          );
        }
      };
      xhr.onerror = () =>
        reject(new Error("Falló el PUT al storage (network error)."));
      xhr.ontimeout = () =>
        reject(new Error("Timeout subiendo al storage."));
      xhr.send(file);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  // ── Paso 3: completar — crea el record en DB + dispara OCR ──
  const completePayload: CompletarUploadInput = {
    scope,
    storageKey: prep.storageKey,
    filename: file.name,
    mimeType: contentType,
    sizeBytes: file.size,
    folderId: folderId ?? null,
    tags: tags ?? [],
    parentDocumentId: parentDocumentId ?? null,
  };
  const result = await completarUploadAction(completePayload);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, documentId: result.documentId };
}
