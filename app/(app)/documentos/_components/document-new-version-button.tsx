"use client";

// Botón "Nueva versión" para reemplazar el contenido de un documento.
//
// UX:
//   - Botón de icono (Upload) en la fila del documento.
//   - Click abre un Dialog con file input + nombre del doc actual + caja
//     informativa explicando qué pasa con la versión vieja (se mantiene
//     en histórico).
//   - Al confirmar, sube el archivo y revalida — el listado refresca y
//     el badge de versión sube a v2/v3/etc.
//
// Diferencia con upload normal: este action NO pide caseId — lo hereda
// del parent. Tampoco pide tags — los hereda. Es un "reemplazo en línea".

import { useRef, useState, useActionState } from "react";
import { Loader2, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  nuevaVersionAction,
  type NuevaVersionState,
} from "@/app/_actions/documentos/nueva-version";
import { formatBytes } from "@/lib/documents/format";

const initial: NuevaVersionState = { ok: true, documentId: "", version: 0 };

export function DocumentNewVersionButton({
  documentId,
  documentName,
  currentVersion,
}: {
  documentId: string;
  documentName: string;
  currentVersion: number;
}) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, action, pending] = useActionState<NuevaVersionState, FormData>(
    async (_prev, fd) => {
      const result = await nuevaVersionAction(_prev, fd);
      if (result.ok) {
        toast.success(`Nueva versión subida (v${result.version})`);
        setOpen(false);
        setSelectedFile(null);
      }
      return result;
    },
    initial,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSelectedFile(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Subir nueva versión"
          title="Subir nueva versión de este documento"
        >
          <FileUp className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva versión</DialogTitle>
          <DialogDescription>
            Subí un archivo de reemplazo para{" "}
            <span className="font-medium">{documentName}</span>. La versión
            actual (v{currentVersion}) queda en histórico — nunca se borra,
            podés volver a ella si hace falta.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="parentDocumentId" value={documentId} />

          <div className="space-y-1.5">
            <Label htmlFor="file-input-new-version">Archivo *</Label>
            <input
              ref={fileInputRef}
              id="file-input-new-version"
              type="file"
              name="file"
              required
              onChange={(e) => setSelectedFile(e.currentTarget.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            {selectedFile ? (
              <p className="text-xs text-muted-foreground">
                {selectedFile.name} · {formatBytes(selectedFile.size)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Hasta 25 MB. Los tags, caso, y permisos de compartir con
                cliente se heredan automáticamente.
              </p>
            )}
          </div>

          {!state.ok && state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !selectedFile}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Subir versión {currentVersion + 1}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
