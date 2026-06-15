"use client";

// Dialog para renombrar una carpeta. Pre-rellena el nombre actual.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { renombrarCarpetaAction } from "@/app/_actions/carpetas/renombrar";

export function RenameFolderDialog({
  folderId,
  currentName,
}: {
  folderId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await renombrarCarpetaAction({ folderId, name: trimmed });
      if (r.ok) {
        toast.success(`Renombrada a "${r.name}"`);
        setOpen(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setName(currentName);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Renombrar carpeta"
          title="Renombrar"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renombrar carpeta</DialogTitle>
          <DialogDescription>
            El nuevo nombre se aplica a la carpeta y se refleja en la ruta de
            todo lo que cuelga de ella.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rename-folder-input">Nombre *</Label>
            <Input
              id="rename-folder-input"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !pending) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !name.trim() || name.trim() === currentName}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
