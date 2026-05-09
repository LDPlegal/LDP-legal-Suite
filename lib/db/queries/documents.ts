import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import {
  documents,
  users,
  type Document,
  type NewDocument,
} from "../schema";
import type { DocumentListRow } from "@/lib/documents/format";

// DocumentListRow / formatBytes / OCR_STATUS_LABEL live in lib/documents/format.ts
// so client components can import them without dragging the pg driver in.
export type { DocumentListRow } from "@/lib/documents/format";
export { formatBytes, OCR_STATUS_LABEL } from "@/lib/documents/format";

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
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(users, eq(users.id, documents.uploadedBy))
      .where(
        and(
          eq(documents.caseId, caseId),
          isNull(documents.deletedAt),
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
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
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
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
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
