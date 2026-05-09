// Pure helpers + types for documents UI. Importing this from a client
// component (e.g. document-row.tsx) does NOT pull in lib/db/queries/* and
// thus does NOT drag the `pg` driver into the browser bundle. The DB-aware
// helpers in lib/db/queries/documents.ts re-export from here for backwards
// compat.

export type DocumentListRow = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  tags: string[];
  ocrStatus: "pending" | "processing" | "done" | "failed" | "skipped";
  version: number;
  parentDocumentId: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  // Portal Cliente (Fase 4): true if this doc appears in /portal/documentos
  // for the case's client.
  sharedWithClient: boolean;
  createdAt: Date;
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const OCR_STATUS_LABEL: Record<DocumentListRow["ocrStatus"], string> = {
  pending: "Pendiente",
  processing: "Procesando",
  done: "Indexado",
  failed: "Falló",
  skipped: "Sin OCR",
};
