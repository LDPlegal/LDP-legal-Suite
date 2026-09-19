// Wrapper de FolderBrowser específico para la página de caso.
// Mantiene el ?tab=documentos cuando el user navega entre carpetas para que
// las Tabs del caso queden en "Documentos" después de cada click.

import { FolderBrowser } from "@/app/(app)/documentos/_components/folder-browser";
import type { FolderScope } from "@/lib/db/queries/folders";

export function CaseFolderBrowser({
  caseId,
  folderId,
  breadcrumb,
  folders,
  documents,
  aiEnabled = false,
  currentUserId,
}: {
  caseId: string;
  folderId: string | null;
  breadcrumb: Array<{ id: string; name: string }>;
  folders: Array<{ id: string; name: string }>;
  documents: Array<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    tags: string[];
    ocrStatus: "pending" | "processing" | "done" | "failed" | "skipped";
    version: number;
    sharedWithClient: boolean;
    visibility: "case" | "private";
    uploadedById?: string | null;
    createdAt: Date;
    caseId: string | null;
    clientId: string | null;
  }>;
  aiEnabled?: boolean;
  currentUserId?: string;
}) {
  const scope: FolderScope = { kind: "case", caseId };

  // Los botones de subir/carpeta ahora viven en el header del tab (junto al
  // buscador), no acá, se pasan desde page.tsx a CaseDocumentsView.
  return (
    <div className="space-y-4">
      <FolderBrowser
        basePath={`/casos/${caseId}`}
        breadcrumb={breadcrumb}
        folders={folders}
        documents={documents}
        rootLabel="Raíz del caso"
        extraParams={{ tab: "documentos" }}
        aiEnabled={aiEnabled}
        scope={scope}
        currentFolderId={folderId}
        currentUserId={currentUserId}
      />
    </div>
  );
}
