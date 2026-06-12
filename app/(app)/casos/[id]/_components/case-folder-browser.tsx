// Wrapper de FolderBrowser específico para la página de caso.
// Mantiene el ?tab=documentos cuando el user navega entre carpetas para que
// las Tabs del caso queden en "Documentos" después de cada click.

import { FolderBrowser } from "@/app/(app)/documentos/_components/folder-browser";
import { NewFolderDialog } from "@/app/(app)/documentos/_components/new-folder-dialog";
import { UploadFolderButton } from "@/app/(app)/documentos/_components/upload-folder-button";
import type { FolderScope } from "@/lib/db/queries/folders";

export function CaseFolderBrowser({
  caseId,
  folderId,
  breadcrumb,
  folders,
  documents,
  aiEnabled = false,
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
    createdAt: Date;
    caseId: string | null;
    clientId: string | null;
  }>;
  aiEnabled?: boolean;
}) {
  const scope: FolderScope = { kind: "case", caseId };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <NewFolderDialog parentFolderId={folderId} scope={scope} />
        <UploadFolderButton parentFolderId={folderId} scope={scope} />
      </div>
      <FolderBrowser
        basePath={`/casos/${caseId}`}
        breadcrumb={breadcrumb}
        folders={folders}
        documents={documents}
        rootLabel="Raíz del caso"
        extraParams={{ tab: "documentos" }}
        aiEnabled={aiEnabled}
      />
    </div>
  );
}
