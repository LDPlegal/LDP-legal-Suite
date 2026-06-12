"use client";

import Link from "next/link";
import { Download, Eye, EyeOff, FileText, Image as ImageIcon, Pencil, ScanEye, Trash2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const OCR_VARIANT: Record<DocumentListRow["ocrStatus"], "secondary" | "warning" | "success" | "destructive" | "default"> = {
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
              <button
                type="button"
                className="truncate text-left font-medium hover:underline focus-visible:outline-none focus-visible:underline"
                title="Click para ver"
              >
                {doc.name}
              </button>
            }
          />
          {doc.version > 1 ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              v{doc.version}
            </Badge>
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
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={
              doc.sharedWithClient
                ? "Dejar de compartir con el cliente"
                : "Compartir con el cliente"
            }
            title={
              doc.sharedWithClient
                ? "Visible para el cliente — clic para ocultar"
                : "Oculto para el cliente — clic para compartir"
            }
          >
            {doc.sharedWithClient ? (
              <Eye className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
        </form>
        <DocumentPreviewDrawer
          documentId={doc.id}
          documentName={doc.name}
          mimeType={doc.mimeType}
          trigger={
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ver" title="Ver sin descargar">
              <ScanEye className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <Button asChild variant="ghost" size="icon" className="h-7 w-7" aria-label="Descargar" title="Descargar">
          <Link
            href={`/api/documentos/${doc.id}/download`}
            target="_blank"
            rel="noopener"
            download={doc.name}
          >
            <Download className="h-3.5 w-3.5" />
          </Link>
        </Button>
        {aiEnabled && doc.ocrStatus === "done" ? (
          <DocumentSummaryDrawer
            documentId={doc.id}
            documentName={doc.name}
            trigger={
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Resumen IA">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </Button>
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
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <ConfirmButton
          action={eliminarDocumentoAction}
          title="¿Eliminar este documento?"
          description={`"${doc.name}" — esta acción es reversible (queda archivado).`}
          confirmLabel="Eliminar"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              aria-label="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          }
        >
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="caseId" value={caseId} />
        </ConfirmButton>
      </TableCell>
    </TableRow>
  );
}
