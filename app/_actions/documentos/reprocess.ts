"use server";

// Re-procesar OCR de documentos YA SUBIDOS.
//
// Por qué existe: los documentos subidos antes de v0.23 (cuando agregamos
// magic-byte detection) tienen mime "application/octet-stream" porque el
// browser no detectó el tipo. El nuevo pipeline de OCR detecta el tipo
// real al re-procesar, y de paso corrige el mime + filename del doc para
// que el download funcione.
//
// Dos modos:
//   reprocessOneDocAction(docId)      , un solo doc, sync (~5-30s)
//   reprocessAllPendingDocsAction()   , bulk, hasta 10 docs por llamada
//                                        (límite para fit en 60s de Vercel)

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  getDocumentById,
  listDocumentsNeedingOcr,
  updateDocumentMetadata,
  updateDocumentOcr,
} from "@/lib/db/queries/documents";
import { getStorage } from "@/lib/storage";
import { getOcr } from "@/lib/ocr";
import {
  detectFileType,
  ensureFilenameExtension,
} from "@/lib/files/detect-type";

const BULK_MAX_DOCS_PER_CALL = 10;

export type ReprocessOneState =
  | {
      ok: true;
      docId: string;
      docName: string;
      ocrStatus: "done" | "skipped" | "failed";
      mimeChanged: boolean;
      nameChanged: boolean;
      method?: string;
      reason?: string;
      textChars?: number;
    }
  | { ok: false; error: string };

export type ReprocessResultItem = {
  docId: string;
  docName: string;
  status: "done" | "skipped" | "failed";
  method?: string;
  reason?: string;
};

export type ReprocessBulkState =
  | {
      ok: true;
      processed: number;
      done: number;
      skipped: number;
      failed: number;
      remaining: number; // cuántos quedan pendientes después de este lote
      results: ReprocessResultItem[];
    }
  | { ok: false; error: string };

/** Re-procesa OCR de un solo documento. Sync, el caller espera la respuesta. */
export async function reprocessOneDocAction(
  docId: string,
): Promise<ReprocessOneState> {
  const user = await requireUser();
  const doc = await getDocumentById(user.firmId, user.userId, docId);
  if (!doc) return { ok: false, error: "Documento no encontrado." };

  const storage = getStorage();
  let bytes: Uint8Array;
  try {
    bytes = await storage.get(doc.storageKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `No se pudo leer el archivo del bucket: ${msg.slice(0, 200)}`,
    };
  }

  // Re-detectar tipo + corregir filename
  const detected = await detectFileType(bytes, doc.mimeType, doc.name);
  const realMime = detected.mimeType;
  const fixedName = ensureFilenameExtension(doc.name, detected);

  const mimeChanged = realMime !== doc.mimeType;
  const nameChanged = fixedName !== doc.name;

  if (mimeChanged || nameChanged) {
    await updateDocumentMetadata(user.firmId, user.userId, doc.id, {
      mimeType: mimeChanged ? realMime : undefined,
      name: nameChanged ? fixedName : undefined,
    });
  }

  // Marca como "processing" para que la UI lo refleje mientras corre OCR.
  await updateDocumentOcr(user.firmId, user.userId, doc.id, {
    ocrStatus: "processing",
    ocrText: null,
  });

  const ocr = await getOcr();
  let result;
  try {
    result = await ocr.recognize({
      mimeType: realMime,
      bytes,
      sizeBytes: bytes.byteLength,
      filename: fixedName,
      firmId: user.firmId,
      userId: user.userId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateDocumentOcr(user.firmId, user.userId, doc.id, {
      ocrStatus: "failed",
    });
    return {
      ok: false,
      error: `OCR falló con excepción: ${msg.slice(0, 200)}`,
    };
  }

  if (result.status === "done") {
    await updateDocumentOcr(user.firmId, user.userId, doc.id, {
      ocrStatus: "done",
      ocrText: result.text,
    });
  } else if (result.status === "skipped") {
    await updateDocumentOcr(user.firmId, user.userId, doc.id, {
      ocrStatus: "skipped",
    });
  } else {
    await updateDocumentOcr(user.firmId, user.userId, doc.id, {
      ocrStatus: "failed",
    });
  }

  revalidatePath("/documentos");
  if (doc.caseId) revalidatePath(`/casos/${doc.caseId}`);

  return {
    ok: true,
    docId: doc.id,
    docName: fixedName,
    ocrStatus: result.status,
    mimeChanged,
    nameChanged,
    method: result.status === "done" ? result.method : undefined,
    reason:
      result.status === "skipped" || result.status === "failed"
        ? result.reason
        : undefined,
    textChars: result.status === "done" ? result.text.length : undefined,
  };
}

/** Re-procesa hasta BULK_MAX_DOCS_PER_CALL documentos que NO estén en estado
 *  "done". Devuelve un resumen. Si quedan más, el caller puede llamar de
 *  nuevo (la lista se re-construye cada vez). */
export async function reprocessAllPendingDocsAction(): Promise<ReprocessBulkState> {
  const user = await requireUser();

  // Necesitamos primero saber CUÁNTOS hay pendientes (para reportar remaining).
  // listDocumentsNeedingOcr ya tiene un cap pero podemos pedir más para contar.
  const allPending = await listDocumentsNeedingOcr(user.firmId, user.userId, {
    limit: 200,
  });

  if (allPending.length === 0) {
    return {
      ok: true,
      processed: 0,
      done: 0,
      skipped: 0,
      failed: 0,
      remaining: 0,
      results: [],
    };
  }

  const batch = allPending.slice(0, BULK_MAX_DOCS_PER_CALL);
  const results: ReprocessResultItem[] = [];
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of batch) {
    const r = await reprocessOneDocAction(doc.id);
    if (r.ok) {
      results.push({
        docId: r.docId,
        docName: r.docName,
        status: r.ocrStatus,
        method: r.method,
        reason: r.reason,
      });
      if (r.ocrStatus === "done") done++;
      else if (r.ocrStatus === "skipped") skipped++;
      else failed++;
    } else {
      results.push({
        docId: doc.id,
        docName: doc.name,
        status: "failed",
        reason: r.error,
      });
      failed++;
    }
  }

  return {
    ok: true,
    processed: batch.length,
    done,
    skipped,
    failed,
    remaining: Math.max(allPending.length - batch.length, 0),
    results,
  };
}
