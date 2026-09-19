"use client";

// Menú de acciones "⋮" (tres puntitos) para un documento. Reemplaza la fila
// de ~8 botones por un solo botón que abre un dropdown limpio. Las acciones
// que requieren un drawer (vista previa, editar, resumir IA, nueva versión)
// se controlan por estado desde acá, los drawers se renderizan al final,
// fuera del dropdown, y se abren al elegir el item correspondiente.

import { useState, useTransition } from "react";
import {
  Download,
  Eye,
  EyeOff,
  FileUp,
  FolderInput,
  Lock,
  MoreVertical,
  Pencil,
  RotateCcw,
  ScanEye,
  Sparkles,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentPreviewDrawer } from "@/app/(app)/documentos/_components/document-preview-drawer";
import { DocumentSummaryDrawer } from "@/app/(app)/documentos/_components/document-summary-drawer";
import { DocumentNewVersionButton } from "@/app/(app)/documentos/_components/document-new-version-button";
import { DocumentEditDrawer } from "./document-edit-drawer";
import { eliminarDocumentoAction } from "@/app/_actions/documentos/eliminar";
import { compartirDocumentoAction } from "@/app/_actions/documentos/compartir";
import { cambiarVisibilidadDocumentoAction } from "@/app/_actions/documentos/visibilidad";
import { reprocessOneDocAction } from "@/app/_actions/documentos/reprocess";
import type { UploadScope } from "@/lib/uploads/client";

export type DocForMenu = {
  id: string;
  name: string;
  mimeType: string;
  tags: string[];
  version: number;
  ocrStatus: string;
  sharedWithClient: boolean;
  visibility: "case" | "private";
  uploadedById?: string | null;
};

export function DocumentActionsMenu({
  doc,
  caseId,
  aiEnabled,
  currentUserId,
  scope,
  moveToFolderSlot,
}: {
  doc: DocForMenu;
  /** Caso al que pertenece el doc. null = doc firm/client-wide (global). */
  caseId: string | null;
  aiEnabled?: boolean;
  currentUserId?: string;
  /** Scope para subir nueva versión. Default: case scope si hay caseId. */
  scope?: UploadScope;
  /** Item opcional "Mover a otra carpeta", lo provee la vista por carpetas. */
  moveToFolderSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<
    "preview" | "summary" | "edit" | "version" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  // Mover a "mi carpeta" / "documentos del caso": solo aplica a docs de un
  // caso, y solo el dueño puede hacerlo.
  const canMove =
    !!caseId && (!currentUserId || doc.uploadedById === currentUserId);
  const uploadScope: UploadScope =
    scope ?? (caseId ? { kind: "case", caseId } : { kind: "firm" });
  const downloadUrl = `/api/documentos/${doc.id}/download`;

  function share() {
    if (!caseId) return;
    start(async () => {
      const fd = new FormData();
      fd.set("documentId", doc.id);
      fd.set("caseId", caseId);
      fd.set("shared", doc.sharedWithClient ? "false" : "true");
      await compartirDocumentoAction(fd);
      router.refresh();
    });
  }

  function move(visibility: "case" | "private") {
    start(async () => {
      const r = await cambiarVisibilidadDocumentoAction({ documentId: doc.id, visibility });
      if (r.ok) {
        toast.success(
          visibility === "private"
            ? "Movido a tu carpeta privada"
            : "Movido a documentos del caso",
        );
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function reprocess() {
    start(async () => {
      const r = await reprocessOneDocAction(doc.id);
      if (r.ok) {
        toast.success("OCR reprocesado");
        router.refresh();
      } else {
        toast.error("No se pudo reprocesar", { description: r.error });
      }
    });
  }

  function del() {
    start(async () => {
      const fd = new FormData();
      fd.set("documentId", doc.id);
      if (caseId) fd.set("caseId", caseId);
      await eliminarDocumentoAction(fd);
      setConfirmDelete(false);
      toast.success("Documento archivado");
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton className="h-8 w-8" label="Más acciones" disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setDrawer("preview")}>
            <ScanEye className="h-4 w-4 text-muted-foreground" />
            Vista previa
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={downloadUrl} target="_blank" rel="noopener" download={doc.name}>
              <Download className="h-4 w-4 text-muted-foreground" />
              Descargar
            </a>
          </DropdownMenuItem>
          {aiEnabled && doc.ocrStatus === "done" ? (
            <DropdownMenuItem onClick={() => setDrawer("summary")}>
              <Sparkles className="h-4 w-4 text-primary" />
              Resumir con IA
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setDrawer("edit")}>
            <Pencil className="h-4 w-4 text-muted-foreground" />
            Editar nombre y etiquetas
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDrawer("version")}>
            <FileUp className="h-4 w-4 text-muted-foreground" />
            Subir nueva versión
          </DropdownMenuItem>
          <DropdownMenuItem onClick={reprocess}>
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            Reprocesar OCR
          </DropdownMenuItem>

          {moveToFolderSlot}

          {canMove ? (
            <DropdownMenuItem
              onClick={() => move(doc.visibility === "private" ? "case" : "private")}
            >
              {doc.visibility === "private" ? (
                <>
                  <FolderInput className="h-4 w-4 text-muted-foreground" />
                  Mover a documentos del caso
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Mover a mi carpeta
                </>
              )}
            </DropdownMenuItem>
          ) : null}

          {caseId ? (
            <DropdownMenuItem onClick={share}>
              {doc.sharedWithClient ? (
                <>
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  Ocultar del cliente
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 text-action" />
                  Compartir con cliente
                </>
              )}
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar (archivar)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Drawers controlados, se montan siempre pero solo abren según estado */}
      <DocumentPreviewDrawer
        documentId={doc.id}
        documentName={doc.name}
        mimeType={doc.mimeType}
        aiEnabled={aiEnabled}
        open={drawer === "preview"}
        onOpenChange={(v) => setDrawer(v ? "preview" : null)}
      />
      <DocumentSummaryDrawer
        documentId={doc.id}
        documentName={doc.name}
        open={drawer === "summary"}
        onOpenChange={(v) => setDrawer(v ? "summary" : null)}
      />
      <DocumentEditDrawer
        caseId={caseId}
        doc={{ id: doc.id, name: doc.name, tags: doc.tags }}
        open={drawer === "edit"}
        onOpenChange={(v) => setDrawer(v ? "edit" : null)}
      />
      <DocumentNewVersionButton
        documentId={doc.id}
        documentName={doc.name}
        currentVersion={doc.version}
        scope={uploadScope}
        hideTrigger
        open={drawer === "version"}
        onOpenChange={(v) => setDrawer(v ? "version" : null)}
      />

      <Dialog open={confirmDelete} onOpenChange={(v) => !pending && setConfirmDelete(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar este documento?</DialogTitle>
            <DialogDescription>
              &quot;{doc.name}&quot;, esta acción es reversible (queda archivado).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={del} disabled={pending}>
              {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
