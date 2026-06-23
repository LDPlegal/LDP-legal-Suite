"use client";

import Link from "next/link";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Image as ImageIcon,
  Pencil,
  ScanEye,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconButton, WithTooltip } from "@/components/ui/icon-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { eliminarDocumentoAction } from "@/app/_actions/documentos/eliminar";
import { compartirDocumentoAction } from "@/app/_actions/documentos/compartir";
import { DocumentEditDrawer } from "@/app/(app)/casos/[id]/_components/document-edit-drawer";
import { DocumentSummaryDrawer } from "./document-summary-drawer";
import { ReprocessOneButton } from "./reprocess-buttons";
import { DocumentPreviewDrawer } from "./document-preview-drawer";
import { DocumentNewVersionButton } from "./document-new-version-button";
import { OCR_STATUS_LABEL, formatBytes } from "@/lib/documents/format";
import { formatInFirmTz } from "@/lib/datetime/format";

// Row component for the global /documentos table. Distinct from the per-case
// DocumentRow because the columns and the link targets differ — but we
// reuse the same edit drawer, share toggle, delete confirm, and download.

export type GlobalDocRow = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  tags: string[];
  ocrStatus: "pending" | "processing" | "done" | "failed" | "skipped";
  version: number;
  sharedWithClient: boolean;
  createdAt: Date;
  uploadedByName: string | null;
  caseId: string | null;
  caseCode: string | null;
  ocrTextSnippet: string | null;
  // Contexto de carpeta para resultados de búsqueda. null = raíz.
  folderName?: string | null;
  folderPath?: string | null;
};

export function DocumentGlobalRow({
  doc,
  aiEnabled,
}: {
  doc: GlobalDocRow;
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
                  className="text-left font-medium hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  {doc.name}
                </button>
              </WithTooltip>
            }
          />
          {doc.version > 1 ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              v{doc.version}
            </Badge>
          ) : null}
          {doc.sharedWithClient ? (
            <Eye className="h-3.5 w-3.5 text-emerald-600" aria-label="Compartido" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="No compartido" />
          )}
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
        {doc.ocrTextSnippet ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            …{doc.ocrTextSnippet}…
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-xs">
        {doc.caseId ? (
          <Link
            href={`/casos/${doc.caseId}`}
            className="font-mono text-muted-foreground hover:underline"
          >
            {doc.caseCode}
          </Link>
        ) : (
          <Badge variant="secondary" className="text-[10px]">General</Badge>
        )}
        {/* Ubicación de carpeta — para que en búsqueda el user sepa dónde
            está el doc sin abrirlo. */}
        {doc.folderName ? (
          <div
            className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"
            title={
              doc.folderPath && doc.folderPath !== "/"
                ? `${doc.folderPath}/${doc.folderName}`
                : `/${doc.folderName}`
            }
          >
            <Folder className="h-3 w-3 shrink-0 text-amber-500" />
            <span className="truncate">{doc.folderName}</span>
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {doc.uploadedByName ?? "—"}
        <br />
        {formatInFirmTz(doc.createdAt, undefined, "dd/MM/yyyy")}
      </TableCell>
      <TableCell className="text-xs tabular-nums">{formatBytes(doc.sizeBytes)}</TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {OCR_STATUS_LABEL[doc.ocrStatus]}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {/* Toggle compartir con cliente. Solo aplica si el doc está vinculado
            a un caso (porque el portal filtra por client_id via cases). */}
        {doc.caseId ? (
          <form action={compartirDocumentoAction} className="inline-block">
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="caseId" value={doc.caseId} />
            <input
              type="hidden"
              name="shared"
              value={doc.sharedWithClient ? "false" : "true"}
            />
            <IconButton
              type="submit"
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
            </IconButton>
          </form>
        ) : null}
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
              <IconButton
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                label="Resumir con IA"
              >
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
          scope={
            doc.caseId
              ? { kind: "case", caseId: doc.caseId }
              : { kind: "firm" }
          }
        />
        <DocumentEditDrawer
          caseId={doc.caseId}
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
              label="Eliminar (archivar — reversible)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          }
        >
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="caseId" value={doc.caseId ?? ""} />
        </ConfirmButton>
      </TableCell>
    </TableRow>
  );
}
