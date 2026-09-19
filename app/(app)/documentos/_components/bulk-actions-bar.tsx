"use client";

// Barra de acciones contextual para selección múltiple. Aparece sticky
// arriba del browser cuando hay ≥1 item seleccionado (docs y/o carpetas).
//
// Acciones:
//   - Mover: dialog con picker de carpeta destino (reusa listarCarpetasScope).
//   - Compartir / Quitar de portal: solo afecta docs (con caso).
//   - Eliminar: confirm dialog, con opción "también docs dentro de carpetas".
//   - Deseleccionar todo.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  FolderInput,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  compartirDocsBulkAction,
  eliminarItemsBulkAction,
  moverItemsBulkAction,
} from "@/app/_actions/carpetas/bulk";
import { listarCarpetasScopeAction } from "@/app/_actions/carpetas/listar-scope";
import type { FolderScope } from "@/lib/db/queries/folders";

type Destination = { id: string; name: string; fullPath: string };

export function BulkActionsBar({
  selectedDocIds,
  selectedFolderIds,
  scope,
  currentFolderId,
  onClear,
}: {
  selectedDocIds: string[];
  selectedFolderIds: string[];
  scope: FolderScope;
  currentFolderId: string | null;
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteDocsInFolders, setDeleteDocsInFolders] = useState(false);

  const total = selectedDocIds.length + selectedFolderIds.length;

  function refreshAndClear() {
    onClear();
    router.refresh();
  }

  function doShare(shared: boolean) {
    if (selectedDocIds.length === 0) {
      toast.error("Compartir solo aplica a documentos. Seleccioná al menos uno.");
      return;
    }
    startTransition(async () => {
      const r = await compartirDocsBulkAction({ documentIds: selectedDocIds, shared });
      if (r.ok) {
        const msg = shared
          ? `${r.updated} compartido${r.updated === 1 ? "" : "s"}`
          : `${r.updated} ya no se comparte${r.updated === 1 ? "" : "n"}`;
        toast.success(r.skipped > 0 ? `${msg} · ${r.skipped} sin caso (omitidos)` : msg);
        refreshAndClear();
      } else {
        toast.error(r.error);
      }
    });
  }

  function doDelete() {
    startTransition(async () => {
      const r = await eliminarItemsBulkAction({
        documentIds: selectedDocIds,
        folderIds: selectedFolderIds,
        deleteDocsInFolders,
      });
      if (r.ok) {
        toast.success(
          `${r.deleted} item${r.deleted === 1 ? "" : "s"} a papelera${r.failed > 0 ? ` · ${r.failed} fallaron` : ""}`,
        );
        setDeleteOpen(false);
        refreshAndClear();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/95 p-2 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 pl-1 text-sm">
          <span className="font-medium tabular-nums">{total}</span>
          <span className="text-muted-foreground">
            seleccionado{total === 1 ? "" : "s"}
            {selectedFolderIds.length > 0 && selectedDocIds.length > 0
              ? ` (${selectedFolderIds.length} carpeta${selectedFolderIds.length === 1 ? "" : "s"}, ${selectedDocIds.length} doc${selectedDocIds.length === 1 ? "" : "s"})`
              : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMoveOpen(true)}
            disabled={pending}
          >
            <FolderInput className="h-3.5 w-3.5" />
            Mover
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => doShare(true)}
            disabled={pending || selectedDocIds.length === 0}
            title={selectedDocIds.length === 0 ? "Seleccioná documentos" : "Compartir con cliente"}
          >
            <Eye className="h-3.5 w-3.5" />
            Compartir
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => doShare(false)}
            disabled={pending || selectedDocIds.length === 0}
          >
            <EyeOff className="h-3.5 w-3.5" />
            Quitar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={pending}
            aria-label="Deseleccionar todo"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </Button>
        </div>
      </div>

      {/* Dialog Mover */}
      <BulkMoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        scope={scope}
        currentFolderId={currentFolderId}
        excludeFolderIds={selectedFolderIds}
        pending={pending}
        onPick={(targetFolderId) => {
          startTransition(async () => {
            const r = await moverItemsBulkAction({
              documentIds: selectedDocIds,
              folderIds: selectedFolderIds,
              targetFolderId,
            });
            if (r.ok) {
              toast.success(
                `${r.moved} movido${r.moved === 1 ? "" : "s"}${r.failed > 0 ? ` · ${r.failed} fallaron` : ""}`,
              );
              for (const e of r.errors.slice(0, 2)) toast.error(e);
              setMoveOpen(false);
              refreshAndClear();
            } else {
              toast.error(r.error);
            }
          });
        }}
      />

      {/* Dialog Eliminar */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar {total} item{total === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              Van a la papelera (reversible). Podés restaurarlos desde
              /documentos/papelera.
            </DialogDescription>
          </DialogHeader>
          {selectedFolderIds.length > 0 ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={deleteDocsInFolders}
                onChange={(e) => setDeleteDocsInFolders(e.currentTarget.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer"
              />
              <span>
                <span className="font-medium">
                  También eliminar los documentos dentro de las carpetas
                </span>
                <span className="block text-xs text-muted-foreground">
                  Sin marcar, esos docs vuelven a la raíz.
                </span>
              </span>
            </label>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={doDelete}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Picker de carpeta destino para el move bulk. Reusa listarCarpetasScope.
function BulkMoveDialog({
  open,
  onOpenChange,
  scope,
  currentFolderId,
  excludeFolderIds,
  pending,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: FolderScope;
  currentFolderId: string | null;
  excludeFolderIds: string[];
  pending: boolean;
  onPick: (targetFolderId: string | null) => void;
}) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    // Excluimos las carpetas seleccionadas (no podés mover una carpeta
    // dentro de sí misma ni de otra que estás moviendo). Pasamos solo la
    // primera al server para exclusión de subárbol; el resto las filtramos
    // en memoria.
    listarCarpetasScopeAction({
      scope,
      excludeFolderId: excludeFolderIds[0] ?? null,
    })
      .then((r) => {
        if (r.ok) {
          setDestinations(r.folders.filter((d) => !excludeFolderIds.includes(d.id)));
        } else {
          toast.error(r.error);
        }
      })
      .finally(() => setLoading(false));
  }, [open, scope, excludeFolderIds]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? destinations.filter(
        (d) => d.name.toLowerCase().includes(q) || d.fullPath.toLowerCase().includes(q),
      )
    : destinations;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mover seleccionados a…</DialogTitle>
          <DialogDescription>
            Elegí la carpeta destino. Click sobre cualquier opción para mover.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Filtrar por nombre o path…"
              className="pl-8"
              autoFocus
            />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando carpetas…
            </div>
          ) : (
            <ul className="max-h-96 space-y-0.5 overflow-y-auto rounded-md border bg-card p-1">
              {currentFolderId !== null ? (
                <li>
                  <button
                    type="button"
                    onClick={() => onPick(null)}
                    disabled={pending}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                  >
                    <FolderInput className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Raíz del nivel</span>
                  </button>
                </li>
              ) : null}
              {filtered.length === 0 ? (
                <li className="py-6 text-center text-xs text-muted-foreground">
                  Sin carpetas disponibles{q ? " que coincidan" : ""}.
                </li>
              ) : (
                filtered
                  .filter((d) => d.id !== currentFolderId)
                  .map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => onPick(d.id)}
                        disabled={pending}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                        title={d.fullPath}
                      >
                        <FolderInput className="h-4 w-4 shrink-0 text-warning" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{d.name}</span>
                          {d.fullPath !== "/" ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {d.fullPath}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))
              )}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
