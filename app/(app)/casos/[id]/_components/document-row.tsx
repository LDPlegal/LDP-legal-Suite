"use client";

import {
  FileText,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WithTooltip } from "@/components/ui/icon-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { DocumentPreviewDrawer } from "@/app/(app)/documentos/_components/document-preview-drawer";
import { DocumentActionsMenu } from "./document-actions-menu";
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
  currentUserId,
}: {
  doc: DocumentListRow;
  caseId: string;
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
          caseId={caseId}
          aiEnabled={aiEnabled}
          currentUserId={currentUserId}
        />
      </TableCell>
    </TableRow>
  );
}
