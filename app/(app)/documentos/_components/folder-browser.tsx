"use client";

// Browser estilo explorador de archivos: breadcrumb + grid de carpetas + lista
// de documentos en el nivel actual. La navegación se hace por query string
// (?folder=<id>) para que sea linkeable y respete back/forward del browser.

import Link from "next/link";
import { useState } from "react";
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder as FolderIcon,
  Home,
  Image as ImageIcon,
  Pencil,
  ScanEye,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { eliminarCarpetaAction } from "@/app/_actions/carpetas/eliminar";
import { eliminarDocumentoAction } from "@/app/_actions/documentos/eliminar";
import { compartirDocumentoAction } from "@/app/_actions/documentos/compartir";
import { DocumentEditDrawer } from "@/app/(app)/casos/[id]/_components/document-edit-drawer";
import { DocumentPreviewDrawer } from "./document-preview-drawer";
import { DocumentSummaryDrawer } from "./document-summary-drawer";
import { DocumentNewVersionButton } from "./document-new-version-button";
import { ReprocessOneButton } from "./reprocess-buttons";
import { formatBytes, OCR_STATUS_LABEL } from "@/lib/documents/format";
import { formatInFirmTz } from "@/lib/datetime/format";
import type { UploadScope } from "@/lib/uploads/client";

export type FolderListItem = {
  id: string;
  name: string;
  /** Número de docs directos (sin recursión) — para mostrar al user
   *  antes de eliminar. Opcional; si no se pasa, no se muestra. */
  documentCount?: number;
};

export type DocumentListItem = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  ocrStatus: "pending" | "processing" | "done" | "failed" | "skipped";
  version: number;
  sharedWithClient: boolean;
  createdAt: Date;
  /** Necesarios para construir scope (preview, edit, share, new version). */
  caseId: string | null;
  clientId: string | null;
};

export type BreadcrumbItem = {
  id: string;
  name: string;
};

