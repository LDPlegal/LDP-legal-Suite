"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";
import { bulkInvoiceAction } from "@/app/_actions/facturacion/bulk";

const STATUS_VARIANT = {
  draft: "secondary",
  sent: "default",
  partial: "warning",
  paid: "success",
  overdue: "destructive",
  void: "secondary",
} as const;

const STATUS_LABEL = {
  draft: "Borrador",
  sent: "Enviada",
  partial: "Pago parcial",
  paid: "Pagada",
  overdue: "Vencida",
  void: "Anulada",
} as const;

export type InvoiceRow = {
  id: string;
  number: string;
  kind?: string;
  ncf: string | null;
  issuedOn: Date;
  dueOn: Date;
  status: keyof typeof STATUS_VARIANT;
  total: string;
  balance: string;
  currency: string;
  clientId: string;
  clientName: string | null;
  caseId: string | null;
  caseCode: string | null;
};

export function InvoiceList({ rows }: { rows: InvoiceRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function bulk(operation: "delete" | "void") {
    if (selected.size === 0) return;
    const label = operation === "delete" ? "eliminar" : "anular";
    if (!confirm(`¿${label.charAt(0).toUpperCase() + label.slice(1)} ${selected.size} factura(s)?`)) {
      return;
    }
    const fd = new FormData();
    fd.set("invoiceIds", JSON.stringify(Array.from(selected)));
    fd.set("operation", operation);
    startTransition(async () => {
      try {
        const result = await bulkInvoiceAction(fd);
        if (result.processed > 0) {
          toast.success(`${result.processed} factura(s) ${operation === "delete" ? "eliminadas" : "anuladas"}`);
        }
        if (result.skipped.length > 0) {
          toast.warning(
            `${result.skipped.length} omitidas: ${result.skipped.slice(0, 3).map((s) => s.reason).join("; ")}${result.skipped.length > 3 ? "..." : ""}`,
          );
        }
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error en la operación");
      }
    });
  }

  // Single-selection helpers
  const onlyOne = selected.size === 1;
  const onlyOneId = onlyOne ? Array.from(selected)[0] : null;

  return (
    <>
      {selected.size > 0 ? (
        <div className="sticky top-14 z-10 -mx-4 mb-2 flex items-center justify-between border-y border-border bg-accent px-4 py-2 text-sm">
          <span>
            <strong>{selected.size}</strong> factura(s) seleccionada(s)
          </span>
          <div className="flex items-center gap-2">
            {onlyOneId ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/facturacion/${onlyOneId}`}>
                  <Pencil className="h-3.5 w-3.5" />
                  Abrir / editar
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => bulk("void")}
            >
              <XCircle className="h-3.5 w-3.5" />
              Anular
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => bulk("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar borradores
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Cancelar selección
            </Button>
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={toggleAll}
                aria-label="Seleccionar todas"
              />
            </TableHead>
            <TableHead className="w-32">Número</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="w-28">Caso</TableHead>
            <TableHead className="w-28">Emitida</TableHead>
            <TableHead className="w-28">Vence</TableHead>
            <TableHead className="w-28">Estado</TableHead>
            <TableHead className="w-32 text-right">Total</TableHead>
            <TableHead className="w-32 text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                Sin facturas. Genera una desde la pestaña Facturación de un caso.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Seleccionar ${r.number}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <Link href={`/facturacion/${r.id}`} className="hover:underline">
                    {r.number}
                  </Link>
                  {r.kind === "proforma" ? (
                    <Badge variant="secondary" className="ml-1 text-[9px] uppercase">
                      Proforma
                    </Badge>
                  ) : null}
                  {r.ncf ? <p className="text-[10px] text-muted-foreground">NCF {r.ncf}</p> : null}
                </TableCell>
                <TableCell className="text-sm">{r.clientName ?? "—"}</TableCell>
                <TableCell className="font-mono text-[11px]">
                  {r.caseCode ? (
                    <Link href={`/casos/${r.caseId}`} className="hover:underline">
                      {r.caseCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatInFirmTz(r.issuedOn, undefined, "dd/MM/yyyy")}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatInFirmTz(r.dueOn, undefined, "dd/MM/yyyy")}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMoney(num(r.total), r.currency)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatMoney(num(r.balance), r.currency)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}
