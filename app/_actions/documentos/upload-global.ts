"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createDocument, updateDocumentOcr } from "@/lib/db/queries/documents";
import { getStorage } from "@/lib/storage";
import { getOcr } from "@/lib/ocr";

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

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const storage = getStorage();
  const key = storage.buildKey({
    firmId: user.firmId,
    scope: "documents",
    entityId: parsed.data.caseId ?? "general",
    filename: file.name,
  });
  await storage.put(key, bytes, file.type || "application/octet-stream");

  const doc = await createDocument(user.firmId, user.userId, {
    caseId: parsed.data.caseId ?? null,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
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
  after(async () => {
    try {
      const ocr = await getOcr();
      const result = await ocr.recognize({
        mimeType: doc.mimeType,
        bytes,
        sizeBytes: doc.sizeBytes,
      });
      if (result.status === "done") {
        await updateDocumentOcr(firmId, userId, doc.id, {
          ocrStatus: "done",
          ocrText: result.text,
        });
      } else if (result.status === "skipped") {
        await updateDocumentOcr(firmId, userId, doc.id, { ocrStatus: "skipped" });
      } else {
        await updateDocumentOcr(firmId, userId, doc.id, { ocrStatus: "failed" });
      }
    } catch {
      await updateDocumentOcr(firmId, userId, doc.id, { ocrStatus: "failed" });
    }
  });

  revalidatePath("/documentos");
  if (parsed.data.caseId) {
    revalidatePath(`/casos/${parsed.data.caseId}`);
  }
  return { ok: true, documentId: doc.id };
}
