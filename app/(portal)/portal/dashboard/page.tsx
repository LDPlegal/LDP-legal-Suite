import Link from "next/link";
import { Briefcase, Calendar, FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePortalUser } from "@/lib/auth/session";
import {
  listPortalCases,
  listPortalInvoices,
  listPortalSharedDocuments,
  listPortalUpcomingEvents,
} from "@/lib/db/queries/portal";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Inicio · Portal LDP Legal Suite" };

export default async function PortalDashboardPage() {
  const user = await requirePortalUser();
  const [cases, invoices, events, docs] = await Promise.all([
    listPortalCases(user.firmId, user.userId, user.clientId),
    listPortalInvoices(user.firmId, user.userId, user.clientId),
    listPortalUpcomingEvents(user.firmId, user.userId, user.clientId, 5),
    listPortalSharedDocuments(user.firmId, user.userId, user.clientId),
  ]);

  const openCases = cases.filter((c) => c.status === "open");
  const pendingInvoices = invoices.filter(
    (i) => i.status === "sent" || i.status === "partial" || i.status === "overdue",
  );
  const totalDue = pendingInvoices.reduce((s, i) => s + num(i.balance), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenido</h1>
        <p className="text-sm text-muted-foreground">
          Resumen de tu información en LDP Legal Suite.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Briefcase}
          label="Casos abiertos"
          value={String(openCases.length)}
          hint={`${cases.length} en total`}
        />
        <Kpi
          icon={Receipt}
          label="Facturas pendientes"
          value={String(pendingInvoices.length)}
          hint={`${invoices.length} en total`}
        />
        <Kpi
          icon={Receipt}
          label="Por pagar"
          value={formatMoney(totalDue)}
        />
        <Kpi
          icon={FileText}
          label="Documentos disponibles"
          value={String(docs.length)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Próximos eventos</CardTitle>
            <Link
              href="/portal/casos"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ver casos
            </Link>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin eventos próximos.
              </p>
            ) : (
              <ul className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3">
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatInFirmTz(e.startAt, undefined, "dd/MM/yyyy HH:mm")}
                        {e.location ? ` · ${e.location}` : ""}
                      </p>
                      <Link
                        href={`/portal/casos/${e.caseId}`}
                        className="mt-0.5 inline-block font-mono text-xs text-muted-foreground hover:underline"
                      >
                        {e.caseCode}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Facturas pendientes</CardTitle>
            <Link
              href="/portal/facturas"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ver todas
            </Link>
          </CardHeader>
          <CardContent>
            {pendingInvoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin facturas pendientes.
              </p>
            ) : (
              <ul className="space-y-3">
                {pendingInvoices.slice(0, 6).map((i) => (
                  <li key={i.id} className="flex items-start gap-3">
                    <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/portal/facturas/${i.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {i.number}
                        {i.ncf ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {i.ncf}
                          </span>
                        ) : null}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Vence {formatInFirmTz(i.dueOn, undefined, "dd/MM/yyyy")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums">
                        {formatMoney(num(i.balance))}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {i.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
