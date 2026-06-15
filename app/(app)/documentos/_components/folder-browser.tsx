"use client";

// Browser estilo explorador de archivos: breadcrumb + grid de carpetas + lista
// de documentos en el nivel actual. La navegación se hace por query string
// (?folder=<id>) para que sea linkeable y respete back/forward del browser.
//
// Fase 8 — D&D: items son arrastrables sobre carpetas y breadcrumbs.
// El "Mover a..." dialog se mantiene como alternativa accesible (teclado,
// mobile sin precisión de drag).

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder as FolderIcon,
  FolderInput,
  GripVertical,
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
import { moverDocumentoAction } from "@/app/_actions/carpetas/mover-documento";
import { moverCarpetaAction } from "@/app/_actions/carpetas/mover";
import { DocumentEditDrawer } from "@/app/(app)/casos/[id]/_components/document-edit-drawer";
import { DocumentPreviewDrawer } from "./document-preview-drawer";
import { DocumentSummaryDrawer } from "./document-summary-drawer";
import { DocumentNewVersionButton } from "./document-new-version-button";
import { ReprocessOneButton } from "./reprocess-buttons";
import { MoveToDialog } from "./move-to-dialog";
import { ShareFolderButton } from "./share-folder-button";
import { RenameFolderDialog } from "./rename-folder-dialog";
import { formatBytes, OCR_STATUS_LABEL } from "@/lib/documents/format";
import { formatInFirmTz } from "@/lib/datetime/format";
import type { UploadScope } from "@/lib/uploads/client";
import type { FolderScope } from "@/lib/db/queries/folders";

export type FolderListItem = {
  id: string;
  name: string;
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
  caseId: string | null;
  clientId: string | null;
};

export type BreadcrumbItem = {
  id: string;
  name: string;
};

// — IDs convencionados para D&D —
//   draggable doc:    "doc:<uuid>"
//   draggable folder: "folder:<uuid>"
//   droppable folder: "folder:<uuid>"
//   droppable breadcrumb root:  "bc:root"
//   droppable breadcrumb path:  "bc:<uuid>"
// Como folder es BOTH draggable AND droppable con el mismo prefijo, los
// distinguimos por el campo `data.role` del descriptor.

function parseDroppableId(
  id: string,
): { kind: "folder"; folderId: string } | { kind: "bc-root" } | { kind: "bc-folder"; folderId: string } | null {
  if (id === "bc:root") return { kind: "bc-root" };
  if (id.startsWith("bc:")) return { kind: "bc-folder", folderId: id.slice(3) };
  if (id.startsWith("folder:")) return { kind: "folder", folderId: id.slice(7) };
  return null;
}

