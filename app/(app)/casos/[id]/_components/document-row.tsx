"use client";

import Link from "next/link";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Lock,
  Pencil,
  ScanEye,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconButton, WithTooltip } from "@/components/ui/icon-button";
import { PendingIconSubmit } from "@/components/ui/pending-submit";
import { TableCell, TableRow } from "@/components/ui/table";
import { eliminarDocumentoAction } from "@/app/_actions/documentos/eliminar";
import { compartirDocumentoAction } from "@/app/_actions/documentos/compartir";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { DocumentEditDrawer } from "./document-edit-drawer";
import { DocumentSummaryDrawer } from "@/app/(app)/documentos/_components/document-summary-drawer";
import { ReprocessOneButton } from "@/app/(app)/documentos/_components/reprocess-buttons";
import { DocumentPreviewDrawer } from "@/app/(app)/documentos/_components/document-preview-drawer";
import { DocumentNewVersionButton } from "@/app/(app)/documentos/_components/document-new-version-button";
import {
  formatBytes,
  OCR_STATUS_LABEL,
  type DocumentListRow,
} from "@/lib/documents/format";

const OCR_VARIANT: Record<
  DocumentListRow["ocrStatus"],
  "secondary" | "warning" | "success" | "destructive" | "default"
> = {
  pending: "secondary",
  processing: "secondary",
  done: "success",
  failed: "destructive",
  skipped: "default",
};

export function DocumentRow({
  doc,
  caseId,
  aiEnabled,
}: {
  doc: DocumentListRow;
  caseId: string;
  aiEnabled?: boolean;
}) {
  const isImage = doc.mimeType.startsWith("image/");
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          {isImage ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <DocumentPreviewDrawer
            documentId={doc.id}
            documentName={doc.name}
            mimeType={doc.mimeType}
            trigger={
              <WithTooltip label="Abrir vista previa">
                <button
                  type="button"
                  className="truncate text-left font-medium hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  {doc.name}
                </button>
              </WithTooltip>
            }
          />
          {doc.version > 1 ? (
            <WithTooltip label={`Versión ${doc.version} — versiones anteriores en historial`}>
              <Badge variant="outline" className="font-mono text-[10px]">
                v{doc.version}
              </Badge>
            </WithTooltip>
          ) : null}
          {doc.visibility === "private" ? (
            <WithTooltip label="Privado — solo vos lo ves, el resto del equipo no.">
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Lock className="h-2.5 w-2.5" />
                Privado
              </Badge>
            </WithTooltip>
          ) : null}
        </div>
        {doc.tags.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {doc.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {doc.uploadedByName ?? "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(doc.createdAt).toLocaleDateString("es-DO", { dateStyle: "medium" })}
      </TableCell>
      <TableCell className="text-xs">{formatBytes(doc.sizeBytes)}</TableCell>
      <TableCell>
        <Badge variant={OCR_VARIANT[doc.ocrStatus]}>
          {OCR_STATUS_LABEL[doc.ocrStatus]}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <form action={compartirDocumentoAction} className="inline-block">
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="caseId" value={caseId} />
          <input
            type="hidden"
            name="shared"
            value={doc.sharedWithClient ? "false" : "true"}
          />
          <PendingIconSubmit
            className="h-7 w-7"
            label={
              doc.sharedWithClient
                ? "Visible para el cliente — clic para ocultarlo"
                : "Oculto del cliente — clic para compartirlo"
            }
          >
            {doc.sharedWithClient ? (
              <Eye className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </PendingIconSubmit>
        </form>
        <DocumentPreviewDrawer
          documentId={doc.id}
          documentName={doc.name}
          mimeType={doc.mimeType}
          trigger={
            <IconButton className="h-7 w-7" label="Vista previa (sin descargar)">
              <ScanEye className="h-3.5 w-3.5" />
            </IconButton>
          }
        />
        <WithTooltip label="Descargar archivo">
          <Link
            href={`/api/documentos/${doc.id}/download`}
            target="_blank"
            rel="noopener"
            download={doc.name}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Descargar archivo"
          >
            <Download className="h-3.5 w-3.5" />
          </Link>
        </WithTooltip>
        {aiEnabled && doc.ocrStatus === "done" ? (
          <DocumentSummaryDrawer
            documentId={doc.id}
            documentName={doc.name}
            trigger={
              <IconButton className="h-7 w-7" label="Resumir con IA">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </IconButton>
            }
          />
        ) : null}
        <ReprocessOneButton docId={doc.id} />
        <DocumentNewVersionButton
          documentId={doc.id}
          documentName={doc.name}
          currentVersion={doc.version}
          scope={{ kind: "case", caseId }}
        />
        <DocumentEditDrawer
          caseId={caseId}
          doc={{ id: doc.id, name: doc.name, tags: doc.tags }}
          trigger={
            <IconButton className="h-7 w-7" label="Editar nombre y etiquetas">
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
          }
        />
        <ConfirmButton
          action={eliminarDocumentoAction}
          title="¿Eliminar este documento?"
          description={`"${doc.name}" — esta acción es reversible (queda archivado).`}
          confirmLabel="Eliminar"
          trigger={
            <IconButton
              className="h-7 w-7 text-destructive"
              label="Eliminar (archivar)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          }
        >
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="caseId" value={caseId} />
        </ConfirmButton>
      </TableCell>
    </TableRow>
  );
}
