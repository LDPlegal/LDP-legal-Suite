"use client";

// Tabla de casos con jerarquía padre/hijo — el punto central del rediseño
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
            className="-ml-1 grid h-5 w-5 flex-none place-items-center text-[#8E8F89] transition-colors hover:text-[#161C24]"
          >
            <Icon name={expanded ? "expand_more" : "chevron_right"} size={18} />
          </button>
        ) : depth === 0 ? (
          <span className="h-5 w-5 flex-none" aria-hidden />
        ) : null}
        <Link
          href={`/casos/${row.id}`}
          className="tabular whitespace-nowrap font-medium text-[#0B1929] transition-colors hover:text-[#0F4C81]"
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
      <TableCell>
        <Link
          href={`/casos/${row.id}`}
          className="font-medium text-[#161C24] transition-colors hover:text-[#0F4C81]"
        >
          {row.title}
        </Link>
        <span className="mt-0.5 block text-[11.5px] text-[#9C9D96]">
          {row.matterLabel}
        </span>
      </TableCell>
      <TableCell className="text-[13px] text-[#5C5E56]">
        {depth === 1 ? (
          <span className="text-[#9C9D96]">vinculado</span>
        ) : (
          (row.clientDisplayName ?? "—")
        )}
      </TableCell>
      <TableCell className="text-[13px] text-[#5C5E56]">
        {row.leadLawyerName ?? "—"}
      </TableCell>
      <TableCell>
        <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
      </TableCell>
      <TableCell className="tabular hidden text-[12.5px] text-[#8E8F89] md:table-cell">
        {row.openedAtLabel}
      </TableCell>
    </TableRow>
  );
}

// — Móvil: la tabla se convierte en lista de tarjetas (handoff, sección
//   Móvil). Dato principal 14.5px, meta en una línea de 11.5px, y los
//   vinculados anidados dentro de la tarjeta del padre con fondo #FCFCFA
//   e indentación de 26px. —
function MobileCard({ row, nested = false }: { row: CasoRow; nested?: boolean }) {
  return (
    <Link
      href={`/casos/${row.id}`}
      className={cn(
        "block border-b border-[#F0F1ED] px-4 py-3 transition-colors last:border-b-0 active:bg-[#FAFAF8]",
        nested && "border-l-0 bg-[#FCFCFA] pl-[26px]",
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-medium text-[#161C24]">
            {row.title}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-[#9C9D96]">
            <span className="tabular">{row.code}</span>
            {" · "}
            {nested ? "vinculado" : (row.clientDisplayName ?? "—")}
            {" · "}
            {row.matterLabel}
          </span>
        </span>
        <Badge variant={row.statusVariant} className="flex-none">
          {row.statusLabel}
        </Badge>
      </span>
    </Link>
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
    <>
      <div className="md:hidden">
        {nodes.map((node) => (
          <Fragment key={node.id}>
            <MobileCard row={node} />
            {node.children.map((child) => (
              <MobileCard key={child.id} row={child} nested />
            ))}
          </Fragment>
        ))}
      </div>

      <div className="hidden md:block">
        <Table>
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
      </div>
    </>
  );
}
