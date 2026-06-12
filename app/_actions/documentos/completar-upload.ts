"use server";

// Paso 2 del flow de direct upload (Fase 7).
//
// El browser ya hizo PUT del archivo al storage (paso 1: prepararUploadAction).
// Ahora notifica al server: storageKey + metadatos. El server:
//   1. Crea el record en `documents`.
//   2. Si el archivo es <= OCR_MAX_BYTES_CLAUDE (10 MB), descarga del storage
//      y dispara OCR via after() — mismo patrón que upload.ts pre-Fase 7.
//   3. Para archivos > 10 MB marca ocr_status = "skipped" sin descargar
//      (no hay sentido en bajar 200 MB a la function solo para tirarlo).
//
// IMPORTANTE: este endpoint NO valida el contenido del archivo subido. El
// browser podría subir un archivo distinto al que declaró. Mitigación:
//   - El storageKey se generó server-side en preparar (firma de R2 garantiza
//     que solo se pudo escribir a ESE key).
//   - createDocument va a withFirm() → RLS solo permite escribir en el firm
//     del user autenticado.
//   - Para verificación de bytes/mime real, agregar un job posterior que
//     descargue, detecte magic bytes, y actualice mime + reject si difiere
//     drásticamente. Fase 7.5.

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
import { getOcr, OCR_MAX_BYTES_CLAUDE } from "@/lib/ocr";

const ScopeSchema = z.union([
  z.object({ kind: z.literal("case"), caseId: z.string().uuid() }),
  z.object({ kind: z.literal("client"), clientId: z.string().uuid() }),
  z.object({ kind: z.literal("firm") }),
]);

const InputSchema = z.object({
  scope: ScopeSchema,
  storageKey: z.string().min(1).max(500),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
  folderId: z.string().uuid().nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).default([]),
  /** Cuando es una nueva versión, apunta al doc anterior. */
  parentDocumentId: z.string().uuid().nullable().default(null),
});

export type CompletarUploadInput = z.infer<typeof InputSchema>;

export type CompletarUploadState =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

export async function completarUploadAction(
  input: CompletarUploadInput,
): Promise<CompletarUploadState> {
  const user = await requireUser();

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos de finalización inválidos." };
  }

  const data = parsed.data;

  // Si es nueva versión, heredar metadata del padre (caseId, clientId,
  // sharedWithClient, tags si no se pasaron) y incrementar version.
  let caseId: string | null =
    data.scope.kind === "case" ? data.scope.caseId : null;
  let clientId: string | null =
    data.scope.kind === "client" ? data.scope.clientId : null;
  let version = 1;
  let sharedWithClient = false;

  if (data.parentDocumentId) {
    const parent = await getDocumentById(
      user.firmId,
      user.userId,
      data.parentDocumentId,
    );
    if (!parent) {
      return {
        ok: false,
        error: "El documento original no existe o ya fue eliminado.",
      };
    }
    caseId = parent.caseId;
    clientId = parent.clientId;
    version = parent.version + 1;
    sharedWithClient = parent.sharedWithClient;
  }

  let doc;
  try {
    doc = await createDocument(user.firmId, user.userId, {
      caseId,
      clientId,
      folderId: data.folderId,
      name: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storageKey: data.storageKey,
      tags: data.tags,
      ocrStatus: "processing",
      ocrText: null,
      sharedWithClient,
      version,
      parentDocumentId: data.parentDocumentId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[completarUploadAction] createDocument falló:", msg);
    return { ok: false, error: `No se pudo registrar el documento: ${msg}` };
  }

  // OCR fire-and-forget. Para archivos > OCR_MAX_BYTES_CLAUDE no descargamos
  // ni intentamos — se marca como skipped directo. Eso evita cargar 200 MB
  // a memoria de la function solo para tirarlo.
  const userId = user.userId;
  const firmId = user.firmId;
  const docId = doc.id;
  const docMime = doc.mimeType;
  const docName = doc.name;
  const docSize = doc.sizeBytes;
  const docStorageKey = doc.storageKey;

  if (docSize > OCR_MAX_BYTES_CLAUDE) {
    after(async () => {
      await updateDocumentOcr(firmId, userId, docId, {
        ocrStatus: "skipped",
      });
    });
  } else {
    after(async () => {
      try {
        // Descargar bytes del storage para correr OCR.
        const storage = getStorage();
        const bytes = await storage.get(docStorageKey);
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
          await updateDocumentOcr(firmId, userId, docId, {
            ocrStatus: "skipped",
          });
        } else {
          await updateDocumentOcr(firmId, userId, docId, {
            ocrStatus: "failed",
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[OCR direct-upload] doc ${docId} uncaught:`, msg);
        await updateDocumentOcr(firmId, userId, docId, {
          ocrStatus: "failed",
        });
      }
    });
  }

  // Revalidate path(s) donde podría aparecer este doc.
  revalidatePath("/documentos");
  if (caseId) revalidatePath(`/casos/${caseId}`);
  if (clientId) revalidatePath(`/clientes/${clientId}`);

  return { ok: true, documentId: doc.id };
}
