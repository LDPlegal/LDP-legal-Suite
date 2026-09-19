"use client";

// Dialog "Mover a..." universal, sirve para mover docs Y carpetas.
//
// El listado de destinos se trae al abrir (no en cada render). El user
// busca/filtra en memoria, click sobre una carpeta dispara la action.
// "Mover a raíz" es la primera opción siempre.
//
// Cuando es para mover una carpeta, filtramos la carpeta misma + sus
// descendientes de los destinos posibles (no podés moverte dentro tuyo).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Loader2, Search } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { moverDocumentoAction } from "@/app/_actions/carpetas/mover-documento";
import { moverCarpetaAction } from "@/app/_actions/carpetas/mover";
import { listarCarpetasScopeAction } from "@/app/_actions/carpetas/listar-scope";
import type { FolderScope } from "@/lib/db/queries/folders";

type DestinationFolder = {
  id: string;
  name: string;
  /** Path materializado completo, p.ej. "/Demandas/2026". Para display. */
  fullPath: string;
};

export function MoveToDialog({
  trigger,
  itemKind,
  itemId,
  itemName,
  scope,
  currentFolderId,
}: {
  trigger: React.ReactNode;
  /** Tipo del item a mover, define qué action se llama. */
  itemKind: "document" | "folder";
  /** ID del doc o la carpeta a mover. */
  itemId: string;
  itemName: string;
  /** Scope donde vive (case/client/firm), los destinos se limitan al mismo. */
  scope: FolderScope;
  /** Carpeta actual del item, para no listarla como destino. */
  currentFolderId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [destinations, setDestinations] = useState<DestinationFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  // Cargar destinos al abrir. Cache no, el árbol cambia con creación
  // de carpetas y queremos data fresca cada vez.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listarCarpetasScopeAction({ scope, excludeFolderId: itemKind === "folder" ? itemId : null })
      .then((r) => {
        if (r.ok) {
          setDestinations(r.folders);
        } else {
          toast.error(r.error);
        }
      })
      .finally(() => setLoading(false));
  }, [open, scope, itemId, itemKind]);

  function move(targetFolderId: string | null) {
    startTransition(async () => {
      const result =
        itemKind === "document"
          ? await moverDocumentoAction({ documentId: itemId, folderId: targetFolderId })
          : await moverCarpetaAction({ folderId: itemId, newParentFolderId: targetFolderId });

      if (result.ok) {
        toast.success(
          targetFolderId
            ? `Movido a ${destinations.find((d) => d.id === targetFolderId)?.fullPath ?? "carpeta"}`
            : "Movido a raíz",
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? destinations.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.fullPath.toLowerCase().includes(q),
      )
    : destinations;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mover &quot;{itemName}&quot;</DialogTitle>
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
              {/* "Raíz" siempre como opción si no es ya la actual */}
              {currentFolderId !== null ? (
                <li>
                  <button
                    type="button"
                    onClick={() => move(null)}
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
                        onClick={() => move(d.id)}
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

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
