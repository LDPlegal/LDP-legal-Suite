import Link from "next/link";
import { Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WithTooltip } from "@/components/ui/icon-button";
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
import { PaginationStrip } from "./_components/pagination-strip";

export const metadata = { title: "Documentos · LDP Legal Suite" };

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    shared?: string;
    folder?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const onlyShared = sp.shared === "1";
  const folderId = sp.folder ?? null;
  // Paginación — solo aplica en search mode. Page 1-indexed; default 50/page.
  const PAGE_SIZE = 50;
  const pageParam = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (page - 1) * PAGE_SIZE;

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
            limit: PAGE_SIZE,
            offset,
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
        {/* Botones directos (sin wrapper flex extra) para que el flex-wrap
            de PageHeader los envuelva uno por uno en mobile en vez de
            dejarlos en una fila que se corta. */}
        <WithTooltip label="Documentos eliminados (reversible — podés restaurar)">
          <Link
            href="/documentos/papelera"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
          >
            <Trash2 className="h-4 w-4" />
            Papelera
          </Link>
        </WithTooltip>
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
      </PageHeader>

      {isAiEnabled() ? <AiDocumentSearch /> : null}

      <form className="flex flex-wrap items-center gap-2" action="/documentos">
        {/* w-full en mobile (ocupa toda la fila y los controles caen debajo),
            flex-1 con min-w razonable desde sm. Antes min-w-[260px] forzaba
            ancho que no encajaba con el checkbox+botón en pantallas chicas. */}
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1">
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
          <PaginationStrip
            page={page}
            pageSize={PAGE_SIZE}
            total={searchResults.total}
            shown={searchResults.rows.length}
            searchParams={{
              q,
              shared: onlyShared ? "1" : undefined,
            }}
          />

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
                          folderName: d.folderName,
                          folderPath: d.folderPath,
                        }}
                        aiEnabled={isAiEnabled()}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Paginación inferior — repetida para que el user no scrollee arriba */}
          {searchResults.rows.length > 0 ? (
            <PaginationStrip
              page={page}
              pageSize={PAGE_SIZE}
              total={searchResults.total}
              shown={searchResults.rows.length}
              searchParams={{
                q,
                shared: onlyShared ? "1" : undefined,
              }}
            />
          ) : null}
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
          scope={scope}
          currentFolderId={folderId}
        />
      )}
    </div>
  );
}
