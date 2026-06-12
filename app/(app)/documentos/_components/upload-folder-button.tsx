"use client";

// Sube una carpeta del filesystem del user preservando estructura.
//
// REWRITE (Fase 6 fix bug "Application error"):
//   La versión anterior mandaba TODOS los archivos en UN solo POST a
//   subirCarpetaAction. Eso chocaba con el bodySizeLimit de Next.js (10mb)
//   y memory limits de Vercel — cualquier carpeta de caso real con un par
//   de PDFs explotaba la action y React tree → "Application error".
//
//   Ahora: dos fases independientes.
//     1) Una llamada chiquita (texto) que crea la jerarquía de carpetas y
//        devuelve un mapa { path → folderId }.
//     2) Loop client-side: por cada archivo, un POST independiente vía
//        uploadDocumentAction / uploadDocumentGlobalAction (las mismas
//        que usa el upload single-file, ya validadas con OCR).
//
//   Beneficios:
//     - Cada POST es <= 25 MB (un archivo).
//     - Progress per-file natural.
//     - Errores por archivo no matan el lote.
//     - Reusa código battle-tested.
//
// Decisión: el browser pickea la carpeta vía <input webkitdirectory> y
// FileList trae `webkitRelativePath` con el path interno.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crearEstructuraCarpetasAction } from "@/app/_actions/carpetas/crear-estructura";
import { uploadDocumentAction } from "@/app/_actions/documentos/upload";
import { uploadDocumentGlobalAction } from "@/app/_actions/documentos/upload-global";
import type { FolderScope } from "@/lib/db/queries/folders";

const MAX_FILES = 500;
const MAX_PER_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — match server upload limit

export function UploadFolderButton({
  parentFolderId,
  scope,
}: {
  parentFolderId: string | null;
  scope: FolderScope;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);

  function resetInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filesList = e.currentTarget.files;
    if (!filesList || filesList.length === 0) return;

    // Filter junk OS-level files que aparecen al subir carpetas en Mac/Win.
    const filesArray = Array.from(filesList).filter(
      (f) =>
        f.name !== ".DS_Store" &&
        f.name !== "Thumbs.db" &&
        f.name !== "desktop.ini" &&
        f.size > 0,
    );

    if (filesArray.length === 0) {
      toast.error("La carpeta no tiene archivos válidos (o están vacíos).");
      resetInput();
      return;
    }

    if (filesArray.length > MAX_FILES) {
      toast.error(
        `Demasiados archivos (${filesArray.length}). Máximo: ${MAX_FILES}. Subí en lotes más chicos.`,
      );
      resetInput();
      return;
    }

    const tooBig = filesArray.find((f) => f.size > MAX_PER_FILE_BYTES);
    if (tooBig) {
      toast.error(
        `"${tooBig.name}" excede 25 MB (${(tooBig.size / 1024 / 1024).toFixed(1)} MB). Subilo aparte.`,
      );
      resetInput();
      return;
    }

    // Wrap todo en try/catch al nivel del transition para que un error
    // inesperado del lado del server NO crashee el React tree (ese es
    // el origen del "Application error: a client-side exception" que
    // motivó este rewrite).
    startTransition(async () => {
      try {
        // ── FASE 1: armar el set de carpetas únicas a crear ──
        const dirSet = new Set<string>();
        for (const f of filesArray) {
          const rel = f.webkitRelativePath || f.name;
          const segments = rel.split("/").filter(Boolean);
          if (segments.length <= 1) continue;
          for (let i = 1; i < segments.length; i++) {
            dirSet.add(segments.slice(0, i).join("/"));
          }
        }
        const dirPaths = [...dirSet];

        setProgress(
          dirPaths.length > 0
            ? `Creando ${dirPaths.length} carpetas…`
            : "Preparando subida…",
        );

        // ── FASE 2: crear la jerarquía via server action ligera ──
        const structResult = await crearEstructuraCarpetasAction({
          scope,
          parentFolderId,
          dirPaths,
        });

        if (!structResult.ok) {
          toast.error(structResult.error);
          setProgress(null);
          resetInput();
          return;
        }

        const { pathToId, foldersCreated } = structResult;

        // ── FASE 3: subir cada archivo independientemente ──
        let uploaded = 0;
        const failures: Array<{ name: string; error: string }> = [];

        for (let i = 0; i < filesArray.length; i++) {
          const file = filesArray[i]!;
          const rel = file.webkitRelativePath || file.name;
          const segments = rel.split("/").filter(Boolean);
          const dirPath = segments.slice(0, -1).join("/");
          const targetFolderId =
            dirPath === ""
              ? parentFolderId
              : (pathToId[dirPath] ?? parentFolderId);

          setProgress(`Subiendo ${i + 1}/${filesArray.length}: ${file.name}`);

          const fd = new FormData();
          fd.set("file", file);
          if (targetFolderId) fd.set("folderId", targetFolderId);

          try {
            let result: { ok: true; documentId: string } | { ok: false; error: string };
            if (scope.kind === "case") {
              // La action de caso requiere caseId.
              fd.set("caseId", scope.caseId);
              result = await uploadDocumentAction(undefined, fd);
            } else {
              // Firm-wide o cliente — caseId queda null.
              result = await uploadDocumentGlobalAction(undefined, fd);
            }

            if (result.ok) {
              uploaded += 1;
            } else {
              failures.push({ name: file.name, error: result.error });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failures.push({ name: file.name, error: msg });
          }
        }

        // ── FASE 4: reporte final ──
        setProgress(null);
        resetInput();

        if (failures.length === 0) {
          toast.success(
            `${uploaded} archivo${uploaded === 1 ? "" : "s"} · ${foldersCreated} carpeta${foldersCreated === 1 ? "" : "s"}`,
          );
        } else if (uploaded > 0) {
          toast.warning(
            `${uploaded}/${filesArray.length} subidos · ${failures.length} fallaron`,
          );
          for (const f of failures.slice(0, 3)) {
            toast.error(`${f.name}: ${f.error}`);
          }
        } else {
          toast.error(
            `Ningún archivo se subió. Primer error: ${failures[0]?.error ?? "desconocido"}`,
          );
        }

        router.refresh();
      } catch (err) {
        // Safety net — cualquier excepción que escape termina como toast,
        // no como crash de la app.
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[UploadFolderButton] uncaught:", err);
        toast.error(`Error inesperado al subir la carpeta: ${msg}`);
        setProgress(null);
        resetInput();
      }
    });
  }

  return (
    <div className="inline-block">
      {/* Input oculto con webkitdirectory — el browser muestra picker de carpeta. */}
      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error — webkitdirectory no está en los typings estándar de React
        webkitdirectory="true"
        directory="true"
        multiple
        onChange={handleChange}
        className="sr-only"
        id="upload-folder-input"
        disabled={pending}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        title="Subir una carpeta del filesystem (preserva estructura interna)"
      >
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FolderUp className="mr-2 h-4 w-4" />
        )}
        {pending ? (progress ?? "Subiendo…") : "Subir carpeta"}
      </Button>
    </div>
  );
}
