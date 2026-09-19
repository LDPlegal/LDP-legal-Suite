import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import {
  cases,
  clients,
  documents,
  folders,
  users,
  type Document,
  type NewDocument,
} from "../schema";
import type { DocumentListRow } from "@/lib/documents/format";

// DocumentListRow / formatBytes / OCR_STATUS_LABEL live in lib/documents/format.ts
// so client components can import them without dragging the pg driver in.
export type { DocumentListRow } from "@/lib/documents/format";
export { formatBytes, OCR_STATUS_LABEL } from "@/lib/documents/format";

// Filtro de visibilidad interna (Fase 13). Un documento es visible para el
// usuario si es del equipo (visibility='case') o si lo subió él mismo
// (los privados solo los ve su dueño). RLS ya garantiza el scope del firm;
// esto agrega la capa de privacidad INTRA-equipo.
function visibleToUser(userId: string) {
  return or(
    eq(documents.visibility, "case"),
    eq(documents.uploadedBy, userId),
  );
}

// Global document listing across all visible cases. Powers /documentos.
// Search hits document name, tags (joined with comma), AND ocr_text when
// available, OCR was decided to be real in F2 (§9.7) so a search for
// "demanda 2024" actually finds the scanned PDF.
export type GlobalDocumentRow = DocumentListRow & {
  caseId: string | null;
  caseCode: string | null;
  caseTitle: string | null;
  ocrTextSnippet: string | null;
  // Contexto de carpeta, para que en búsqueda el user sepa DÓNDE está el
  // doc. folderName null = está en la raíz del scope.
  folderId: string | null;
  folderName: string | null;
  folderPath: string | null;
};

export async function listAllDocuments(
  firmId: string,
  userId: string,
  opts: {
    search?: string;
    caseId?: string;
    onlyShared?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ rows: GlobalDocumentRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const term = opts.search?.trim() ?? "";

  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(documents.deletedAt), visibleToUser(userId)];
    if (opts.caseId) conds.push(eq(documents.caseId, opts.caseId));
    if (opts.onlyShared) conds.push(eq(documents.sharedWithClient, true));
    if (term) {
      const like = `%${term}%`;
      const search = or(
        ilike(documents.name, like),
        ilike(documents.ocrText, like),
        sql`array_to_string(${documents.tags}, ',') ILIKE ${like}`,
        // Buscar también por caso (código y título), útil cuando el user
        // recuerda el caso pero no el nombre del doc.
        ilike(cases.code, like),
        ilike(cases.title, like),
        // Buscar por cliente, "todos los docs del cliente Pérez"
        ilike(clients.displayName, like),
        // Por nombre del subidor
        ilike(users.name, like),
      );
      if (search) conds.push(search);
    }

    const where = and(...conds);

    const [rows, totalRow] = await Promise.all([
      tx
        .select({
          id: documents.id,
          name: documents.name,
          mimeType: documents.mimeType,
          sizeBytes: documents.sizeBytes,
          storageKey: documents.storageKey,
          tags: documents.tags,
          ocrStatus: documents.ocrStatus,
          version: documents.version,
          parentDocumentId: documents.parentDocumentId,
          uploadedById: documents.uploadedBy,
          uploadedByName: users.name,
          sharedWithClient: documents.sharedWithClient,
          visibility: documents.visibility,
          createdAt: documents.createdAt,
          caseId: documents.caseId,
          caseCode: cases.code,
          caseTitle: cases.title,
          folderId: documents.folderId,
          folderName: folders.name,
          folderPath: folders.path,
          // Truncated context around the search term, best-effort, just
          // takes the first 200 chars when there's a hit on ocr_text.
          ocrTextSnippet: term
            ? sql<string | null>`CASE WHEN ${documents.ocrText} ILIKE ${`%${term}%`} THEN substring(${documents.ocrText} FROM 1 FOR 200) ELSE NULL END`
            : sql<string | null>`NULL::text`,
        })
        .from(documents)
        .leftJoin(users, eq(users.id, documents.uploadedBy))
        .leftJoin(cases, eq(cases.id, documents.caseId))
        .leftJoin(clients, eq(clients.id, cases.clientId))
        .leftJoin(folders, eq(folders.id, documents.folderId))
        .where(where)
        .orderBy(desc(documents.createdAt))
        .limit(limit)
        .offset(offset),
      // El count también necesita los mismos joins para que los ilike de
      // cases/clients/users en search no fallen con "missing FROM-clause".
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .leftJoin(users, eq(users.id, documents.uploadedBy))
        .leftJoin(cases, eq(cases.id, documents.caseId))
        .leftJoin(clients, eq(clients.id, cases.clientId))
        .where(where),
    ]);

    return {
      rows: rows as GlobalDocumentRow[],
      total: totalRow[0]?.count ?? 0,
    };
  });
}

