import Link from "next/link";
import {
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  ListChecks,
  Receipt,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCases } from "@/lib/db/queries/cases";
import { listClients } from "@/lib/db/queries/clients";
import {
  ACTION_LABEL,
  ENTITY_LABEL,
  billingSummary,
  hoursByUserReport,
  listFirmRecentAudit,
} from "@/lib/db/queries/audit";
import { listEventsInRange } from "@/lib/db/queries/events";
import { listMyOpenTasks } from "@/lib/db/queries/tasks";
import { listPendingSuggestions } from "@/lib/db/queries/ai-suggestions";
import { requireUser } from "@/lib/auth/session";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";
import { SuggestionsWidget } from "./_components/suggestions-widget";

export const metadata = { title: "Dashboard · LDP Legal Suite" };

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "Por hacer",
  in_progress: "En curso",
  waiting: "Esperando",
};

const TASK_PRIORITY_VARIANT: Record<string, "outline" | "secondary" | "warning" | "destructive"> = {
  low: "outline",
  normal: "secondary",
  high: "warning",
  urgent: "destructive",
};

export default async function DashboardPage() {
  const user = await requireUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  const ytdEnd = new Date(now.getFullYear() + 1, 0, 1);
  const next7 = new Date(now);
  next7.setUTCDate(next7.getUTCDate() + 7);

  const [
    casesRes,
    openCasesRes,
    clientsRes,
    hoursByUser,
    billing,
    misTareas,
    proximosEventos,
    actividad,
    sugerencias,
  ] = await Promise.all([
    listCases(user.firmId, user.userId, { limit: 1 }),
    listCases(user.firmId, user.userId, { status: "open", limit: 1 }),
    listClients(user.firmId, user.userId, { limit: 1 }),
    hoursByUserReport(user.firmId, user.userId, {
      from: monthStart,
      to: monthEnd,
    }),
    billingSummary(user.firmId, user.userId, { from: ytdStart, to: ytdEnd }),
    listMyOpenTasks(user.firmId, user.userId),
    listEventsInRange(user.firmId, user.userId, { start: now, end: next7 }),
    listFirmRecentAudit(user.firmId, user.userId, 12),
    listPendingSuggestions(user.firmId, user.userId, { limit: 10 }),
  ]);

  const myHoursRow = hoursByUser.find((u) => u.user_id === user.userId);
  const myHours = myHoursRow ? myHoursRow.total_seconds / 3600 : 0;
  const myBillableHours = myHoursRow ? myHoursRow.billable_seconds / 3600 : 0;

  const kpis = [
    {
      label: "Casos abiertos",
      value: String(openCasesRes.total),
      icon: Briefcase,
      hint: `${casesRes.total} en total`,
      href: "/casos",
    },
    {
      label: "Clientes",
      value: String(clientsRes.total),
      icon: Users,
      hint: "Activos + prospectos",
      href: "/clientes",
    },
    {
      label: "Mis horas (mes)",
      value: `${myHours.toFixed(1)}h`,
      icon: Clock,
      hint: `${myBillableHours.toFixed(1)}h facturables`,
      href: "/tiempos",
    },
    {
      label: "Por cobrar",
      value: formatMoney(num(billing.total_outstanding)),
      icon: Receipt,
      hint: `${billing.invoice_count} facturas YTD`,
      href: "/reportes",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Buen día, {user.name.split(" ")[0]}.
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumen de la firma ·{" "}
            {now.toLocaleDateString("es-DO", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link key={k.label} href={k.href} className="group block">
              <Card className="transition-colors hover:border-primary/40">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {k.label}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-2xl font-semibold tabular-nums">
                    {k.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {sugerencias.length > 0 ? (
        <SuggestionsWidget
          initial={sugerencias.map((s) => ({
            id: s.id,
            kind: s.kind,
            title: s.title,
            body: s.body,
            href: s.href,
            severity: s.severity,
            createdAt: s.createdAt,
          }))}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              Mis tareas pendientes
            </CardTitle>
            <Link
              href="/tareas"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ver todo
            </Link>
          </CardHeader>
          <CardContent>
            {misTareas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No tienes tareas asignadas pendientes.
              </p>
            ) : (
              <ul className="space-y-2">
                {misTareas.slice(0, 6).map((t) => {
                  const overdue =
                    t.dueAt && new Date(t.dueAt).getTime() < now.getTime();
                  return (
                    <li
                      key={t.id}
                      className="flex items-start gap-3 rounded-md border p-2"
                    >
                      <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {TASK_STATUS_LABEL[t.status] ?? t.status}
                          {t.caseCode ? (
                            <>
                              {" · "}
                              <Link
                                href={`/casos/${t.caseId}`}
                                className="font-mono hover:underline"
                              >
                                {t.caseCode}
                              </Link>
                            </>
                          ) : null}
                          {t.dueAt ? (
                            <>
                              {" · "}
                              <span className={overdue ? "text-destructive" : ""}>
                                Vence{" "}
                                {formatInFirmTz(t.dueAt, undefined, "dd/MM/yyyy")}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <Badge variant={TASK_PRIORITY_VARIANT[t.priority] ?? "outline"} className="text-[10px]">
                        {t.priority}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Próximos 7 días
            </CardTitle>
            <Link
              href="/calendario"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ver calendario
            </Link>
          </CardHeader>
          <CardContent>
            {proximosEventos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin eventos en los próximos 7 días.
              </p>
            ) : (
              <ul className="space-y-2">
                {proximosEventos.slice(0, 6).map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-3 rounded-md border p-2"
                  >
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatInFirmTz(e.startAt, undefined, "dd/MM HH:mm")}
                        {e.location ? ` · ${e.location}` : ""}
                        {e.caseCode ? (
                          <>
                            {" · "}
                            <Link
                              href={`/casos/${e.caseId}`}
                              className="font-mono hover:underline"
                            >
                              {e.caseCode}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Actividad reciente del firm</CardTitle>
          <Link
            href="/reportes"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Ver bitácora completa
          </Link>
        </CardHeader>
        <CardContent>
          {actividad.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin actividad registrada todavía.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {actividad.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase">
                    {(e.userName ?? "?").slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p>
                      <strong>{e.userName ?? "Sistema"}</strong>{" "}
                      {ACTION_LABEL[e.action] ?? e.action}{" "}
                      <span className="text-muted-foreground">
                        {ENTITY_LABEL[e.entityType] ?? e.entityType}
                      </span>
                    </p>
                    {e.summary ? (
                      <p className="text-xs text-muted-foreground">
                        {e.summary}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatInFirmTz(e.createdAt, undefined, "dd/MM HH:mm")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
