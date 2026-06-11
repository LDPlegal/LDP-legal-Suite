"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createDocument, updateDocumentOcr } from "@/lib/db/queries/documents";
import { getStorage } from "@/lib/storage";
import { getOcr } from "@/lib/ocr";
import {
  detectFileType,
  ensureFilenameExtension,
} from "@/lib/files/detect-type";

const Schema = z.object({
  caseId: z.string().uuid(),
  // null o ausente = raíz del caso. Cuando el user está dentro de una carpeta,
  // el cliente lo pasa para que el doc aterrice en la carpeta correcta.
  folderId: z.string().uuid().nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).default([]),
});

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB hard ceiling for sync upload

export type UploadDocumentState =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

export async function uploadDocumentAction(
  _prev: UploadDocumentState | undefined,
  formData: FormData,
): Promise<UploadDocumentState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Adjunta un archivo." };
  }
  if (file.size === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo en Fase 2: 25 MB.`,
    };
  }

  const tagsRaw = formData.get("tags");
  const tags =
    typeof tagsRaw === "string" && tagsRaw.trim()
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

  const folderIdRaw = formData.get("folderId");
  const folderId =
    typeof folderIdRaw === "string" && folderIdRaw.trim() ? folderIdRaw.trim() : null;
  const parsed = Schema.safeParse({
    caseId: formData.get("caseId"),
    folderId,
    tags,
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // ── DETECTAR TIPO REAL POR MAGIC BYTES ──
  // file.type del browser miente para archivos sin extensión (devuelve
  // "application/octet-stream"). Acá leemos los primeros bytes para saber
  // qué es REALMENTE — la diferencia entre "el OCR funciona" y "el OCR
  // silenciosamente skipea todo".
  const detected = await detectFileType(bytes, file.type || null, file.name);
  const realMime = detected.mimeType;
  // Si el browser/usuario no le pusieron extensión, le ponemos la correcta
  // — así el download es usable (el SO sabe con qué abrirlo).
  const finalFilename = ensureFilenameExtension(file.name, detected);

  const storage = getStorage();
  const key = storage.buildKey({
    firmId: user.firmId,
    scope: "documents",
    entityId: parsed.data.caseId,
    filename: finalFilename,
  });
  await storage.put(key, bytes, realMime);

  const doc = await createDocument(user.firmId, user.userId, {
    caseId: parsed.data.caseId,
    folderId: parsed.data.folderId,
    name: finalFilename,
    mimeType: realMime,
    sizeBytes: file.size,
    storageKey: key,
    tags: parsed.data.tags,
    ocrStatus: "processing",
    version: 1,
    parentDocumentId: null,
    clientId: null,
    ocrText: null,
  });

  // Fire-and-forget OCR via `after()`. The response goes back to the browser
  // as soon as the upload + insert finish. tesseract.js downloads ~30 MB of
  // language data on first run (5-60s) — blocking the action on it made the
  // UI hang. Now the doc appears with ocrStatus="processing" and updates to
  // "done" / "skipped" / "failed" once the worker finishes (refresh to see).
  const userId = user.userId;
  const firmId = user.firmId;
  const docMime = doc.mimeType;
  const docName = doc.name;
  const docSize = doc.sizeBytes;
  after(async () => {
    try {
      const ocr = await getOcr();
      const result = await ocr.recognize({
        mimeType: docMime,
        bytes,
        sizeBytes: docSize,
        filename: docName,
        firmId,
        userId,
      });
      if (result.status === "done") {
        console.log(
          `[OCR] doc ${doc.id} extracted ${result.text.length} chars via ${result.method ?? "?"}`,
        );
        await updateDocumentOcr(firmId, userId, doc.id, {
          ocrStatus: "done",
          ocrText: result.text,
        });
      } else if (result.status === "skipped") {
        console.log(`[OCR] doc ${doc.id} skipped: ${result.reason}`);
        await updateDocumentOcr(firmId, userId, doc.id, { ocrStatus: "skipped" });
      } else {
        console.error(`[OCR] doc ${doc.id} failed: ${result.reason}`);
        await updateDocumentOcr(firmId, userId, doc.id, { ocrStatus: "failed" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[OCR] doc ${doc.id} uncaught exception:`, msg);
      await updateDocumentOcr(firmId, userId, doc.id, {
        ocrStatus: "failed",
      });
    }
  });

  revalidatePath(`/casos/${parsed.data.caseId}`);
  return { ok: true, documentId: doc.id };
}
