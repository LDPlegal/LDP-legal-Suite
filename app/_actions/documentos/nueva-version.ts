"use server";

// Sube una nueva versión de un documento existente. El esquema ya soporta
// versionado nativo: cada documento tiene `version` (int) y `parent_document_id`
// (apunta a la versión anterior). La versión 1 tiene parent NULL. Esta action
// crea una nueva fila apuntando al original, incrementando el contador.
//
// Decisiones:
//   - No se sobreescribe la v1; queda como histórico. Permite ver versiones
//     anteriores y, eventualmente, comparar (Fase 3+).
//   - El nuevo doc hereda case_id, client_id y tags del parent. El nombre
//     puede cambiar (el usuario sube un PDF distinto) — usamos el nombre
//     del archivo nuevo, no del padre.
//   - El OCR corre sobre la nueva versión (igual que un upload normal).
//   - shared_with_client se hereda del parent — si la v1 estaba compartida,
//     la v2 también lo está. El admin puede des-compartir después.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  createDocument,
  getDocumentById,
  updateDocumentOcr,
} from "@/lib/db/queries/documents";
import { getStorage } from "@/lib/storage";
import { getOcr } from "@/lib/ocr";
import {
  detectFileType,
  ensureFilenameExtension,
} from "@/lib/files/detect-type";

const Schema = z.object({
  parentDocumentId: z.string().uuid(),
});

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // mismo techo que upload normal

export type NuevaVersionState =
  | { ok: true; documentId: string; version: number }
  | { ok: false; error: string };

export async function nuevaVersionAction(
  _prev: NuevaVersionState | undefined,
  formData: FormData,
): Promise<NuevaVersionState> {
  const user = await requireUser();

  const parsed = Schema.safeParse({
    parentDocumentId: formData.get("parentDocumentId"),
  });
  if (!parsed.success) {
    return { ok: false, error: "ID de documento inválido." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Adjuntá un archivo." };
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

  // Encontrar la versión actual (la "punta" de la cadena que el usuario está
  // viendo). El parent_document_id apunta al padre directo; podríamos seguir
  // la cadena para encontrar la última versión, pero como cada nueva versión
  // se subirá contra el doc que el usuario tiene a la vista (no contra v1
  // siempre), tomamos el documento referenciado tal cual.
  const parent = await getDocumentById(user.firmId, user.userId, parsed.data.parentDocumentId);
  if (!parent) {
    return { ok: false, error: "El documento original no existe o ya fue eliminado." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Detección de tipo real igual que upload normal (los browsers a veces
  // mienten en .type — usamos magic bytes).
  const detected = await detectFileType(bytes, file.type || null, file.name);
  const realMime = detected.mimeType;
  const finalFilename = ensureFilenameExtension(file.name, detected);

  // Storage: nueva key bajo el mismo entityId (case o client) para que las
  // versiones de un mismo doc queden juntas en el filesystem.
  const storage = getStorage();
  const entityId = parent.caseId ?? parent.clientId ?? parent.firmId;
  const key = storage.buildKey({
    firmId: user.firmId,
    scope: "documents",
    entityId,
    filename: finalFilename,
  });
  await storage.put(key, bytes, realMime);

  const newDoc = await createDocument(user.firmId, user.userId, {
    caseId: parent.caseId,
    clientId: parent.clientId,
    name: finalFilename,
    mimeType: realMime,
    sizeBytes: file.size,
    storageKey: key,
    tags: parent.tags,
    ocrStatus: "processing",
    ocrText: null,
    sharedWithClient: parent.sharedWithClient,
    version: parent.version + 1,
    parentDocumentId: parent.id,
  });

  // OCR fire-and-forget, mismo patrón que upload.ts.
  const userId = user.userId;
  const firmId = user.firmId;
  const docMime = newDoc.mimeType;
  const docName = newDoc.name;
  const docSize = newDoc.sizeBytes;
  const docId = newDoc.id;
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
        await updateDocumentOcr(firmId, userId, docId, {
          ocrStatus: "done",
          ocrText: result.text,
        });
      } else if (result.status === "skipped") {
        await updateDocumentOcr(firmId, userId, docId, { ocrStatus: "skipped" });
      } else {
        await updateDocumentOcr(firmId, userId, docId, { ocrStatus: "failed" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[OCR] doc ${docId} (new version) uncaught:`, msg);
      await updateDocumentOcr(firmId, userId, docId, { ocrStatus: "failed" });
    }
  });

  revalidatePath("/documentos");
  if (parent.caseId) revalidatePath(`/casos/${parent.caseId}`);
  if (parent.clientId) revalidatePath(`/clientes/${parent.clientId}`);

  return { ok: true, documentId: newDoc.id, version: newDoc.version };
}
