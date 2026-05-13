import Link from "next/link";
import { Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { listAllDocuments } from "@/lib/db/queries/documents";
import { isAiEnabled } from "@/lib/ai";
import { AiDocumentSearch } from "./_components/ai-search";
import { DocumentGlobalRow } from "./_components/document-global-row";
import { DocumentUploadGlobalDrawer } from "./_components/document-upload-global-drawer";

export const metadata = { title: "Documentos · LDP Legal Suite" };

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; shared?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const onlyShared = sp.shared === "1";
  const { rows, total } = await listAllDocuments(user.firmId, user.userId, {
    search: q || undefined,
    onlyShared,
    limit: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground">
            Vista global de archivos del firm. Busca por nombre, etiquetas o por
            contenido (OCR de PDFs e imágenes escaneadas).
          </p>
        </div>
        <DocumentUploadGlobalDrawer
          trigger={
            <Button id="upload-global-doc-btn">
              <Upload className="mr-2 h-4 w-4" />
              Subir documento
            </Button>
          }
        />
      </div>

      {isAiEnabled() ? <AiDocumentSearch /> : null}

      <form className="flex flex-wrap items-center gap-2" action="/documentos">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, etiqueta, o texto OCR…"
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="shared"
            value="1"
            defaultChecked={onlyShared}
            className="h-3.5 w-3.5"
          />
          Solo compartidos con cliente
        </label>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
        >
          Buscar
        </button>
        {q || onlyShared ? (
          <Link
            href="/documentos"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </Link>
        ) : null}
      </form>

      <p className="text-xs text-muted-foreground">
        {total} {total === 1 ? "resultado" : "resultados"}
        {rows.length < total ? ` · mostrando los primeros ${rows.length}` : ""}
      </p>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {q
                ? "Sin resultados para esa búsqueda."
                : "Aún no hay documentos. Haz clic en \"Subir documento\" para comenzar."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Caso</TableHead>
                  <TableHead>Subido</TableHead>
                  <TableHead>Tamaño</TableHead>
                  <TableHead>OCR</TableHead>
                  <TableHead className="w-40 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <DocumentGlobalRow
                    key={d.id}
                    doc={{
                      id: d.id,
                      name: d.name,
                      mimeType: d.mimeType,
                      sizeBytes: d.sizeBytes,
                      tags: d.tags,
                      ocrStatus: d.ocrStatus,
                      version: d.version,
                      sharedWithClient: d.sharedWithClient,
                      createdAt: d.createdAt,
                      uploadedByName: d.uploadedByName,
                      caseId: d.caseId,
                      caseCode: d.caseCode,
                      ocrTextSnippet: d.ocrTextSnippet,
                    }}
                    aiEnabled={isAiEnabled()}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