export function FolderBrowser({
  basePath,
  breadcrumb,
  folders,
  documents,
  rootLabel = "Documentos",
  extraParams = {},
  aiEnabled = false,
  scope,
  currentFolderId,
}: {
  basePath: string;
  breadcrumb: BreadcrumbItem[];
  folders: FolderListItem[];
  documents: DocumentListItem[];
  rootLabel?: string;
  extraParams?: Record<string, string>;
  aiEnabled?: boolean;
  scope: FolderScope;
  currentFolderId: string | null;
}) {
  const router = useRouter();
  // Activation con 8px de distancia — clicks casuales en links no disparan
  // drag, solo si el user mantiene apretado y se mueve.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function folderHref(folderId: string | null) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v);
    }
    if (folderId) params.set("folder", folderId);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const target = parseDroppableId(String(over.id));
    if (!target) return;

    // No drop a la misma carpeta donde ya está el item.
    const activeData = active.data.current as { type: "doc" | "folder"; id: string } | undefined;
    if (!activeData) return;
    const sourceId = activeData.id;

    let targetFolderId: string | null;
    if (target.kind === "bc-root") {
      targetFolderId = null;
    } else if (target.kind === "bc-folder") {
      targetFolderId = target.folderId;
    } else {
      targetFolderId = target.folderId;
    }

    // No drop sobre sí misma (folder al droppable de su propio card).
    if (activeData.type === "folder" && sourceId === targetFolderId) return;

    try {
      const result =
        activeData.type === "doc"
          ? await moverDocumentoAction({ documentId: sourceId, folderId: targetFolderId })
          : await moverCarpetaAction({ folderId: sourceId, newParentFolderId: targetFolderId });

      if (result.ok) {
        toast.success(targetFolderId ? "Movido a la carpeta" : "Movido a raíz");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error moviendo: ${msg}`);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Breadcrumb con drop zones por segmento */}
        <nav className="flex items-center gap-1 text-sm">
          <BreadcrumbDroppable id="bc:root" href={folderHref(null)}>
            <Home className="h-3.5 w-3.5" />
            {rootLabel}
          </BreadcrumbDroppable>
          {breadcrumb.map((b, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={b.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                {isLast ? (
                  <span className="font-medium">{b.name}</span>
                ) : (
                  <BreadcrumbDroppable id={`bc:${b.id}`} href={folderHref(b.id)}>
                    {b.name}
                  </BreadcrumbDroppable>
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
                <FolderCard
                  key={f.id}
                  folder={f}
                  href={folderHref(f.id)}
                  scope={scope}
                />
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
                <DocumentItem
                  key={d.id}
                  doc={d}
                  aiEnabled={aiEnabled}
                  currentFolderId={currentFolderId}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Hint visible para el user */}
        {folders.length > 0 || documents.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            💡 Tip: arrastrá un documento o carpeta sobre una carpeta destino
            (o sobre el breadcrumb) para moverlo. También funciona el botón
            &quot;Mover a...&quot;
          </p>
        ) : null}
      </div>
    </DndContext>
  );
}

// — Breadcrumb segment como drop zone —
function BreadcrumbDroppable({
  id,
  href,
  children,
}: {
  id: string;
  href: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <Link
      ref={setNodeRef as unknown as React.Ref<HTMLAnchorElement>}
      href={href}
      className={[
        "inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors",
        isOver
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function FolderCard({
  folder,
  href,
  scope,
}: {
  folder: FolderListItem;
  href: string;
  scope: FolderScope;
}) {
  const [deleteDocs, setDeleteDocs] = useState(false);

  // El folder es BOTH draggable (lo podés mover) Y droppable (otros items
  // se le pueden tirar encima).
  const drag = useDraggable({
    id: `folder:${folder.id}`,
    data: { type: "folder", id: folder.id },
  });
  const drop = useDroppable({ id: `folder:${folder.id}` });

  // Combinar refs.
  function combinedRef(node: HTMLDivElement | null) {
    drag.setNodeRef(node);
    drop.setNodeRef(node);
  }

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(drag.transform),
    opacity: drag.isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={combinedRef}
      style={style}
      className={[
        "group relative flex items-center gap-2 p-3 transition-colors",
        drop.isOver
          ? "border-primary bg-primary/10"
          : "hover:bg-accent",
        drag.isDragging ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      {/* Drag handle — solo este icono triggers el drag, los demás clicks van al Link. */}
      <button
        type="button"
        {...drag.listeners}
        {...drag.attributes}
        className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Arrastrar para mover"
        title="Arrastrá para mover"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Link href={href} className="flex flex-1 items-center gap-2 truncate">
        <FolderIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="truncate text-sm font-medium">{folder.name}</span>
      </Link>
      <RenameFolderDialog folderId={folder.id} currentName={folder.name} />
      <ShareFolderButton folderId={folder.id} folderName={folder.name} />
      <MoveToDialog
        itemKind="folder"
        itemId={folder.id}
        itemName={folder.name}
        scope={scope}
        currentFolderId={folder.id}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Mover carpeta a..."
            title="Mover a otra carpeta"
          >
            <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        }
      />
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
  currentFolderId,
}: {
  doc: DocumentListItem;
  aiEnabled: boolean;
  currentFolderId: string | null;
}) {
  const isImage = doc.mimeType.startsWith("image/");

  const docScope: FolderScope = doc.caseId
    ? { kind: "case", caseId: doc.caseId }
    : doc.clientId
      ? { kind: "client", clientId: doc.clientId }
      : { kind: "firm" };
  const newVersionScope: UploadScope = docScope;

  const drag = useDraggable({
    id: `doc:${doc.id}`,
    data: { type: "doc", id: doc.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(drag.transform),
    opacity: drag.isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={drag.setNodeRef}
      style={style}
      className={[
        "flex flex-wrap items-center justify-between gap-3 p-3 transition-colors",
        drag.isDragging ? "bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/50",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Drag handle */}
        <button
          type="button"
          {...drag.listeners}
          {...drag.attributes}
          className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Arrastrar para mover"
          title="Arrastrá para mover"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {isImage ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
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

      <div className="flex items-center gap-0.5">
        <Badge variant="outline" className="mr-1 text-[10px]">
          {OCR_STATUS_LABEL[doc.ocrStatus]}
        </Badge>

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

        <ReprocessOneButton docId={doc.id} />

        <MoveToDialog
          itemKind="document"
          itemId={doc.id}
          itemName={doc.name}
          scope={docScope}
          currentFolderId={currentFolderId}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Mover a..."
              title="Mover a otra carpeta"
            >
              <FolderInput className="h-3.5 w-3.5" />
            </Button>
          }
        />

        <DocumentNewVersionButton
          documentId={doc.id}
          documentName={doc.name}
          currentVersion={doc.version}
          scope={newVersionScope}
        />

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
