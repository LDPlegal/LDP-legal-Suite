"use client";

// Browser estilo explorador de archivos: breadcrumb + grid de carpetas + lista
// de documentos en el nivel actual. La navegación se hace por query string
// (?folder=<id>) para que sea linkeable y respete back/forward del browser.

import Link from "next/link";
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder as FolderIcon,
  Home,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { eliminarCarpetaAction } from "@/app/_actions/carpetas/eliminar";
import { formatBytes, OCR_STATUS_LABEL } from "@/lib/documents/format";
import { formatInFirmTz } from "@/lib/datetime/format";

export type FolderListItem = {
  id: string;
  name: string;
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
              <DocumentItem key={d.id} doc={d} />
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
  return (
    <Card className="group relative flex items-center gap-2 p-3 hover:bg-accent">
      <Link href={href} className="flex flex-1 items-center gap-2 truncate">
        <FolderIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="truncate text-sm font-medium">{folder.name}</span>
      </Link>
      <ConfirmButton
        action={eliminarCarpetaAction}
        title="¿Eliminar esta carpeta?"
        description={`La carpeta "${folder.name}" y sus sub-carpetas se archivan (soft-delete). Los documentos quedan en la raíz, no se borran.`}
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
      </ConfirmButton>
    </Card>
  );
}

function DocumentItem({ doc }: { doc: DocumentListItem }) {
  const isImage = doc.mimeType.startsWith("image/");
  return (
    <li className="flex items-center justify-between gap-3 p-3 hover:bg-accent/50">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isImage ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.name}</p>
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
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[10px]">
          {OCR_STATUS_LABEL[doc.ocrStatus]}
        </Badge>
        {doc.sharedWithClient ? (
          <Eye className="h-3.5 w-3.5 text-emerald-600" aria-label="Compartido" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="No compartido" />
        )}
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
      </div>
    </li>
  );
}
