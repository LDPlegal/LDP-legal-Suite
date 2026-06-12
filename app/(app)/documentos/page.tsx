import Link from "next/link";
import { Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { listAllDocuments } from "@/lib/db/queries/documents";
import {
  getFolderBreadcrumb,
  getFolderById,
  listDocumentsInFolder,
  listFolderChildren,
} from "@/lib/db/queries/folders";
import { isAiEnabled } from "@/lib/ai";
import { AiDocumentSearch } from "./_components/ai-search";
import { DocumentGlobalRow } from "./_components/document-global-row";
import { DocumentUploadGlobalDrawer } from "./_components/document-upload-global-drawer";
import { ReprocessAllButton } from "./_components/reprocess-buttons";
import { FolderBrowser } from "./_components/folder-browser";
import { NewFolderDialog } from "./_components/new-folder-dialog";
import { UploadFolderButton } from "./_components/upload-folder-button";

export const metadata = { title: "Documentos · LDP Legal Suite" };

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; shared?: string; folder?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const onlyShared = sp.shared === "1";
  const folderId = sp.folder ?? null;

  // Modo búsqueda: si el usuario buscó por texto o filtró por compartidos,
  // mostramos la tabla plana clásica con resultados. La navegación por
  // carpetas se desactiva (no hay forma natural de combinar ambos).
  const isSearchMode = q !== "" || onlyShared;

  // Modo carpetas (default): leemos folderId del query string. null = raíz.
  const scope = { kind: "firm" as const };
  const [breadcrumb, folderChildren, docsInFolder, searchResults] =
    await Promise.all([
      // Breadcrumb sólo si estamos dentro de una carpeta.
      folderId
        ? getFolderBreadcrumb(user.firmId, user.userId, folderId)
        : Promise.resolve([]),
      // Hijos del folder actual (o raíz del firm).
      isSearchMode
        ? Promise.resolve([])
        : listFolderChildren(user.firmId, user.userId, folderId, scope),
      // Docs en el folder actual.
      isSearchMode
        ? Promise.resolve([])
        : listDocumentsInFolder(user.firmId, user.userId, folderId, scope),
      // Resultados de búsqueda (cuando aplica).
      isSearchMode
        ? listAllDocuments(user.firmId, user.userId, {
            search: q || undefined,
            onlyShared,
            limit: 100,
          })
        : Promise.resolve({ rows: [], total: 0 }),
    ]);

  // Validar que el folder existe (si se accedió a uno borrado o de otro firm,
  // RLS ya lo bloqueó arriba — getFolderById extra para mensaje claro).
  const currentFolder = folderId
    ? await getFolderById(user.firmId, user.userId, folderId)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Archivo"
        title="Documentos"
        description={
          isSearchMode
            ? "Resultados de búsqueda en todo el archivo del firm (incluye OCR)."
            : "Navegá por carpetas como en el explorador de archivos. Subí archivos sueltos o carpetas enteras."
        }
        count={isSearchMode ? searchResults.total : undefined}
        countLabel={{ singular: "archivo", plural: "archivos" }}
      >
        <div className="flex items-center gap-2">
          <ReprocessAllButton />
          {!isSearchMode ? (
            <>
              <NewFolderDialog parentFolderId={folderId} scope={scope} />
              <UploadFolderButton parentFolderId={folderId} scope={scope} />
            </>
          ) : null}
          <DocumentUploadGlobalDrawer
            folderId={folderId}
            trigger={
              <Button id="upload-global-doc-btn">
                <Upload className="mr-2 h-4 w-4" />
                Subir documento
              </Button>
            }
          />
        </div>
      </PageHeader>

      {isAiEnabled() ? <AiDocumentSearch /> : null}

      <form className="flex flex-wrap items-center gap-2" action="/documentos">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, etiqueta, OCR, caso, cliente o quién lo subió…"
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="shared"
            value="1"
            defaultChecked={onlyShared}
            className="h-3.5 w-3.5"
          />
          Solo compartidos con cliente
        </label>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
        >
          Buscar
        </button>
        {isSearchMode ? (
          <Link
            href="/documentos"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Volver a carpetas
          </Link>
        ) : null}
      </form>

      {isSearchMode ? (
        <>
          <p className="text-xs text-muted-foreground">
            {searchResults.total}{" "}
            {searchResults.total === 1 ? "resultado" : "resultados"}
            {searchResults.rows.length < searchResults.total
              ? ` · mostrando los primeros ${searchResults.rows.length}`
              : ""}
          </p>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {searchResults.rows.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Sin resultados para esa búsqueda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Documento</TableHead>
                      <TableHead>Caso</TableHead>
                      <TableHead>Subido</TableHead>
                      <TableHead>Tamaño</TableHead>
                      <TableHead>OCR</TableHead>
                      <TableHead className="w-40 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.rows.map((d) => (
                      <DocumentGlobalRow
                        key={d.id}
                        doc={{
                          id: d.id,
                          name: d.name,
                          mimeType: d.mimeType,
                          sizeBytes: d.sizeBytes,
                          tags: d.tags,
                          ocrStatus: d.ocrStatus,
                          version: d.version,
                          sharedWithClient: d.sharedWithClient,
                          createdAt: d.createdAt,
                          uploadedByName: d.uploadedByName,
                          caseId: d.caseId,
                          caseCode: d.caseCode,
                          ocrTextSnippet: d.ocrTextSnippet,
                        }}
                        aiEnabled={isAiEnabled()}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : folderId && !currentFolder ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          La carpeta no existe o ya fue eliminada.{" "}
          <Link href="/documentos" className="underline">
            Volver a la raíz
          </Link>
          .
        </Card>
      ) : (
        <FolderBrowser
          basePath="/documentos"
          breadcrumb={breadcrumb.map((b) => ({ id: b.id, name: b.name }))}
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
        />
      )}
    </div>
  );
}
