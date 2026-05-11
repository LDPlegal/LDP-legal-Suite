"use client";

import Link from "next/link";
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { eliminarDocumentoAction } from "@/app/_actions/documentos/eliminar";
import { compartirDocumentoAction } from "@/app/_actions/documentos/compartir";
import { DocumentEditDrawer } from "@/app/(app)/casos/[id]/_components/document-edit-drawer";
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
};

export function DocumentGlobalRow({ doc }: { doc: GlobalDocRow }) {
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
          <Link
            href={`/api/documentos/${doc.id}/download`}
            target="_blank"
            rel="noopener"
            className="font-medium hover:underline"
          >
            {doc.name}
          </Link>
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
          "—"
        )}
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
        ) : null}
        <Link
          href={`/api/documentos/${doc.id}/download`}
          target="_blank"
          rel="noopener"
          download={doc.name}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Descargar"
        >
          <Download className="h-3.5 w-3.5" />
        </Link>
        {doc.caseId ? (
          <DocumentEditDrawer
            caseId={doc.caseId}
            doc={{ id: doc.id, name: doc.name, tags: doc.tags }}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Editar documento"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            }
          />
        ) : null}
        {doc.caseId ? (
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
            <input type="hidden" name="caseId" value={doc.caseId} />
          </ConfirmButton>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
