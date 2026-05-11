import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pencil, Send, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInvoiceById } from "@/lib/db/queries/invoices";
import { requireUser } from "@/lib/auth/session";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";
import { marcarFacturaEnviadaAction } from "@/app/_actions/facturacion/enviar";
import { anularFacturaAction } from "@/app/_actions/facturacion/anular";
import { eliminarFacturaAction } from "@/app/_actions/facturacion/eliminar";
import { PaymentFormDrawer } from "./_components/payment-form-drawer";
import { EditarFacturaDrawer } from "./_components/editar-factura-drawer";

export const metadata = { title: "Factura · LDP Legal Suite" };

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

const METHOD_LABEL = {
  cash: "Efectivo",
  transfer: "Transferencia",
  check: "Cheque",
  card: "Tarjeta",
  other: "Otro",
} as const;

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getInvoiceById(user.firmId, user.userId, id);
  if (!detail) notFound();

  const { invoice, client, case: kase, items, payments } = detail;
  const isApprover = user.role === "admin" || user.role === "partner";
  const canSend = isApprover && invoice.status === "draft";
  const canEdit = isApprover && invoice.status === "draft";
  const canDelete = isApprover && invoice.status === "draft";
  const canVoid =
    isApprover && invoice.status !== "void" && invoice.status !== "paid" && invoice.status !== "draft";
  const canRecordPayment =
    invoice.status !== "void" && invoice.status !== "paid" && invoice.status !== "draft";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/facturacion"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a facturas
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{invoice.number}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {client?.legalName ?? client?.displayName ?? "—"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Emitida {formatInFirmTz(invoice.issuedOn, undefined, "dd/MM/yyyy")} · Vence{" "}
              {formatInFirmTz(invoice.dueOn, undefined, "dd/MM/yyyy")}
              {!invoice.ncf ? " · Modo interno (no fiscal)" : ` · NCF ${invoice.ncf}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[invoice.status]}>{STATUS_LABEL[invoice.status]}</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`/api/facturacion/${invoice.id}/pdf`} target="_blank" rel="noopener">
                <Download className="h-3.5 w-3.5" />
                Descargar PDF
              </Link>
            </Button>
            {canEdit ? (
              <EditarFacturaDrawer
                invoiceId={invoice.id}
                initialDueOn={invoice.dueOn}
                initialNotes={invoice.notes}
                initialTerms={invoice.terms}
                initialIsr={num(invoice.isrWithholdingAmount) > 0}
                initialLines={items.map((it) => ({
                  description: it.description,
                  quantity: num(it.quantity),
                  unitPrice: num(it.unitPrice),
                  taxRate: num(it.taxRate),
                  sourceType: it.sourceType,
                  sourceId: it.sourceId,
                }))}
                trigger={
                  <Button variant="outline" size="sm">
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                }
              />
            ) : null}
            {canSend ? (
              <form action={marcarFacturaEnviadaAction}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <Button type="submit" size="sm">
                  <Send className="h-3.5 w-3.5" />
                  Marcar enviada
                </Button>
              </form>
            ) : null}
            {canDelete ? (
              <ConfirmButton
                action={eliminarFacturaAction}
                title={`¿Eliminar borrador ${invoice.number}?`}
                description="Solo borradores se pueden eliminar. Para facturas ya enviadas usa 'Anular' (preserva el rastro fiscal)."
                confirmLabel="Eliminar borrador"
                trigger={
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                }
              >
                <input type="hidden" name="invoiceId" value={invoice.id} />
              </ConfirmButton>
            ) : null}
            {canRecordPayment ? (
              <PaymentFormDrawer
                invoiceId={invoice.id}
                outstanding={num(invoice.balance)}
                currency={invoice.currency}
                trigger={
                  <Button size="sm">
                    Registrar pago
                  </Button>
                }
              />
            ) : null}
            {canVoid ? (
              <ConfirmButton
                action={anularFacturaAction}
                title={`¿Anular factura ${invoice.number}?`}
                description="La factura quedará marcada como anulada y no podrá facturarse de nuevo. El NCF asignado se mantiene reservado para el rastro fiscal."
                confirmLabel="Anular"
                trigger={
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    Anular
                  </Button>
                }
              >
                <input type="hidden" name="invoiceId" value={invoice.id} />
              </ConfirmButton>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Líneas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right w-20">Cant.</TableHead>
                  <TableHead className="text-right w-28">P. unit.</TableHead>
                  <TableHead className="text-right w-20">ITBIS</TableHead>
                  <TableHead className="text-right w-28">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="text-sm">{it.description}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {num(it.quantity).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(num(it.unitPrice), invoice.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {(num(it.taxRate) * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(num(it.amount), invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Subtotal" value={formatMoney(num(invoice.subtotal), invoice.currency)} />
            {num(invoice.itbisAmount) > 0 ? (
              <Row label="ITBIS" value={formatMoney(num(invoice.itbisAmount), invoice.currency)} />
            ) : null}
            {num(invoice.isrWithholdingAmount) > 0 ? (
              <Row
                label="Retención ISR"
                value={`− ${formatMoney(num(invoice.isrWithholdingAmount), invoice.currency)}`}
              />
            ) : null}
            <Separator />
            <Row label="Total" value={formatMoney(num(invoice.total), invoice.currency)} bold />
            <Row
              label="Balance"
              value={formatMoney(num(invoice.balance), invoice.currency)}
              bold
            />
            {kase ? (
              <>
                <Separator />
                <p className="text-xs">
                  Caso{" "}
                  <Link href={`/casos/${kase.id}`} className="font-mono hover:underline">
                    {kase.code}
                  </Link>
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pagos recibidos ({payments.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
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
                    <TableCell className="text-xs">
                      {formatInFirmTz(p.paidOn, undefined, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {METHOD_LABEL[p.method as keyof typeof METHOD_LABEL]}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(num(p.amount), invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {invoice.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{invoice.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex justify-between " + (bold ? "font-semibold" : "text-muted-foreground")}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
