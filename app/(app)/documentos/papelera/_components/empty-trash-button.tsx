"use client";

// Botón "Vaciar papelera" — elimina definitivamente TODOS los items.
// Doble confirmación porque es irreversible.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { vaciarPapeleraAction } from "@/app/_actions/papelera";

export function EmptyTrashButton({ itemCount }: { itemCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const r = await vaciarPapeleraAction();
      if (r.ok) {
        toast.success(
          `Papelera vaciada: ${r.deletedDocs} documento${r.deletedDocs === 1 ? "" : "s"} y ${r.deletedFolders} carpeta${r.deletedFolders === 1 ? "" : "s"} eliminados.`,
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error("No se pudo vaciar la papelera. Revisá los logs.");
      }
    });
  }

  if (itemCount === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
          Vaciar papelera
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Vaciar la papelera?</DialogTitle>
          <DialogDescription>
            Se eliminan <span className="font-medium">definitivamente</span>{" "}
            los {itemCount} item{itemCount === 1 ? "" : "s"} de la papelera —
            carpetas y documentos, incluyendo los archivos en el storage. Esta
            acción <span className="font-medium">no se puede deshacer</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={run}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Vaciar para siempre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
