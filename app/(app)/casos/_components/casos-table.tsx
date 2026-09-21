"use client";

// Tabla de casos con jerarquía padre/hijo, el punto central del rediseño
// de esta pantalla (handoff 3c).
//
// Los expedientes vinculados se anidan como filas hijas del padre: mismo
// grid, fondo #FCFCFA, código indentado y la palabra "vinculado" en la
// columna CLIENTE. El chevron del padre colapsa/expande sus hijos.
//
// Si el padre de un subexpediente no viene en el resultado (filtrado o no
// visible por RLS), el hijo se muestra como fila de primer nivel para no
// desaparecer del listado.

import Link from "next/link";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type CasoRow = {
  id: string;
  code: string;
  title: string;
  clientDisplayName: string | null;
  leadLawyerName: string | null;
  statusLabel: string;
  statusVariant: "default" | "secondary" | "warning";
  matterLabel: string;
  openedAtLabel: string;
  restricted: boolean;
  parentCaseId: string | null;
};

export type CasoNode = CasoRow & { children: CasoRow[] };

function CodeCell({
  row,
  depth,
  expandable,
  expanded,
  onToggle,
}: {
  row: CasoRow;
  depth: 0 | 1;
  expandable: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <TableCell
      data-col="codigo"
      className={cn("align-middle text-[12.5px]", depth === 1 && "pl-[23px]")}
    >
      <span className="flex items-center gap-1.5">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={
              expanded ? "Ocultar expedientes vinculados" : "Ver expedientes vinculados"
            }
            className="-ml-1 grid h-5 w-5 flex-none place-items-center text-subtle transition-colors hover:text-foreground"
          >
            <Icon name={expanded ? "expand_more" : "chevron_right"} size={18} />
          </button>
        ) : depth === 0 ? (
          <span className="h-5 w-5 flex-none" aria-hidden />
        ) : null}
        <Link
          href={`/casos/${row.id}`}
          className="tabular whitespace-nowrap font-medium text-foreground transition-colors hover:text-action"
        >
          {row.code}
        </Link>
        {row.restricted ? (
          <Icon
            name="lock"
            size={14}
            className="text-[#B89254]"
            label="Caso restringido"
          />
        ) : null}
      </span>
    </TableCell>
  );
}

function Row({
  row,
  depth,
  expandable = false,
  expanded,
  onToggle,
}: {
  row: CasoRow;
  depth: 0 | 1;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <TableRow className={cn(depth === 1 && "bg-[#FCFCFA]")}>
      <CodeCell
        row={row}
        depth={depth}
        expandable={expandable}
        expanded={expanded}
        onToggle={onToggle}
      />
      <TableCell data-col="expediente">
        <Link
          href={`/casos/${row.id}`}
          className="font-medium text-foreground transition-colors hover:text-action"
        >
          {row.title}
        </Link>
        <span className="mt-0.5 block text-[11.5px] text-faint">
          {row.matterLabel}
        </span>
      </TableCell>
      <TableCell data-col="cliente" className="text-[13px] text-muted-foreground">
        {depth === 1 ? (
          <span className="text-faint">vinculado</span>
        ) : (
          (row.clientDisplayName ?? "-")
        )}
      </TableCell>
      <TableCell data-col="responsable" className="text-[13px] text-muted-foreground">
        {row.leadLawyerName ?? "-"}
      </TableCell>
      <TableCell data-col="estado">
        <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
      </TableCell>
      <TableCell data-col="apertura" className="tabular hidden text-[12.5px] text-subtle md:table-cell">
        {row.openedAtLabel}
      </TableCell>
    </TableRow>
  );
}

export function CasosTable({ nodes }: { nodes: CasoNode[] }) {
  // Por defecto todo expandido: en el diseño los vinculados se ven.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    // Una sola tabla en el DOM. Antes se renderizaba ademas una lista de
    // tarjetas para movil con md:hidden, lo que duplicaba cada fila: mismo
    // texto dos veces, selectores ambiguos y DOM al doble. Ahora la clase
    // .table-cards (globals.css) convierte las filas en tarjetas por CSS
    // debajo de md, sin duplicar nada.
    <Table className="table-cards">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[136px]">Código</TableHead>
          <TableHead>Expediente</TableHead>
          <TableHead className="w-[132px]">Cliente</TableHead>
          <TableHead className="w-[110px]">Responsable</TableHead>
          <TableHead className="w-[92px]">Estado</TableHead>
          <TableHead className="hidden w-[88px] md:table-cell">Apertura</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nodes.map((node) => {
          const hasChildren = node.children.length > 0;
          const isExpanded = !collapsed.has(node.id);
          return (
            <Fragment key={node.id}>
              <Row
                row={node}
                depth={0}
                expandable={hasChildren}
                expanded={isExpanded}
                onToggle={() => toggle(node.id)}
              />
              {hasChildren && isExpanded
                ? node.children.map((child) => (
                    <Row key={child.id} row={child} depth={1} />
                  ))
                : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
