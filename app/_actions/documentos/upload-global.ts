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
  caseId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).default([]),
});

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export type UploadDocumentGlobalState =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

export async function uploadDocumentGlobalAction(
  _prev: UploadDocumentGlobalState | undefined,
  formData: FormData,
): Promise<UploadDocumentGlobalState> {
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
      error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 25 MB.`,
    };
  }

  const tagsRaw = formData.get("tags");
  const tags =
    typeof tagsRaw === "string" && tagsRaw.trim()
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

  const rawCaseId = formData.get("caseId");
  const caseId =
    typeof rawCaseId === "string" && rawCaseId.trim() ? rawCaseId.trim() : null;

  const parsed = Schema.safeParse({ caseId, tags });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos." };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Magic-byte detection: el browser/sistema operativo a menudo manda
    // "application/octet-stream" para archivos sin extensión. Acá leemos los
    // primeros bytes para saber el tipo REAL — sin esto, el OCR skipea todo.
    const detected = await detectFileType(bytes, file.type || null, file.name);
    const realMime = detected.mimeType;
    const finalFilename = ensureFilenameExtension(file.name, detected);

    const storage = getStorage();
    const key = storage.buildKey({
      firmId: user.firmId,
      scope: "documents",
      entityId: parsed.data.caseId ?? "general",
      filename: finalFilename,
    });
    await storage.put(key, bytes, realMime);

    const doc = await createDocument(user.firmId, user.userId, {
      caseId: parsed.data.caseId ?? null,
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

    // Fire-and-forget OCR via `after()`.
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
            `[OCR-global] doc ${doc.id} extracted ${result.text.length} chars via ${result.method ?? "?"}`,
          );
          await updateDocumentOcr(firmId, userId, doc.id, {
            ocrStatus: "done",
            ocrText: result.text,
          });
        } else if (result.status === "skipped") {
          console.log(`[OCR-global] doc ${doc.id} skipped: ${result.reason}`);
          await updateDocumentOcr(firmId, userId, doc.id, { ocrStatus: "skipped" });
        } else {
          console.error(`[OCR-global] doc ${doc.id} failed: ${result.reason}`);
          await updateDocumentOcr(firmId, userId, doc.id, { ocrStatus: "failed" });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[OCR-global] doc ${doc.id} uncaught exception:`, msg);
        await updateDocumentOcr(firmId, userId, doc.id, {
          ocrStatus: "failed",
        });
      }
    });

    revalidatePath("/documentos");
    if (parsed.data.caseId) {
      revalidatePath(`/casos/${parsed.data.caseId}`);
    }
    return { ok: true, documentId: doc.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido al subir.";
    console.error("[uploadDocumentGlobalAction] Error:", err);
    return { ok: false, error: `Error al subir: ${message}` };
  }
}
