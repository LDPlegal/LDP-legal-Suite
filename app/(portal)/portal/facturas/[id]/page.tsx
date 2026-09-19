import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePortalUser } from "@/lib/auth/session";
import { getPortalInvoice } from "@/lib/db/queries/portal";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Factura · Portal LDP" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  partial: "Parcial",
  paid: "Pagada",
  overdue: "Vencida",
  void: "Anulada",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  check: "Cheque",
  card: "Tarjeta",
  other: "Otro",
};

export default async function PortalFacturaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePortalUser();
  const data = await getPortalInvoice(user.firmId, user.userId, user.clientId, id);
  if (!data) notFound();
  const { invoice: inv, payments } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/facturas"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Facturas
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{inv.number}</h1>
          {inv.ncf ? (
            <span className="font-mono text-sm text-muted-foreground">
              NCF: {inv.ncf} ({inv.ncfType})
            </span>
          ) : null}
          <Badge variant="outline">
            {STATUS_LABEL[inv.status] ?? inv.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Emitida {formatInFirmTz(inv.issuedOn, undefined, "dd/MM/yyyy")} · Vence{" "}
          {formatInFirmTz(inv.dueOn, undefined, "dd/MM/yyyy")}
          {inv.caseCode ? (
            <>
              {" · "}
              <Link
                href={`/portal/casos/${inv.caseId}`}
                className="font-mono hover:underline"
              >
                {inv.caseCode}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Subtotal" value={formatMoney(num(inv.subtotal))} />
            <Row label="ITBIS" value={formatMoney(num(inv.itbisAmount))} />
            {num(inv.isrWithholdingAmount) > 0 ? (
              <Row
                label="Retención ISR (10%)"
                value={`- ${formatMoney(num(inv.isrWithholdingAmount))}`}
              />
            ) : null}
            <div className="border-t pt-3">
              <Row label="Total" value={formatMoney(num(inv.total))} bold />
              <Row
                label="Pendiente"
                value={formatMoney(num(inv.balance))}
                bold
                accent
              />
            </div>
            {inv.notes ? (
              <div className="border-t pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Notas
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{inv.notes}</p>
              </div>
            ) : null}
            {inv.terms ? (
              <div className="border-t pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Términos
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{inv.terms}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start">
              <a
                href={`/api/facturacion/${inv.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </a>
            </Button>
            <p className="pt-2 text-xs text-muted-foreground">
              Para coordinar el pago de esta factura, por favor contacta a la firma.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagos registrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sin pagos registrados aún.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatInFirmTz(p.paidOn, undefined, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>{METHOD_LABEL[p.method] ?? p.method}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(num(p.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={
          bold
            ? "font-semibold"
            : accent
              ? "text-muted-foreground"
              : "text-muted-foreground"
        }
      >
        {label}
      </span>
      <span
        className={[
          "font-mono tabular-nums",
          bold ? "text-base font-semibold" : "text-sm",
          accent ? "text-warning dark:text-warning" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
