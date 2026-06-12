"use client";

// Botón "Nueva versión" para reemplazar el contenido de un documento.
//
// Fase 7 — usa direct upload via presigned URL (R2/S3 en prod). El archivo
// va directo al storage; este botón solo crea el record en DB apuntando al
// padre. Tope 500 MB.

import { useRef, useState, useTransition } from "react";
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
import { uploadFileDirect, type UploadScope } from "@/lib/uploads/client";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";
import { formatBytes } from "@/lib/documents/format";

export function DocumentNewVersionButton({
  documentId,
  documentName,
  currentVersion,
  scope,
}: {
  documentId: string;
  documentName: string;
  currentVersion: number;
  /** Scope donde vive el padre (case / client / firm). Necesario para
   *  el storage key del nuevo upload. */
  scope: UploadScope;
}) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!selectedFile) return;
    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setError(
        `Archivo excede ${MAX_UPLOAD_BYTES / 1024 / 1024} MB (${formatBytes(selectedFile.size)}).`,
      );
      return;
    }

    setError(null);
    setProgress(0);

    startTransition(async () => {
      try {
        const result = await uploadFileDirect({
          scope,
          file: selectedFile,
          parentDocumentId: documentId,
          onProgress: (pct) => setProgress(pct),
        });
        if (result.ok) {
          toast.success(`Nueva versión subida (v${currentVersion + 1})`);
          setOpen(false);
          setSelectedFile(null);
          setProgress(null);
        } else {
          setError(result.error);
          setProgress(null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[DocumentNewVersionButton] uncaught:", err);
        setError(`Error inesperado: ${msg}`);
        setProgress(null);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSelectedFile(null);
          setError(null);
          setProgress(null);
        }
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
            podés volver a ella si hace falta. Tope: {MAX_UPLOAD_BYTES / 1024 / 1024} MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="file-input-new-version">Archivo *</Label>
            <input
              ref={fileInputRef}
              id="file-input-new-version"
              type="file"
              onChange={(e) =>
                setSelectedFile(e.currentTarget.files?.[0] ?? null)
              }
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              disabled={pending}
            />
            {selectedFile ? (
              <p className="text-xs text-muted-foreground">
                {selectedFile.name} · {formatBytes(selectedFile.size)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Los tags, caso, y permisos de compartir con cliente se heredan
                automáticamente del documento original.
              </p>
            )}
          </div>

          {progress !== null && pending ? (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Subiendo… {progress}%
              </p>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
              disabled={pending || !selectedFile}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Subir versión {currentVersion + 1}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
