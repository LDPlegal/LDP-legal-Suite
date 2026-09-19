"use client";

// Zona de "arrastrá y soltá" para subir archivos desde el escritorio.
//
// Usa el DnD NATIVO del browser (eventos dragover/drop sobre dataTransfer.files)
// distinto del DnD de @dnd-kit que mueve documentos YA existentes entre
// carpetas (ese es pointer-based). Los dos coexisten sin pisarse.
//
// Sube cada archivo con uploadFileDirect (presigned R2, bypassa el server),
// respetando el scope + la carpeta actual. Al terminar, refresca la vista.

import { useCallback, useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadFileDirect, type UploadScope } from "@/lib/uploads/client";

type Uploading = { name: string; percent: number };

export function UploadDropZone({
  scope,
  folderId,
  visibility = "case",
  onUploaded,
  label = "Arrastrá archivos aquí para subirlos",
  hint = "o hacé clic para elegirlos · se suben a esta carpeta",
}: {
  scope: UploadScope;
  folderId: string | null;
  visibility?: "case" | "private";
  onUploaded?: () => void;
  label?: string;
  hint?: string;
}) {
  const [isOver, setIsOver] = useState(false);
  const [queue, setQueue] = useState<Uploading[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Contador para dragenter/dragleave anidados, sin esto, mover el cursor
  // sobre un hijo dispara dragleave y parpadea el highlight.
  const dragDepth = useRef(0);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setQueue(files.map((f) => ({ name: f.name, percent: 0 })));
      let ok = 0;
      for (const [i, file] of files.entries()) {
        const res = await uploadFileDirect({
          scope,
          file,
          folderId,
          visibility,
          onProgress: (percent) =>
            setQueue((prev) =>
              prev.map((q, idx) => (idx === i ? { ...q, percent } : q)),
            ),
        });
        if (res.ok) ok++;
        else toast.error(`No se pudo subir ${file.name}`, { description: res.error });
      }
      setQueue([]);
      if (ok > 0) {
        toast.success(ok === 1 ? "1 archivo subido" : `${ok} archivos subidos`);
        onUploaded?.();
      }
    },
    [scope, folderId, visibility, onUploaded],
  );

  const busy = queue.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !busy) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        if (e.dataTransfer.types.includes("Files")) setIsOver(true);
      }}
      onDragOver={(e) => {
        // Necesario: sin preventDefault el browser no dispara onDrop.
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setIsOver(false);
        if (busy) return;
        const files = Array.from(e.dataTransfer.files ?? []);
        void uploadFiles(files);
      }}
      className={[
        "flex flex-col items-center justify-center gap-2 rounded-[4px] border-2 border-dashed px-6 py-8 text-center transition-all",
        busy
          ? "cursor-default border-primary/40 bg-primary/5"
          : isOver
            ? "cursor-copy border-primary bg-primary/10 ring-4 ring-primary/10"
            : "cursor-pointer border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ""; // permitir re-subir el mismo archivo
          void uploadFiles(files);
        }}
      />
      {busy ? (
        <>
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <div className="w-full max-w-sm space-y-1.5">
            {queue.map((q, i) => (
              <div key={i} className="space-y-1 text-left">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">{q.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {q.percent}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${q.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div
            className={[
              "grid h-12 w-12 place-items-center rounded-full transition-colors",
              isOver ? "bg-primary/20 text-primary" : "bg-background text-muted-foreground shadow-sm",
            ].join(" ")}
          >
            <UploadCloud className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </>
      )}
    </div>
  );
}
