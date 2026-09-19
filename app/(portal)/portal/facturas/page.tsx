import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePortalUser } from "@/lib/auth/session";
import { listPortalInvoices } from "@/lib/db/queries/portal";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Facturas · Portal LDP" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  partial: "Parcial",
  paid: "Pagada",
  overdue: "Vencida",
  void: "Anulada",
};

export default async function PortalFacturasPage() {
  const user = await requirePortalUser();
  const invoices = await listPortalInvoices(user.firmId, user.userId, user.clientId);

  const totalDue = invoices
    .filter((i) => ["sent", "partial", "overdue"].includes(i.status))
    .reduce((s, i) => s + num(i.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturas</h1>
          <p className="text-sm text-muted-foreground">
            {invoices.length === 0
              ? "Aún no hay facturas emitidas."
              : `${invoices.length} factura${invoices.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        {invoices.length > 0 ? (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total por pagar
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatMoney(totalDue)}
            </p>
          </div>
        ) : null}
      </div>

      {invoices.length === 0 ? null : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>NCF</TableHead>
                  <TableHead>Caso</TableHead>
                  <TableHead>Emitida</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/portal/facturas/${i.id}`}
                        className="hover:underline"
                      >
                        {i.number}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {i.ncf ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {i.caseCode ? (
                        <Link
                          href={`/portal/casos/${i.caseId}`}
                          className="font-mono text-muted-foreground hover:underline"
                        >
                          {i.caseCode}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatInFirmTz(i.issuedOn, undefined, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatInFirmTz(i.dueOn, undefined, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(num(i.total))}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(num(i.balance))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
