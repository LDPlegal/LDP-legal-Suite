"use client";

// Browser estilo explorador de archivos (Finder/Explorer): breadcrumb + carpetas
// + documentos del nivel actual. Navegación por query string (?folder=<id>).
//
// Vistas (como en macOS/Windows), persistidas en localStorage:
//   - "grid"    → íconos cuadrados grandes (carpetas y archivos como tiles)
//   - "list"    → filas cómodas
//   - "compact" → filas densas
//
// D&D (Fase 8): en list/compact los items se arrastran sobre carpetas/breadcrumb
// para moverlos (@dnd-kit, pointer-based). El "Mover a..." dialog queda como
// alternativa accesible y es el camino de mover en vista grid.
//
// Subida por arrastrar-y-soltar: la UploadDropZone al fondo acepta archivos del
// escritorio (DnD nativo del browser) y los sube a la carpeta actual.

import Link from "next/link";
import { useEffect, useState } from "react";
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
  FileText,
  Folder as FolderIcon,
  FolderInput,
  GripVertical,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  List as ListIcon,
  Lock,
  Rows3,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { eliminarCarpetaAction } from "@/app/_actions/carpetas/eliminar";
import { moverDocumentoAction } from "@/app/_actions/carpetas/mover-documento";
import { moverCarpetaAction } from "@/app/_actions/carpetas/mover";
import { DocumentPreviewDrawer } from "./document-preview-drawer";
import { MoveToDialog } from "./move-to-dialog";
import { UploadDropZone } from "./upload-drop-zone";
import { DocumentActionsMenu } from "@/app/(app)/casos/[id]/_components/document-actions-menu";
import { ShareFolderButton } from "./share-folder-button";
import { RenameFolderDialog } from "./rename-folder-dialog";
import { NewFolderDialog } from "./new-folder-dialog";
import { BulkActionsBar } from "./bulk-actions-bar";
import { IconButton, WithTooltip } from "@/components/ui/icon-button";
import { formatBytes, OCR_STATUS_LABEL } from "@/lib/documents/format";
import { formatInFirmTz } from "@/lib/datetime/format";
import type { UploadScope } from "@/lib/uploads/client";
import type { FolderScope } from "@/lib/db/queries/folders";

export type FolderListItem = {
  id: string;
  name: string;
  documentCount?: number;
  isPersonal?: boolean;
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
  visibility?: "case" | "private";
  uploadedById?: string | null;
  createdAt: Date;
  caseId: string | null;
  clientId: string | null;
};

export type BreadcrumbItem = {
  id: string;
  name: string;
};

type ViewMode = "grid" | "list" | "compact";
const VIEW_STORAGE_KEY = "ldp-docs-view";

