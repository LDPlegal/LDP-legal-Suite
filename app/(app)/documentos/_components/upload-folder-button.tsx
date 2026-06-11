"use client";

// Sube una carpeta del filesystem del usuario preservando estructura.
//
// El atributo `webkitdirectory` en el <input type="file"> hace que el browser
// abra el picker de carpetas en vez del de archivos. El FileList resultante
// tiene `webkitRelativePath` en cada File con el path interno.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { subirCarpetaAction } from "@/app/_actions/carpetas/subir-carpeta";
import type { FolderScope } from "@/lib/db/queries/folders";

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

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    setProgress(`Preparando ${filesArray.length} archivos…`);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("scope", JSON.stringify(scope));
      fd.set("parentFolderId", parentFolderId ?? "");
      for (const file of filesArray) {
        fd.append("files", file);
        // webkitRelativePath es la ruta interna dentro de la carpeta pickeada.
        // Lo enviamos en paralelo con `paths` (mismo índice que files).
        fd.append("paths", file.webkitRelativePath || file.name);
      }

      const result = await subirCarpetaAction(fd);
      if (!result.ok) {
        toast.error(result.error);
        setProgress(null);
        return;
      }

      const okMsg = `${result.filesUploaded} archivos subidos · ${result.foldersCreated} carpetas creadas`;
      if (result.filesFailed.length > 0) {
        toast.warning(`${okMsg} · ${result.filesFailed.length} fallaron`);
        for (const f of result.filesFailed.slice(0, 3)) {
          toast.error(`${f.name}: ${f.error}`);
        }
      } else {
        toast.success(okMsg);
      }
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="inline-block">
      {/* Truco shadcn: el input está visualmente oculto pero accesible vía label.
          El botón hace click programático al ref. */}
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
