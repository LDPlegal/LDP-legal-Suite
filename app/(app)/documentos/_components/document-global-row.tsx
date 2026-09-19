"use client";

import Link from "next/link";
import {
  Eye,
  EyeOff,
  FileText,
  Folder,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WithTooltip } from "@/components/ui/icon-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { DocumentPreviewDrawer } from "./document-preview-drawer";
import { DocumentActionsMenu } from "@/app/(app)/casos/[id]/_components/document-actions-menu";
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
  visibility: "case" | "private";
  uploadedById: string | null;
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
  currentUserId,
}: {
  doc: GlobalDocRow;
  aiEnabled?: boolean;
  currentUserId?: string;
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
            aiEnabled={aiEnabled}
            trigger={
              <button
                type="button"
                title="Abrir vista previa"
                className="text-left font-medium hover:underline focus-visible:outline-none focus-visible:underline"
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
          {doc.visibility === "private" ? (
            <WithTooltip label="Privado — solo vos lo ves.">
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Lock className="h-2.5 w-2.5" />
                Privado
              </Badge>
            </WithTooltip>
          ) : null}
          {doc.sharedWithClient ? (
            <Eye className="h-3.5 w-3.5 text-action" aria-label="Compartido" />
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
            <Folder className="h-3 w-3 shrink-0 text-warning" />
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
        <DocumentActionsMenu
          doc={{
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            tags: doc.tags,
            version: doc.version,
            ocrStatus: doc.ocrStatus,
            sharedWithClient: doc.sharedWithClient,
            visibility: doc.visibility,
            uploadedById: doc.uploadedById,
          }}
          caseId={doc.caseId}
          aiEnabled={aiEnabled}
          currentUserId={currentUserId}
          scope={doc.caseId ? { kind: "case", caseId: doc.caseId } : { kind: "firm" }}
        />
      </TableCell>
    </TableRow>
  );
}