// — IDs convencionados para D&D —
//   draggable doc:    "doc:<uuid>"
//   draggable folder: "folder:<uuid>"
//   droppable folder: "folder:<uuid>"
//   droppable breadcrumb root:  "bc:root"
//   droppable breadcrumb path:  "bc:<uuid>"

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
  currentUserId,
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
  currentUserId?: string;
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // — Vista (grid/list/compact), recordada por navegador —
  const [view, setView] = useState<ViewMode>("list");
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "grid" || stored === "list" || stored === "compact") {
      setView(stored);
    }
  }, []);
  function changeView(v: ViewMode) {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      // localStorage puede fallar en modo privado — no es crítico.
    }
  }
  const isGrid = view === "grid";
  const dense = view === "compact";

  // — Estado de selección múltiple —
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleFolder(id: string) {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedDocIds(new Set());
    setSelectedFolderIds(new Set());
  }
  const allDocsSelected =
    documents.length > 0 && documents.every((d) => selectedDocIds.has(d.id));
  const allFoldersSelected =
    folders.length > 0 && folders.every((f) => selectedFolderIds.has(f.id));
  function toggleAllDocs() {
    setSelectedDocIds(allDocsSelected ? new Set() : new Set(documents.map((d) => d.id)));
  }
  function toggleAllFolders() {
    setSelectedFolderIds(allFoldersSelected ? new Set() : new Set(folders.map((f) => f.id)));
  }

  const hasSelection = selectedDocIds.size + selectedFolderIds.size > 0;

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
        {hasSelection ? (
          <BulkActionsBar
            selectedDocIds={[...selectedDocIds]}
            selectedFolderIds={[...selectedFolderIds]}
            scope={scope}
            currentFolderId={currentFolderId}
            onClear={clearSelection}
          />
        ) : null}

        {/* Toolbar: breadcrumb (izq) + selector de vista (der) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <div className="flex items-center gap-2">
            <NewFolderDialog parentFolderId={currentFolderId} scope={scope} />
            <ViewToggle view={view} onChange={changeView} />
          </div>
        </div>

        {/* Carpetas */}
        {folders.length > 0 ? (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <input
                type="checkbox"
                checked={allFoldersSelected}
                onChange={toggleAllFolders}
                className="h-3.5 w-3.5 cursor-pointer"
                aria-label="Seleccionar todas las carpetas"
                title="Seleccionar todas"
              />
              Carpetas
            </h3>
            {isGrid ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {folders.map((f) => (
                  <FolderTile
                    key={f.id}
                    folder={f}
                    href={folderHref(f.id)}
                    scope={scope}
                    selected={selectedFolderIds.has(f.id)}
                    onToggleSelect={() => toggleFolder(f.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((f) => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    href={folderHref(f.id)}
                    scope={scope}
                    dense={dense}
                    selected={selectedFolderIds.has(f.id)}
                    onToggleSelect={() => toggleFolder(f.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Documentos */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {documents.length > 0 ? (
              <input
                type="checkbox"
                checked={allDocsSelected}
                onChange={toggleAllDocs}
                className="h-3.5 w-3.5 cursor-pointer"
                aria-label="Seleccionar todos los documentos"
                title="Seleccionar todos"
              />
            ) : null}
            Documentos {documents.length > 0 ? `(${documents.length})` : ""}
          </h3>
          {documents.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {folders.length === 0
                ? 'Carpeta vacía. Arrastrá archivos a la zona de abajo, o usá el botón "Nueva carpeta" (arriba a la derecha) para crear una sub-carpeta.'
                : "Sin documentos en este nivel. Hay sub-carpetas arriba."}
            </p>
          ) : isGrid ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {documents.map((d) => (
                <DocumentTile
                  key={d.id}
                  doc={d}
                  aiEnabled={aiEnabled}
                  currentUserId={currentUserId}
                  selected={selectedDocIds.has(d.id)}
                  onToggleSelect={() => toggleDoc(d.id)}
                />
              ))}
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {documents.map((d) => (
                <DocumentItem
                  key={d.id}
                  doc={d}
                  aiEnabled={aiEnabled}
                  dense={dense}
                  currentFolderId={currentFolderId}
                  currentUserId={currentUserId}
                  selected={selectedDocIds.has(d.id)}
                  onToggleSelect={() => toggleDoc(d.id)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Zona de subida por arrastrar-y-soltar (archivos del escritorio) */}
        <UploadDropZone
          scope={scope as UploadScope}
          folderId={currentFolderId}
          visibility="case"
          onUploaded={() => router.refresh()}
        />

        {/* Hint contextual */}
        {folders.length > 0 || documents.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {isGrid
              ? "💡 Tip: cambiá a vista Lista para arrastrar documentos entre carpetas, o usá el menú «⋮» → «Mover a…»."
              : "💡 Tip: arrastrá un documento o carpeta sobre una carpeta destino (o el breadcrumb) para moverlo. También está «Mover a…»."}
          </p>
        ) : null}
      </div>
    </DndContext>
  );
}

// — Selector de vista (segmented control) —
function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const options: Array<{ value: ViewMode; label: string; icon: typeof ListIcon }> = [
    { value: "grid", label: "Íconos", icon: LayoutGrid },
    { value: "list", label: "Lista", icon: ListIcon },
    { value: "compact", label: "Compacta", icon: Rows3 },
  ];
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        const active = view === o.value;
        return (
          <WithTooltip key={o.value} label={`Vista ${o.label}`}>
            <button
              type="button"
              onClick={() => onChange(o.value)}
              aria-label={`Vista ${o.label}`}
              aria-pressed={active}
              className={[
                "flex h-7 w-8 items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
            </button>
          </WithTooltip>
        );
      })}
    </div>
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

// — Menú de acciones de carpeta (rename/share/move/delete), compartido por
//   la fila y el tile para no duplicar la lógica. —
function FolderActions({
  folder,
  scope,
  compact = false,
}: {
  folder: FolderListItem;
  scope: FolderScope;
  compact?: boolean;
}) {
  const [deleteDocs, setDeleteDocs] = useState(false);
  const btn = compact
    ? "h-6 w-6"
    : "h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100";
  return (
    <>
      <RenameFolderDialog folderId={folder.id} currentName={folder.name} />
      {!folder.isPersonal ? (
        <ShareFolderButton folderId={folder.id} folderName={folder.name} />
      ) : null}
      <MoveToDialog
        itemKind="folder"
        itemId={folder.id}
        itemName={folder.name}
        scope={scope}
        currentFolderId={folder.id}
        trigger={
          <IconButton className={btn} label="Mover esta carpeta a otra ubicación">
            <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
          </IconButton>
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
          <IconButton className={btn} label="Eliminar carpeta (reversible — queda archivada)">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </IconButton>
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
            <span className="font-medium">También eliminar los documentos dentro</span>
            <span className="block text-xs text-muted-foreground">
              Sin marcar, los archivos vuelven a la raíz. Marcado, también van a
              papelera (reversible).
            </span>
          </span>
        </label>
      </ConfirmButton>
    </>
  );
}

// — Carpeta cuadrada (vista grid) —
function FolderTile({
  folder,
  href,
  scope,
  selected,
  onToggleSelect,
}: {
  folder: FolderListItem;
  href: string;
  scope: FolderScope;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const drop = useDroppable({ id: `folder:${folder.id}` });
  return (
    <div
      ref={drop.setNodeRef}
      className={[
        "group relative flex flex-col rounded-2xl border p-3 transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : drop.isOver
            ? "border-primary bg-primary/10"
            : "hover:bg-accent",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className={[
          "absolute left-2 top-2 z-10 h-4 w-4 cursor-pointer",
          selected ? "" : "opacity-0 transition-opacity group-hover:opacity-100",
        ].join(" ")}
        aria-label={`Seleccionar carpeta ${folder.name}`}
      />
      <div className="absolute right-1 top-1 z-10 flex opacity-0 transition-opacity group-hover:opacity-100">
        <FolderActions folder={folder} scope={scope} compact />
      </div>
      <Link href={href} className="flex flex-1 flex-col items-center gap-2 pt-3 text-center">
        <FolderIcon className="h-12 w-12 text-amber-500" />
        <span
          className="line-clamp-2 break-words text-xs font-medium leading-tight"
          title={folder.name}
        >
          {folder.name}
        </span>
        {typeof folder.documentCount === "number" ? (
          <span className="text-[10px] text-muted-foreground">
            {folder.documentCount} doc{folder.documentCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

// — Carpeta en fila (vista list/compact) —
function FolderCard({
  folder,
  href,
  scope,
  dense,
  selected,
  onToggleSelect,
}: {
  folder: FolderListItem;
  href: string;
  scope: FolderScope;
  dense: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const drag = useDraggable({
    id: `folder:${folder.id}`,
    data: { type: "folder", id: folder.id },
  });
  const drop = useDroppable({ id: `folder:${folder.id}` });

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
        "group relative flex items-center gap-2 rounded-xl transition-colors",
        dense ? "p-2" : "p-3",
        selected
          ? "border-primary bg-primary/5"
          : drop.isOver
            ? "border-primary bg-primary/10"
            : "hover:bg-accent",
        drag.isDragging ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 shrink-0 cursor-pointer"
        aria-label={`Seleccionar carpeta ${folder.name}`}
      />
      <WithTooltip label="Arrastrar para mover a otra carpeta">
        <button
          type="button"
          {...drag.listeners}
          {...drag.attributes}
          className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Arrastrar para mover"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </WithTooltip>
      <Link href={href} className="flex flex-1 items-center gap-2">
        <FolderIcon className={dense ? "h-4 w-4 shrink-0 text-amber-500" : "h-5 w-5 shrink-0 text-amber-500"} />
        <span className="break-words text-sm font-medium">{folder.name}</span>
      </Link>
      <FolderActions folder={folder} scope={scope} />
    </Card>
  );
}

// — Documento cuadrado (vista grid) —
function DocumentTile({
  doc,
  aiEnabled,
  currentUserId,
  selected,
  onToggleSelect,
}: {
  doc: DocumentListItem;
  aiEnabled: boolean;
  currentUserId?: string;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const isImage = doc.mimeType.startsWith("image/");
  const docScope: FolderScope = doc.caseId
    ? { kind: "case", caseId: doc.caseId }
    : doc.clientId
      ? { kind: "client", clientId: doc.clientId }
      : { kind: "firm" };

  return (
    <div
      className={[
        "group relative flex flex-col rounded-2xl border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-accent",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className={[
          "absolute left-2 top-2 z-10 h-4 w-4 cursor-pointer",
          selected ? "" : "opacity-0 transition-opacity group-hover:opacity-100",
        ].join(" ")}
        aria-label={`Seleccionar documento ${doc.name}`}
      />
      <div className="absolute right-1 top-1 z-10">
        <DocumentActionsMenu
          doc={{
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            tags: doc.tags,
            version: doc.version,
            ocrStatus: doc.ocrStatus,
            sharedWithClient: doc.sharedWithClient,
            visibility: doc.visibility ?? "case",
            uploadedById: doc.uploadedById,
          }}
          caseId={doc.caseId}
          aiEnabled={aiEnabled}
          currentUserId={currentUserId}
          scope={docScope}
        />
      </div>
      <DocumentPreviewDrawer
        documentId={doc.id}
        documentName={doc.name}
        mimeType={doc.mimeType}
        aiEnabled={aiEnabled}
        trigger={
          <button
            type="button"
            title="Abrir vista previa"
            className="flex flex-1 flex-col items-center gap-2 pt-4 text-center focus-visible:outline-none"
          >
            {isImage ? (
              <ImageIcon className="h-12 w-12 text-muted-foreground" />
            ) : (
              <FileText className="h-12 w-12 text-muted-foreground" />
            )}
            <span
              className="line-clamp-2 break-words text-xs font-medium leading-tight group-hover:underline"
              title={doc.name}
            >
              {doc.name}
            </span>
          </button>
        }
      />
      <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <span>{formatBytes(doc.sizeBytes)}</span>
        {doc.version > 1 ? <span>· v{doc.version}</span> : null}
        {doc.visibility === "private" ? (
          <Lock className="h-2.5 w-2.5" aria-label="Privado" />
        ) : null}
      </div>
    </div>
  );
}

// — Documento en fila (vista list/compact) —
function DocumentItem({
  doc,
  aiEnabled,
  dense,
  currentFolderId,
  currentUserId,
  selected,
  onToggleSelect,
}: {
  doc: DocumentListItem;
  aiEnabled: boolean;
  dense: boolean;
  currentFolderId: string | null;
  currentUserId?: string;
  selected: boolean;
  onToggleSelect: () => void;
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
        "flex flex-wrap items-center justify-between gap-3 transition-colors",
        dense ? "p-2" : "p-3",
        selected
          ? "bg-primary/5"
          : drag.isDragging
            ? "bg-primary/5 ring-1 ring-primary"
            : "hover:bg-accent/50",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="h-4 w-4 shrink-0 cursor-pointer"
          aria-label={`Seleccionar documento ${doc.name}`}
        />
        <WithTooltip label="Arrastrar para mover a otra carpeta">
          <button
            type="button"
            {...drag.listeners}
            {...drag.attributes}
            className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Arrastrar para mover"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </WithTooltip>
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
            aiEnabled={aiEnabled}
            trigger={
              <button
                type="button"
                title="Abrir vista previa"
                className="block w-full truncate text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:underline"
              >
                {doc.name}
              </button>
            }
          />
          {!dense ? (
            <p className="text-xs text-muted-foreground">
              {formatBytes(doc.sizeBytes)} ·{" "}
              {formatInFirmTz(doc.createdAt, undefined, "dd/MM/yyyy")}
              {doc.version > 1 ? ` · v${doc.version}` : ""}
            </p>
          ) : null}
        </div>
        {doc.visibility === "private" ? (
          <WithTooltip label="Privado — solo vos lo ves, el resto del equipo no.">
            <Badge variant="secondary" className="hidden gap-1 text-[10px] sm:inline-flex">
              <Lock className="h-2.5 w-2.5" />
              Privado
            </Badge>
          </WithTooltip>
        ) : null}
        {doc.tags.length > 0 && !dense ? (
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
        {!dense ? (
          <Badge variant="outline" className="mr-1 text-[10px]">
            {OCR_STATUS_LABEL[doc.ocrStatus]}
          </Badge>
        ) : null}

        <MoveToDialog
          itemKind="document"
          itemId={doc.id}
          itemName={doc.name}
          scope={docScope}
          currentFolderId={currentFolderId}
          trigger={
            <IconButton className="h-8 w-8" label="Mover a otra carpeta">
              <FolderInput className="h-4 w-4" />
            </IconButton>
          }
        />

        <DocumentActionsMenu
          doc={{
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            tags: doc.tags,
            version: doc.version,
            ocrStatus: doc.ocrStatus,
            sharedWithClient: doc.sharedWithClient,
            visibility: doc.visibility ?? "case",
            uploadedById: doc.uploadedById,
          }}
          caseId={doc.caseId}
          aiEnabled={aiEnabled}
          currentUserId={currentUserId}
          scope={newVersionScope}
        />
      </div>
    </li>
  );
}