export async function listDocumentsForCase(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<DocumentListRow[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        storageKey: documents.storageKey,
        tags: documents.tags,
        ocrStatus: documents.ocrStatus,
        version: documents.version,
        parentDocumentId: documents.parentDocumentId,
        uploadedById: documents.uploadedBy,
        uploadedByName: users.name,
        sharedWithClient: documents.sharedWithClient,
        visibility: documents.visibility,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(users, eq(users.id, documents.uploadedBy))
      .where(
        and(
          eq(documents.caseId, caseId),
          isNull(documents.deletedAt),
          visibleToUser(userId),
        ),
      )
      .orderBy(desc(documents.createdAt));
  });
}

export async function getDocumentById(
  firmId: string,
  userId: string,
  documentId: string,
): Promise<Document | null> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          isNull(documents.deletedAt),
          // Seguridad: un documento privado de OTRO usuario devuelve null
          // (como si no existiera), protege download, preview, edit, delete.
          visibleToUser(userId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function createDocument(
  firmId: string,
  userId: string,
  data: Omit<NewDocument, "firmId" | "uploadedBy" | "id" | "createdAt" | "updatedAt" | "deletedAt">,
): Promise<Document> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({ ...data, firmId, uploadedBy: userId })
      .returning();
    if (!row) throw new Error("createDocument: insert returned no row");
    return row;
  });
}

export async function updateDocumentOcr(
  firmId: string,
  userId: string,
  documentId: string,
  patch: { ocrStatus: Document["ocrStatus"]; ocrText?: string | null },
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(documents)
      .set({
        ocrStatus: patch.ocrStatus,
        ocrText: patch.ocrText ?? null,
        // El texto cambió → el formato IA cacheado ya no corresponde. Se
        // regenera la próxima vez que se abra el preview.
        formattedMarkdown: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  });
}

/** Actualiza metadata "fija" del documento (nombre + mime). Útil después
 *  de re-detectar el tipo real con magic bytes en docs viejos cuyo mime
 *  era "application/octet-stream". */
export async function updateDocumentMetadata(
  firmId: string,
  userId: string,
  documentId: string,
  patch: { name?: string; mimeType?: string },
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name) setData.name = patch.name;
    if (patch.mimeType) setData.mimeType = patch.mimeType;
    await tx
      .update(documents)
      .set(setData)
      .where(eq(documents.id, documentId));
  });
}

/** Lista todos los documentos del firm cuyo OCR no está "done", usado por
 *  la acción bulk de re-procesamiento. Incluye los marcados como
 *  "processing" que llevan demasiado tiempo (limbo). */
export async function listDocumentsNeedingOcr(
  firmId: string,
  userId: string,
  opts: { limit?: number } = {},
): Promise<Document[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(documents)
      .where(
        and(
          isNull(documents.deletedAt),
          // Cualquier estado distinto de "done", usamos NOT EQ porque
          // ocrStatus es un enum, no SQL string.
          sql`${documents.ocrStatus} != 'done'`,
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(limit);
  });
}

export async function renameDocument(
  firmId: string,
  userId: string,
  documentId: string,
  data: { name: string; tags: string[] },
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(documents)
      .set({
        name: data.name,
        tags: data.tags,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .returning({ id: documents.id });
    return !!row;
  });
}

