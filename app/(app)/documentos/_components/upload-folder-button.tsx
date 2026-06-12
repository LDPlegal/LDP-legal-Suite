"use client";

// Sube una carpeta del filesystem preservando estructura.
//
// Fase 7 — direct upload via presigned URLs (R2/S3 en prod, endpoint local
// en dev). Antes el browser subía cada archivo via server action (cap 25 MB,
// chocaba con bodySizeLimit de Vercel). Ahora cada archivo va DIRECTO al
// storage (cap real: 500 MB).
//
// Flow por archivo:
//   1. uploadFileDirect() pide presigned URL al server.
//   2. XHR PUT del file al storage (con progress real).
//   3. completarUploadAction crea el record en DB + OCR.
//
// La jerarquía de carpetas se crea ANTES con crearEstructuraCarpetasAction
// (un solo POST chiquito con los paths).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crearEstructuraCarpetasAction } from "@/app/_actions/carpetas/crear-estructura";
import { uploadFileDirect } from "@/lib/uploads/client";
import { MAX_UPLOAD_BYTES } from "@/app/_actions/documentos/preparar-upload";
import type { FolderScope } from "@/lib/db/queries/folders";

const MAX_FILES = 500;

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
        `Demasiados archivos (${filesArray.length}). Máximo: ${MAX_FILES}.`,
      );
      resetInput();
      return;
    }

    const tooBig = filesArray.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig) {
      toast.error(
        `"${tooBig.name}" excede ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      );
      resetInput();
      return;
    }

    startTransition(async () => {
      try {
        // ── FASE 1: armar set de carpetas únicas ──
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

        // ── FASE 2: crear jerarquía ──
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

        // ── FASE 3: subir cada archivo DIRECTO al storage ──
        // Mapeamos FolderScope → UploadScope (sólo agregar el tipo). La
        // FolderScope tiene los mismos kinds que necesitamos.
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

          const result = await uploadFileDirect({
            scope,
            file,
            folderId: targetFolderId,
            onProgress: (pct) => {
              setProgress(
                `${i + 1}/${filesArray.length}: ${file.name} (${pct}%)`,
              );
            },
          });

          if (result.ok) {
            uploaded += 1;
          } else {
            failures.push({ name: file.name, error: result.error });
          }
        }

        // ── FASE 4: reporte ──
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
      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error — webkitdirectory no está en los typings de React
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
