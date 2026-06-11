"use client";

// Dialog para crear una carpeta nueva en el nivel actual.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2 } from "lucide-react";
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
import { crearCarpetaAction } from "@/app/_actions/carpetas/crear";
import type { FolderScope } from "@/lib/db/queries/folders";

export function NewFolderDialog({
  parentFolderId,
  scope,
}: {
  parentFolderId: string | null;
  scope: FolderScope;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await crearCarpetaAction({
        name: name.trim(),
        parentFolderId,
        scope,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(`Carpeta "${r.folder.name}" creada`);
      setName("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setName("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FolderPlus className="mr-2 h-4 w-4" />
          Nueva carpeta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva carpeta</DialogTitle>
          <DialogDescription>
            Se creará dentro del nivel actual. Los nombres son únicos por nivel
            (no podés tener dos &quot;Demandas&quot; en la misma carpeta padre).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Nombre *</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Ej. Demandas 2026"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !pending) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Sin caracteres especiales (/ \ : * ? &quot; &lt; &gt; |).
            </p>
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
          <Button type="button" onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