export async function softDeleteDocument(
  firmId: string,
  userId: string,
  documentId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .returning({ id: documents.id });
    return !!row;
  });
}

/**
 * Lista docs soft-deleted del firm (papelera). RLS filtra por firm via withFirm.
 */
export async function listDeletedDocuments(
  firmId: string,
  userId: string,
): Promise<Document[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(documents)
      .where(sql`${documents.deletedAt} IS NOT NULL`)
      .orderBy(desc(documents.deletedAt));
  });
}

export async function restoreDocument(
  firmId: string,
  userId: string,
  documentId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(documents)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), sql`${documents.deletedAt} IS NOT NULL`))
      .returning({ id: documents.id });
    return !!row;
  });
}

/**
 * Hard delete del documento. NO borra del storage, el archivo en R2/S3
 * queda huérfano. Si se quiere también limpiar storage, hay que llamar
 * storage.remove(storageKey) ANTES (lo hace la action).
 */
export async function hardDeleteDocument(
  firmId: string,
  userId: string,
  documentId: string,
): Promise<{ ok: boolean; storageKey?: string }> {
  return withFirm(firmId, userId, async (tx) => {
    // Necesitamos el storageKey para que la action lo borre del bucket.
    const [doc] = await tx
      .select({ storageKey: documents.storageKey })
      .from(documents)
      .where(and(eq(documents.id, documentId), sql`${documents.deletedAt} IS NOT NULL`))
      .limit(1);
    if (!doc) return { ok: false };

    await tx.delete(documents).where(eq(documents.id, documentId));
    return { ok: true, storageKey: doc.storageKey };
  });
}

// Toggle whether a document is visible in the client's portal. Idempotent:
// passing the same value as the current one is a no-op write.
export async function setDocumentSharedWithClient(
  firmId: string,
  userId: string,
  documentId: string,
  shared: boolean,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(documents)
      .set({ sharedWithClient: shared, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .returning({ id: documents.id, caseId: documents.caseId });
    return !!row;
  });
}

// Guarda el Markdown formateado por IA en la caché del documento. adminDb:
// se llama desde la action de formateo que ya validó acceso via getDocumentById.
export async function cacheDocumentFormattedMarkdown(
  firmId: string,
  userId: string,
  documentId: string,
  markdown: string,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(documents)
      .set({ formattedMarkdown: markdown })
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));
  });
}

// Cambia la visibilidad interna de un documento (Fase 13/UX). Solo el
// dueño (uploaded_by) puede moverlo a/desde su carpeta privada, mover el
// privado de otro no tiene sentido y visibleToUser ya lo protege en el
// lookup previo. Devuelve el caseId para revalidar.
export async function setDocumentVisibility(
  firmId: string,
  userId: string,
  documentId: string,
  visibility: "case" | "private",
): Promise<{ ok: boolean; caseId: string | null }> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(documents)
      .set({ visibility, updatedAt: new Date() })
      .where(
        and(
          eq(documents.id, documentId),
          isNull(documents.deletedAt),
          // Solo el dueño puede cambiar la visibilidad de SU documento.
          eq(documents.uploadedBy, userId),
        ),
      )
      .returning({ id: documents.id, caseId: documents.caseId });
    return { ok: !!row, caseId: row?.caseId ?? null };
  });
}

// All historical versions in the chain (including the requested one).
// `parent_document_id` points from a new version to the previous; v1 has NULL.
export async function listVersionsOf(
  firmId: string,
  userId: string,
  documentId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .execute(sql`
        WITH RECURSIVE chain AS (
          SELECT * FROM documents WHERE id = ${documentId}
          UNION ALL
          SELECT d.* FROM documents d
            JOIN chain c ON d.parent_document_id = c.id OR d.id = c.parent_document_id
        )
        SELECT id, name, version, mime_type, size_bytes, ocr_status, created_at
        FROM (SELECT DISTINCT ON (id) * FROM chain) AS s
        ORDER BY version ASC
      `);
  });
}

// formatBytes + OCR_STATUS_LABEL live in lib/documents/format.ts (re-exported above)
// so client components can import them without dragging the pg driver into the
// browser bundle.
