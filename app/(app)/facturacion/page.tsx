import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { listInvoices } from "@/lib/db/queries/invoices";
import { requireUser } from "@/lib/auth/session";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { InvoiceList, type InvoiceRow } from "./_components/invoice-list";

export const metadata = { title: "Facturación · LDP Legal Suite" };

type SP = Promise<{ status?: string }>;

export default async function FacturacionPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const validStatus = ["draft", "sent", "partial", "paid", "overdue", "void"] as const;
  const filter = sp.status as InvoiceRow["status"] | undefined;
  const status = filter && (validStatus as readonly string[]).includes(filter) ? filter : undefined;
  const { rows, total } = await listInvoices(user.firmId, user.userId, {
    status,
    limit: 100,
  });

  const totalAmt = rows.reduce((s, r) => s + num(r.total), 0);
  const balance = rows.reduce((s, r) => s + num(r.balance), 0);

  const listRows: InvoiceRow[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    ncf: r.ncf,
    issuedOn: r.issuedOn,
    dueOn: r.dueOn,
    status: r.status,
    total: r.total,
    balance: r.balance,
    currency: r.currency,
    clientId: r.clientId,
    clientName: r.clientName,
    caseId: r.caseId,
    caseCode: r.caseCode,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cobranzas"
        title="Facturación"
        description={`${formatMoney(totalAmt)} facturado · ${formatMoney(balance)} por cobrar. Configurá rangos NCF en Configuración → Fiscal.`}
        count={total}
        countLabel={{ singular: "factura", plural: "facturas" }}
      />

      {/* Stats cards: facturado / por cobrar */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card backdrop-blur-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Facturado
          </p>
          <p className="mt-1 stat-number text-2xl text-foreground">
            {formatMoney(totalAmt)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {total === 1 ? "1 factura" : `${total} facturas`} en el listado
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card backdrop-blur-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Por cobrar
          </p>
          <p
            className={`mt-1 stat-number text-2xl ${
              balance > 0 ? "text-foreground" : "text-success"
            }`}
          >
            {formatMoney(balance)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Balance pendiente
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <select
            name="status"
            defaultValue={status ?? ""}
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

        <InvoiceList rows={listRows} />
      </Card>
    </div>
  );
}
