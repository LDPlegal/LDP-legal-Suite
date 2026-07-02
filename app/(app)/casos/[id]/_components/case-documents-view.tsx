"use client";

// Vista "Documentos del caso": un buscador arriba (junto a los botones de
// subir/carpeta) que, al escribir, filtra TODOS los docs de equipo del caso
// en una lista plana; al vaciarse, vuelve a la vista por carpetas.
//
// Reemplaza la vieja duplicación (folder-browser + <details> lista plana):
// una sola vista, un solo buscador, y los tres botones alineados.

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

export function CaseDocumentsView({
  teamDocs,
  caseId,
  aiEnabled,
  currentUserId,
  actions,
  folderView,
}: {
  /** Todos los docs de equipo del caso — para la búsqueda global. */
  teamDocs: DocumentListRow[];
  caseId: string;
  aiEnabled?: boolean;
  currentUserId?: string;
  /** Botones (subir archivo / nueva carpeta / subir carpeta) — van a la
   *  derecha del buscador, en una sola fila. */
  actions: React.ReactNode;
  /** Vista por carpetas — se muestra cuando el buscador está vacío. */
  folderView: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return [];
    return teamDocs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        (d.uploadedByName?.toLowerCase().includes(q) ?? false),
    );
  }, [q, teamDocs]);

  return (
    <div className="space-y-4">
      {/* Buscador + acciones, alineados en una fila */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Buscar por nombre, etiqueta o quién lo subió…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>

      {q ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {filtered.length} resultado{filtered.length === 1 ? "" : "s"} en
            todos los documentos del caso.
          </p>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Subido por</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tamaño</TableHead>
                  <TableHead>OCR</TableHead>
                  <TableHead className="w-16 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Sin resultados para &quot;{query}&quot;.
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
      ) : (
        folderView
      )}
    </div>
  );
}
