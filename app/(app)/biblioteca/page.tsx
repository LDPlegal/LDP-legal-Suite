import Link from "next/link";
import { Library, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/ai";
import {
  ensureLibraryRootFolder,
  getFolderBreadcrumb,
  getFolderById,
  listDocumentsInFolder,
  listFolderChildren,
} from "@/lib/db/queries/folders";
import { FolderBrowser } from "@/app/(app)/documentos/_components/folder-browser";
import { UploadFolderButton } from "@/app/(app)/documentos/_components/upload-folder-button";
import { DocumentUploadGlobalDrawer } from "@/app/(app)/documentos/_components/document-upload-global-drawer";

export const metadata = { title: "Biblioteca · LDP Legal Suite" };

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = { kind: "firm" as const };

  const libraryRoot = await ensureLibraryRootFolder(user.firmId, user.userId);

  const folderId = sp.folder ?? libraryRoot.id;

  const [breadcrumb, folderChildren, docsInFolder] = await Promise.all([
    getFolderBreadcrumb(user.firmId, user.userId, folderId),
    listFolderChildren(user.firmId, user.userId, folderId, scope),
    listDocumentsInFolder(user.firmId, user.userId, folderId, scope),
  ]);

  const currentFolder = await getFolderById(user.firmId, user.userId, folderId);

  const breadcrumbForBrowser = breadcrumb
    .filter((b) => b.id !== libraryRoot.id)
    .map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Archivo"
        title="Biblioteca"
        description="Espacio compartido de la firma, leyes, libros, plantillas y material de referencia para todos los miembros."
      >
        <UploadFolderButton parentFolderId={folderId} scope={scope} />
        <DocumentUploadGlobalDrawer
          folderId={folderId}
          trigger={
            <Button id="upload-biblioteca-doc-btn">
              <Upload className="mr-2 h-4 w-4" />
              Subir documento
            </Button>
          }
        />
      </PageHeader>

      {!currentFolder ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          La carpeta no existe o ya fue eliminada.{" "}
          <Link href="/biblioteca" className="underline">
            Volver a la raíz
          </Link>
          .
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Library className="h-4 w-4 flex-none text-primary" />
            <span>
              <strong className="font-medium text-foreground">Espacio compartido</strong>,
              visible para toda la firma.
            </span>
          </div>
          <FolderBrowser
            basePath="/biblioteca"
            breadcrumb={breadcrumbForBrowser}
            folders={folderChildren.map((f) => ({ id: f.id, name: f.name }))}
            documents={docsInFolder.map((d) => ({
              id: d.id,
              name: d.name,
              mimeType: d.mimeType,
              sizeBytes: d.sizeBytes,
              tags: d.tags,
              ocrStatus: d.ocrStatus,
              version: d.version,
              sharedWithClient: d.sharedWithClient,
              createdAt: d.createdAt,
              caseId: d.caseId,
              clientId: d.clientId,
            }))}
            aiEnabled={isAiEnabled()}
            scope={scope}
            currentFolderId={folderId}
          />
        </div>
      )}
    </div>
  );
}
