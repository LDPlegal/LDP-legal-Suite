"use client";

// Sección de documentos del caso: buscador + tabla con filas.
//
// El buscador filtra EN MEMORIA, los docs de un caso son bounded
// (típicamente 5-50, raras veces más), entonces no vale la pena un
// round-trip al server. Búsqueda instantánea por:
//   - Nombre del archivo
//   - Etiquetas (tags)
//   - Texto OCR (si está indexado)
//   - Nombre del subidor
//
// Diferente del buscador global de /documentos que SÍ es server-side
// porque el dataset es mucho más grande.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DocumentRow } from "./document-row";
import type { DocumentListRow } from "@/lib/documents/format";

// El tipo que server-side te pasa incluye opcionalmente el OCR text para
// que podamos filtrar por contenido sin un round-trip adicional. Por ahora
// el ocrText NO viene en el listado (es pesado), filtramos solo por
// nombre/tags/uploader. Si más adelante queremos full-text de OCR acá,
// agregamos el campo en listDocumentsForCase.

export function CaseDocumentsSection({
  docs,
  caseId,
  aiEnabled,
  currentUserId,
}: {
  docs: DocumentListRow[];
  caseId: string;
  aiEnabled?: boolean;
  currentUserId?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => {
      // Match por nombre
      if (d.name.toLowerCase().includes(q)) return true;
      // Match por etiquetas
      if (d.tags.some((t) => t.toLowerCase().includes(q))) return true;
      // Match por subidor
      if (d.uploadedByName?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [docs, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Buscar por nombre, etiqueta o quién lo subió…"
          className="pl-8"
        />
        {query && filtered.length !== docs.length ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {filtered.length} de {docs.length} archivos coinciden con
            {" “"}{query}{"”"}
          </p>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Subido por</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Tamaño</TableHead>
              <TableHead>OCR</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {query
                    ? `Sin resultados para "${query}".`
                    : "Sin documentos. Subí el primero arriba."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  caseId={caseId}
                  aiEnabled={aiEnabled}
                  currentUserId={currentUserId}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
