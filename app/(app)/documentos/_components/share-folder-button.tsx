"use client";

// Botón "Compartir con cliente" en FolderCard.
//
// Dialog con dos botones: compartir-todos (cascada shared=true) o quitar
// (cascada shared=false). Cliente y casos sin caso asociado quedan exentos.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { compartirCarpetaAction } from "@/app/_actions/carpetas/compartir";

export function ShareFolderButton({
  folderId,
  folderName,
}: {
  folderId: string;
  folderName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(shared: boolean) {
    startTransition(async () => {
      const r = await compartirCarpetaAction({ folderId, shared });
      if (r.ok) {
        toast.success(
          shared
            ? `${r.updated} documento${r.updated === 1 ? "" : "s"} compartido${r.updated === 1 ? "" : "s"} con cliente`
            : `${r.updated} documento${r.updated === 1 ? "" : "s"} ya no se comparten`,
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton
          className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
          label="Compartir o quitar de portal cliente (cascada en toda la carpeta)"
        >
          <Eye className="h-3.5 w-3.5 text-action" />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compartir &quot;{folderName}&quot; con cliente</DialogTitle>
          <DialogDescription>
            Aplica en cascada a TODOS los docs en esta carpeta y sus subcarpetas.
            Solo docs vinculados a un caso (con cliente asociado) entran al
            portal, los docs general/firm-wide quedan exentos. Reversible.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => run(false)}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Quitar compartido
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => run(true)} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Compartir todos
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
