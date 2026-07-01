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
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";

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
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  folderId: z.string().uuid().nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).default([]),
  /** Cuando es una nueva versión, apunta al doc anterior. */
  parentDocumentId: z.string().uuid().nullable().default(null),
  /** Visibilidad interna (Fase 13). 'case' = equipo, 'private' = solo yo. */
  visibility: z.enum(["case", "private"]).default("case"),
});

export type CompletarUploadInput = z.infer<typeof InputSchema>;

export type CompletarUploadState =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

export async function completarUploadAction(
  input: CompletarUploadInput,
): Promise<CompletarUploadState> {
  try {
    return await completarUploadInner(input);
  } catch (err) {
    // Safety net: cualquier error inesperado se devuelve como toast claro
    // en vez de propagar al React tree como "server-side exception".
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[completarUploadAction] uncaught:", msg);
    return { ok: false, error: `Error inesperado: ${msg}` };
  }
}

async function completarUploadInner(
  input: CompletarUploadInput,
): Promise<CompletarUploadState> {
  const user = await requireUser();

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos de finalización inválidos." };
  }

  const data = parsed.data;

  // ── Verificación post-upload (F7.4) ──
  // El cliente declaró sizeBytes en preparar-upload, pero el PUT va directo
  // al storage sin pasar por el server. Verificamos que el objeto realmente
  // existe y que su tamaño coincide razonablemente con lo declarado. Esto
  // ataca: (a) "completar" sin haber subido nada, (b) declarar 1 MB y subir
  // 500 MB para evadir el cap. El storageKey lo generó el server en
  // preparar, así que no hay riesgo de apuntar a un objeto ajeno.
  try {
    const head = await getStorage().head(data.storageKey);
    if (!head) {
      return {
        ok: false,
        error:
          "El archivo no llegó al storage. Reintentá la subida (puede ser CORS o conexión).",
      };
    }
    // Tolerancia: algunos backends reportan tamaños con padding mínimo.
    // Si el real excede el declarado en >1% (y por más de 1 KB), rechazamos.
    const declared = data.sizeBytes;
    const real = head.sizeBytes;
    const drift = Math.abs(real - declared);
    if (drift > 1024 && drift > declared * 0.01) {
      // Limpiamos el objeto huérfano — no quedó ningún record apuntándolo.
      try {
        await getStorage().remove(data.storageKey);
      } catch {
        // best-effort
      }
      return {
        ok: false,
        error: `El tamaño subido (${(real / 1024 / 1024).toFixed(1)} MB) no coincide con lo declarado (${(declared / 1024 / 1024).toFixed(1)} MB). Subida rechazada.`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[completarUpload] head() falló:", msg);
    // Si el head falla por un problema transitorio del storage, NO bloqueamos
    // el upload — preferimos registrar el doc (el OCR/preview lo validarán
    // después). Solo logueamos.
  }

  // Si es nueva versión, heredar metadata del padre (caseId, clientId,
  // sharedWithClient, tags si no se pasaron) y incrementar version.
  let caseId: string | null =
    data.scope.kind === "case" ? data.scope.caseId : null;
  let clientId: string | null =
    data.scope.kind === "client" ? data.scope.clientId : null;
  let version = 1;
  let sharedWithClient = false;
  // Visibilidad: para uploads nuevos, lo que eligió el usuario. Para nuevas
  // versiones, hereda del padre (no tendría sentido que v2 sea de equipo si
  // v1 era privada).
  let visibility: "case" | "private" = data.visibility;

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
    visibility = parent.visibility;
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
      visibility,
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
