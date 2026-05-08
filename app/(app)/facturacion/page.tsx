import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listInvoices } from "@/lib/db/queries/invoices";
import { requireUser } from "@/lib/auth/session";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Facturación · LDP Legal Suite" };

const STATUS_VARIANT: Record<
  "draft" | "sent" | "partial" | "paid" | "overdue" | "void",
  "secondary" | "default" | "warning" | "success" | "destructive"
> = {
  draft: "secondary",
  sent: "default",
  partial: "warning",
  paid: "success",
  overdue: "destructive",
  void: "secondary",
};

const STATUS_LABEL: Record<keyof typeof STATUS_VARIANT, string> = {
  draft: "Borrador",
  sent: "Enviada",
  partial: "Pago parcial",
  paid: "Pagada",
  overdue: "Vencida",
  void: "Anulada",
};

type SP = Promise<{ status?: string }>;

export default async function FacturacionPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = (sp.status ?? "") as "" | keyof typeof STATUS_VARIANT;
  const { rows, total } = await listInvoices(user.firmId, user.userId, {
    status: status || undefined,
    limit: 100,
  });

  const totalAmt = rows.reduce((s, r) => s + num(r.total), 0);
  const balance = rows.reduce((s, r) => s + num(r.balance), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facturación</h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "factura" : "facturas"} · {formatMoney(totalAmt)} facturado · {formatMoney(balance)} por cobrar
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Modo interno (proforma) — la emisión fiscal con NCF/e-CF llega cuando configures rangos en
          <span className="font-mono"> Configuración → Fiscal</span> (Fase 2.5).
        </p>
      </div>

      <Card className="overflow-hidden">
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <select
            name="status"
            defaultValue={status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borradores</option>
            <option value="sent">Enviadas</option>
            <option value="partial">Pago parcial</option>
            <option value="paid">Pagadas</option>
            <option value="overdue">Vencidas</option>
            <option value="void">Anuladas</option>
          </select>
          <button
            type="submit"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
          >
            Filtrar
          </button>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  Sin facturas. Genera una desde la pestaña Facturación de un caso.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/facturacion/${r.id}`} className="hover:underline">
                      {r.number}
                    </Link>
                    {r.ncf ? (
                      <p className="text-[10px] text-muted-foreground">NCF {r.ncf}</p>
                    ) : null}
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
      </Card>
    </div>
  );
}
