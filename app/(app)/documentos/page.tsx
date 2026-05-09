import Link from "next/link";
import { Download, Eye, EyeOff, FileText, Image as ImageIcon, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { listAllDocuments } from "@/lib/db/queries/documents";
import {
  formatBytes,
  OCR_STATUS_LABEL,
} from "@/lib/documents/format";
import { formatInFirmTz } from "@/lib/datetime/format";

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Vista global de archivos del firm. Busca por nombre, etiquetas o por
          contenido (OCR de PDFs e imágenes escaneadas).
        </p>
      </div>

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
                : "Aún no hay documentos. Súbelos desde la pestaña Documentos de cada caso."}
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
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => {
                  const isImage = d.mimeType.startsWith("image/");
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isImage ? (
                            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <Link
                            href={`/api/documentos/${d.id}/download`}
                            target="_blank"
                            rel="noopener"
                            className="font-medium hover:underline"
                          >
                            {d.name}
                          </Link>
                          {d.version > 1 ? (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              v{d.version}
                            </Badge>
                          ) : null}
                          {d.sharedWithClient ? (
                            <Eye
                              className="h-3.5 w-3.5 text-emerald-600"
                              aria-label="Compartido con cliente"
                            />
                          ) : (
                            <EyeOff
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-label="No compartido"
                            />
                          )}
                        </div>
                        {d.tags.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {d.tags.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {d.ocrTextSnippet ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            …{d.ocrTextSnippet}…
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.caseId ? (
                          <Link
                            href={`/casos/${d.caseId}`}
                            className="font-mono text-muted-foreground hover:underline"
                          >
                            {d.caseCode}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.uploadedByName ?? "—"}
                        <br />
                        {formatInFirmTz(d.createdAt, undefined, "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {formatBytes(d.sizeBytes)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {OCR_STATUS_LABEL[d.ocrStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/api/documentos/${d.id}/download`}
                          target="_blank"
                          rel="noopener"
                          download={d.name}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label="Descargar"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