export function FolderBrowser({
  basePath,
  breadcrumb,
  folders,
  documents,
  rootLabel = "Documentos",
  extraParams = {},
  aiEnabled = false,
}: {
  /** Path base para construir los hrefs de navegación. Ej: "/documentos" o "/casos/abc". */
  basePath: string;
  /** Path desde la raíz a la carpeta actual. Vacío si estamos en la raíz. */
  breadcrumb: BreadcrumbItem[];
  /** Carpetas hijas directas. */
  folders: FolderListItem[];
  /** Documentos en este nivel. */
  documents: DocumentListItem[];
  rootLabel?: string;
  /** Query params extra para preservar (ej: ?tab=documentos en página de caso). */
  extraParams?: Record<string, string>;
  /** Si el módulo de IA está habilitado, mostramos botones de resumen IA. */
  aiEnabled?: boolean;
}) {
  function folderHref(folderId: string | null) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v);
    }
    if (folderId) params.set("folder", folderId);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm">
        <Link
          href={folderHref(null)}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
          {rootLabel}
        </Link>
        {breadcrumb.map((b, i) => {
          const isLast = i === breadcrumb.length - 1;
          return (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              {isLast ? (
                <span className="font-medium">{b.name}</span>
              ) : (
                <Link
                  href={folderHref(b.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {b.name}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* Grid de carpetas */}
      {folders.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Carpetas
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {folders.map((f) => (
              <FolderCard key={f.id} folder={f} href={folderHref(f.id)} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Lista de documentos */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Documentos {documents.length > 0 ? `(${documents.length})` : ""}
        </h3>
        {documents.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {folders.length === 0
              ? "Carpeta vacía. Subí archivos o creá una sub-carpeta."
              : "Sin documentos en este nivel. Hay sub-carpetas arriba."}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {documents.map((d) => (
              <DocumentItem key={d.id} doc={d} aiEnabled={aiEnabled} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FolderCard({
  folder,
  href,
}: {
  folder: FolderListItem;
  href: string;
}) {
  // Estado local del checkbox "también eliminar los documentos dentro".
  // Vive en el FolderCard porque el dialog del ConfirmButton lo monta abajo.
  const [deleteDocs, setDeleteDocs] = useState(false);

  return (
    <Card className="group relative flex items-center gap-2 p-3 hover:bg-accent">
      <Link href={href} className="flex flex-1 items-center gap-2 truncate">
        <FolderIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="truncate text-sm font-medium">{folder.name}</span>
      </Link>
      <ConfirmButton
        action={eliminarCarpetaAction}
        title="¿Eliminar esta carpeta?"
        description={
          deleteDocs
            ? `La carpeta "${folder.name}" y TODOS sus documentos van a papelera.`
            : `La carpeta "${folder.name}" se archiva. Los documentos vuelven a la raíz para que los re-organices.`
        }
        confirmLabel="Eliminar"
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Eliminar carpeta"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        }
      >
        <input type="hidden" name="folderId" value={folder.id} />
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="deleteDocuments"
            value="true"
            checked={deleteDocs}
            onChange={(e) => setDeleteDocs(e.currentTarget.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer"
          />
          <span>
            <span className="font-medium">
              También eliminar los documentos dentro
            </span>
            <span className="block text-xs text-muted-foreground">
              Sin marcar, los archivos vuelven a la raíz. Marcado, también van
              a papelera (reversible).
            </span>
          </span>
        </label>
      </ConfirmButton>
    </Card>
  );
}

function DocumentItem({
  doc,
  aiEnabled,
}: {
  doc: DocumentListItem;
  aiEnabled: boolean;
}) {
  const isImage = doc.mimeType.startsWith("image/");

  // El scope para el "nueva versión" depende de dónde vive este doc.
  const newVersionScope: UploadScope = doc.caseId
    ? { kind: "case", caseId: doc.caseId }
    : doc.clientId
      ? { kind: "client", clientId: doc.clientId }
      : { kind: "firm" };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-accent/50">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isImage ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          {/* Click en el nombre abre el preview drawer (no descarga). */}
          <DocumentPreviewDrawer
            documentId={doc.id}
            documentName={doc.name}
            mimeType={doc.mimeType}
            trigger={
              <button
                type="button"
                className="block w-full truncate text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:underline"
                title="Click para ver"
              >
                {doc.name}
              </button>
            }
          />
          <p className="text-xs text-muted-foreground">
            {formatBytes(doc.sizeBytes)} ·{" "}
            {formatInFirmTz(doc.createdAt, undefined, "dd/MM/yyyy")}
            {doc.version > 1 ? ` · v${doc.version}` : ""}
          </p>
        </div>
        {doc.tags.length > 0 ? (
          <div className="hidden gap-1 sm:flex">
            {doc.tags.slice(0, 2).map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {/* Action bar — espejo del DocumentGlobalRow para tener parity. */}
      <div className="flex items-center gap-0.5">
        <Badge variant="outline" className="mr-1 text-[10px]">
          {OCR_STATUS_LABEL[doc.ocrStatus]}
        </Badge>

        {/* Toggle compartir con cliente (solo si vive en un caso). */}
        {doc.caseId ? (
          <form action={compartirDocumentoAction} className="inline-block">
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="caseId" value={doc.caseId} />
            <input
              type="hidden"
              name="shared"
              value={doc.sharedWithClient ? "false" : "true"}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={
                doc.sharedWithClient
                  ? "Dejar de compartir con el cliente"
                  : "Compartir con el cliente"
              }
              title={
                doc.sharedWithClient
                  ? "Visible para el cliente — click para ocultar"
                  : "Oculto — click para compartir"
              }
            >
              {doc.sharedWithClient ? (
                <Eye className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-default opacity-60"
            disabled
            aria-label="Sin caso asociado"
            title="Para compartir con cliente, el doc debe vivir dentro de un caso"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Preview (sin descargar). */}
        <DocumentPreviewDrawer
          documentId={doc.id}
          documentName={doc.name}
          mimeType={doc.mimeType}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Ver"
              title="Ver sin descargar"
            >
              <ScanEye className="h-3.5 w-3.5" />
            </Button>
          }
        />

        {/* Descargar. */}
        <Link
          href={`/api/documentos/${doc.id}/download`}
          target="_blank"
          rel="noopener"
          download={doc.name}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Descargar"
          title="Descargar"
        >
          <Download className="h-3.5 w-3.5" />
        </Link>

        {/* Resumen IA si está habilitado y el OCR ya terminó. */}
        {aiEnabled && doc.ocrStatus === "done" ? (
          <DocumentSummaryDrawer
            documentId={doc.id}
            documentName={doc.name}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label="Resumen IA"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </Button>
            }
          />
        ) : null}

        {/* Re-process OCR. */}
        <ReprocessOneButton docId={doc.id} />

        {/* Nueva versión. */}
        <DocumentNewVersionButton
          documentId={doc.id}
          documentName={doc.name}
          currentVersion={doc.version}
          scope={newVersionScope}
        />

        {/* Editar (nombre + tags + shared). */}
        <DocumentEditDrawer
          caseId={doc.caseId}
          doc={{ id: doc.id, name: doc.name, tags: doc.tags }}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Editar documento"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          }
        />

        {/* Eliminar. */}
        <ConfirmButton
          action={eliminarDocumentoAction}
          title="¿Eliminar este documento?"
          description={`"${doc.name}" se archiva (reversible).`}
          confirmLabel="Eliminar"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              aria-label="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          }
        >
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="caseId" value={doc.caseId ?? ""} />
        </ConfirmButton>
      </div>
    </li>
  );
}
