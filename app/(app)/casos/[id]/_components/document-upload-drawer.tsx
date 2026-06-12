"use client";

// Subida de documentos al caso — multi-archivo y carpeta completa.
//
// Diseño:
//   - El user puede elegir: 1 archivo, N archivos sueltos, o una carpeta
//     completa (HTML5 webkitdirectory). En todos los casos terminamos con
//     un array de File objects.
//   - La carpeta se "aplana": todos los archivos se suben al raíz del caso.
//     Las subcarpetas no se preservan en la DB (sería ruido) — pero
//     mostramos el path relativo en la UI para que sepas qué estás subiendo.
//   - Las etiquetas que pongas aplican a TODOS los archivos.
//   - Los archivos se suben SECUENCIAL (uno por uno) para evitar timeouts
//     en Vercel y dar progress feedback por archivo.

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FilePlus,
  FolderUp,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { uploadFileDirect } from "@/lib/uploads/client";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";

type QueueItem = {
  id: string; // stable per file durante esta sesión del drawer
  file: File;
  /** Path relativo si vino de webkitdirectory — "MyFolder/sub/file.pdf".
   *  Si vino de file picker normal, igual al nombre. */
  relPath: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

const MAX_PER_FILE_BYTES = MAX_UPLOAD_BYTES; // 500 MB con direct upload (Fase 7)
const MAX_BATCH_FILES = 200; // soft cap para evitar lockear el browser

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentUploadDrawer({
  trigger,
  caseId,
  folderId = null,
}: {
  trigger: ReactNode;
  caseId: string;
  /** Si el user está navegando dentro de una carpeta, los archivos van a esa
   *  carpeta. null = raíz del caso. */
  folderId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState("");
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming: QueueItem[] = [];
    for (const f of Array.from(list)) {
      // Skip macOS / Windows junk files.
      if (f.name === ".DS_Store" || f.name === "Thumbs.db") continue;
      // webkitRelativePath solo lo setea el browser cuando viene de un
      // input con `webkitdirectory`. Si no, queda vacío.
      const relPath =
        (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      incoming.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`,
        file: f,
        relPath,
        status: "queued",
      });
    }
    setQueue((prev) => {
      const merged = [...prev, ...incoming];
      if (merged.length > MAX_BATCH_FILES) {
        toast.warning(
          `Solo agregué los primeros ${MAX_BATCH_FILES} archivos. Subí en lotes más chicos.`,
        );
        return merged.slice(0, MAX_BATCH_FILES);
      }
      return merged;
    });
  }

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  function clearQueue() {
    setQueue([]);
  }

  async function uploadOne(item: QueueItem): Promise<void> {
    // Validación cliente — el server también valida, pero evitamos un
    // round-trip si claramente excede.
    if (item.file.size === 0) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "error", error: "Archivo vacío" } : q,
        ),
      );
      return;
    }
    if (item.file.size > MAX_PER_FILE_BYTES) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: "error",
                error: `Excede ${MAX_PER_FILE_BYTES / 1024 / 1024} MB (${formatBytes(item.file.size)})`,
              }
            : q,
        ),
      );
      return;
    }

    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: "uploading" } : q)),
    );

    const tagList =
      tags.trim().length > 0
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

    try {
      const r = await uploadFileDirect({
        scope: { kind: "case", caseId },
        file: item.file,
        folderId: folderId ?? null,
        tags: tagList,
      });
      if (r.ok) {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "done" } : q)),
        );
      } else {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error", error: r.error } : q,
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "error", error: msg } : q,
        ),
      );
    }
  }

  async function uploadAll() {
    if (uploading) return;
    const pending = queue.filter((q) => q.status === "queued" || q.status === "error");
    if (pending.length === 0) return;

    setUploading(true);
    try {
      // Secuencial — más amigable con el server (Vercel function limit
      // por request, OCR fire-and-forget en cada uno) y con el progress
      // bar visual.
      for (const item of pending) {
        // Recheck el estado actual de la cola — el user puede haber
        // borrado el item mientras subía.
        const stillThere = queue.find((q) => q.id === item.id);
        if (!stillThere) continue;
        await uploadOne(item);
      }

      const after = queue.filter((q) => q.status === "done").length;
      const errors = queue.filter((q) => q.status === "error").length;
      if (errors === 0 && after === 0) {
        // Estado raro — recheck con setState callback indirecto.
        setQueue((prev) => prev); // noop para forzar re-render
      }

      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  // Cierra el drawer y resetea TODO si todo se subió OK.
  function tryCloseAfterUpload() {
    const errors = queue.filter((q) => q.status === "error").length;
    const done = queue.filter((q) => q.status === "done").length;
    if (errors === 0 && done > 0 && done === queue.length) {
      toast.success(
        `${done} archivo${done === 1 ? "" : "s"} subido${done === 1 ? "" : "s"}.`,
      );
      setOpen(false);
      setQueue([]);
      setTags("");
    } else if (done > 0 && errors > 0) {
      toast.warning(
        `Subí ${done}/${queue.length}. ${errors} fallaron — revisá la lista.`,
      );
    }
  }

  // Total bytes para mostrar
  const totalBytes = queue.reduce((sum, q) => sum + q.file.size, 0);
  const doneCount = queue.filter((q) => q.status === "done").length;
  const errorCount = queue.filter((q) => q.status === "error").length;
  const allDone = queue.length > 0 && doneCount === queue.length;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          // Si cierran a mitad del upload, conservar la cola para no perder
          // el progreso visible si reabren. Pero si todo está done o nada
          // pendiente, limpiar.
          if (!uploading && (allDone || queue.length === 0)) {
            setQueue([]);
            setTags("");
          }
        }
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Subir documentos</SheetTitle>
          <SheetDescription>
            PDF, imagen u otros archivos. Podés elegir varios archivos a la vez
            o subir una carpeta completa. Máximo 25 MB por archivo.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-4">
          {/* Pickers */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => filesInputRef.current?.click()}
              disabled={uploading}
            >
              <FilePlus className="h-4 w-4" />
              Seleccionar archivos
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
              disabled={uploading}
              title="Selecciona una carpeta — todos sus archivos se suben al caso"
            >
              <FolderUp className="h-4 w-4" />
              Seleccionar carpeta
            </Button>
          </div>

          {/* Inputs ocultos */}
          <input
            ref={filesInputRef}
            type="file"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error — webkitdirectory no está en los types estándar
            webkitdirectory=""
            directory=""
            onChange={(e) => addFiles(e.target.files)}
            className="hidden"
          />

          {/* Etiquetas comunes */}
          <div className="space-y-1.5">
            <Label htmlFor="batch-tags">Etiquetas (aplican a todos)</Label>
            <Input
              id="batch-tags"
              value={tags}
              onChange={(e) => setTags(e.currentTarget.value)}
              placeholder="Coma separadas: contrato, firmado, original"
              disabled={uploading}
            />
            <p className="text-[11px] text-muted-foreground">
              Útiles para filtrar luego. No son requeridas.
            </p>
          </div>

          {/* Lista de archivos */}
          {queue.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Archivos a subir ({queue.length})
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    {formatBytes(totalBytes)} total
                    {doneCount > 0 ? ` · ${doneCount} listos` : ""}
                    {errorCount > 0 ? ` · ${errorCount} fallaron` : ""}
                  </span>
                </p>
                {!uploading ? (
                  <button
                    type="button"
                    onClick={clearQueue}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                  >
                    Quitar todos
                  </button>
                ) : null}
              </div>
              <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border bg-card p-2">
                {queue.map((q) => (
                  <li
                    key={q.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/30"
                  >
                    <StatusIcon status={q.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{q.relPath}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(q.file.size)}
                        {q.error ? (
                          <span className="ml-2 text-destructive">· {q.error}</span>
                        ) : null}
                      </p>
                    </div>
                    {!uploading && q.status !== "done" ? (
                      <button
                        type="button"
                        onClick={() => removeItem(q.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Quitar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-md border border-dashed bg-muted/30 p-4 text-center text-[12px] text-muted-foreground">
              Aún no agregaste archivos. Usá los botones de arriba.
            </p>
          )}
        </SheetBody>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (allDone || queue.length === 0) tryCloseAfterUpload();
              setOpen(false);
            }}
            disabled={uploading}
          >
            {allDone ? "Cerrar" : "Cancelar"}
          </Button>
          <Button
            type="button"
            onClick={async () => {
              await uploadAll();
              tryCloseAfterUpload();
            }}
            disabled={uploading || queue.length === 0 || allDone}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {uploading
              ? "Subiendo..."
              : allDone
                ? "Todo subido"
                : `Subir ${queue.filter((q) => q.status !== "done").length} archivo${
                    queue.filter((q) => q.status !== "done").length === 1 ? "" : "s"
                  }`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StatusIcon({ status }: { status: QueueItem["status"] }) {
  if (status === "uploading") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  }
  if (status === "done") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  }
  if (status === "error") {
    return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  }
  return <FilePlus className="h-4 w-4 shrink-0 text-muted-foreground" />;
}
