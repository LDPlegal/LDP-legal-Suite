import Link from "next/link";
import type { ReactNode } from "react";
import {
  Calendar,
  CheckSquare,
  Clock,
  ListChecks,
  Receipt,
  Briefcase,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCases } from "@/lib/db/queries/cases";
import { listClients } from "@/lib/db/queries/clients";
import {
  ACTION_LABEL,
  AGING_BUCKET_LABEL,
  ENTITY_LABEL,
  arAgingReport,
  billingSummary,
  hoursByUserReport,
  listFirmRecentAudit,
} from "@/lib/db/queries/audit";
import type { AgingBucket } from "@/lib/db/queries/audit";
import { listEventsInRange } from "@/lib/db/queries/events";
import { listMyOpenTasks, listTasks } from "@/lib/db/queries/tasks";
import { listInvoices } from "@/lib/db/queries/invoices";
import { listPendingSuggestions } from "@/lib/db/queries/ai-suggestions";
import { getFirmOnboardingProgress } from "@/lib/db/queries/onboarding";
import { getCurrentFirm } from "@/lib/db/queries/firms";
import { getUserPreferences } from "@/lib/db/queries/preferences";
import { requireUser } from "@/lib/auth/session";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";
import {
  CASE_STATUS_LABEL,
  MATTER_LABEL,
} from "@/lib/schemas/caso";
import { resolveDashboardLayout, SPAN_CLASS } from "@/lib/dashboard/widgets";
import { SuggestionsWidget } from "./_components/suggestions-widget";
import { OnboardingChecklist } from "./_components/onboarding-checklist";
import { KpiCard } from "./_components/kpi-card";
import { AgingChart } from "./_components/aging-chart";
import { AiHero } from "./_components/ai-hero";
import { DashboardCustomize } from "./_components/dashboard-customize";

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

const CASE_STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  open: "success",
  on_hold: "warning",
  closed: "secondary",
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

  // Resolvemos el layout ANTES de traer datos para poder cargar los widgets
  // "pesados" (facturas, tareas del equipo, casos recientes) SOLO si el
  // usuario los tiene activos. Así personalizar el dashboard también aligera
  // lo que consulta la BD.
  const prefs = await getUserPreferences(user.firmId, user.userId);
  const layout = resolveDashboardLayout(prefs.dashboardWidgets);
  const vis = (id: string) => layout.some((w) => w.id === id && w.visible);

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
    aging,
    onboarding,
    firm,
    recentCasesRes,
    overdueInvoices,
    teamTasks,
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
    arAgingReport(user.firmId, user.userId),
    getFirmOnboardingProgress(user.firmId, user.userId),
    getCurrentFirm(user.firmId, user.userId),
    vis("casos_recientes")
      ? listCases(user.firmId, user.userId, { limit: 5, orderBy: "opened_desc" })
      : Promise.resolve(null),
    vis("facturas_vencidas")
      ? listInvoices(user.firmId, user.userId, { limit: 50 })
      : Promise.resolve(null),
    vis("tareas_equipo")
      ? listTasks(user.firmId, user.userId, { limit: 20 })
      : Promise.resolve(null),
  ]);

  // Normalize aging buckets so the 5 always appear, even if empty.
  const agingMap = new Map<AgingBucket, { total: number; count: number }>();
  for (const r of aging) agingMap.set(r.bucket, { total: num(r.total), count: r.count });
  const agingData = (
    ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as AgingBucket[]
  ).map((b) => ({
    bucket: b,
    label: AGING_BUCKET_LABEL[b],
    total: agingMap.get(b)?.total ?? 0,
    count: agingMap.get(b)?.count ?? 0,
  }));

  const myHoursRow = hoursByUser.find((u) => u.user_id === user.userId);
  const myHours = myHoursRow ? myHoursRow.total_seconds / 3600 : 0;
  const myBillableHours = myHoursRow ? myHoursRow.billable_seconds / 3600 : 0;

  const hour = now.getHours();
  const greeting =
    hour < 5
      ? "Buenas noches"
      : hour < 12
        ? "Buen día"
        : hour < 19
          ? "Buenas tardes"
          : "Buenas noches";

  // Eventos de HOY (para el widget "Agenda de hoy"), se derivan de los
  // próximos 7 días ya cargados, sin consulta extra.
  const todayStr = now.toDateString();
  const eventosHoy = proximosEventos.filter(
    (e) => new Date(e.startAt).toDateString() === todayStr,
  );

  // Facturas vencidas: con saldo pendiente y fecha de pago pasada.
  const facturasVencidas = (overdueInvoices?.rows ?? [])
    .filter((f) => num(f.balance) > 0 && new Date(f.dueOn).getTime() < now.getTime())
    .slice(0, 6);

  // Tareas del equipo pendientes (excluye completadas), top 6.
  const tareasEquipo = (teamTasks ?? [])
    .filter((t) => t.status !== "done")
    .slice(0, 6);

  // Cada widget → su JSX. Se emiten abajo en el orden del layout. Los que no
  // aplican (p. ej. sugerencias vacías) devuelven null y se omiten.
  const nodes: Record<string, ReactNode> = {
    ai_hero: <AiHero pendingPromptsCount={sugerencias.length} />,
    kpi_casos: (
      <KpiCard
        label="Casos abiertos"
        href="/casos"
        iconName="briefcase"
        color="blue"
        numeric={{ type: "number", value: openCasesRes.total }}
        hint={`${casesRes.total} en total`}
        delay={0}
      />
    ),
    kpi_clientes: (
      <KpiCard
        label="Clientes"
        href="/clientes"
        iconName="users"
        color="teal"
        numeric={{ type: "number", value: clientsRes.total }}
        hint="Activos + prospectos"
        delay={0.05}
      />
    ),
    kpi_horas: (
      <KpiCard
        label="Mis horas (mes)"
        href="/tiempos"
        iconName="clock"
        color="amber"
        numeric={{ type: "number", value: myHours, suffix: "h", decimals: 1 }}
        hint={`${myBillableHours.toFixed(1)}h facturables`}
        delay={0.1}
      />
    ),
    kpi_cobrar: (
      <KpiCard
        label="Por cobrar"
        href="/reportes"
        iconName="receipt"
        color="rose"
        displayValue={formatMoney(num(billing.total_outstanding))}
        hint={`${billing.invoice_count} facturas YTD`}
        delay={0.15}
      />
    ),
    kpi_tareas: (
      <KpiCard
        label="Mis tareas pendientes"
        href="/tareas"
        iconName="clock"
        color="teal"
        numeric={{ type: "number", value: misTareas.length }}
        hint="Asignadas a vos"
        delay={0.2}
      />
    ),
    aging: (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-destructive" />
              Cuentas por cobrar
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Aging de las facturas vigentes, click una barra para detalles.
            </p>
          </div>
          <Link
            href="/reportes"
            className="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            Ver reporte completo →
          </Link>
        </CardHeader>
        <CardContent>
          <AgingChart data={agingData} />
        </CardContent>
      </Card>
    ),
    proximos_eventos: (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-action" />
            Próximos 7 días
          </CardTitle>
          <Link
            href="/calendario"
            className="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            Calendario →
          </Link>
        </CardHeader>
        <CardContent>
          {proximosEventos.length === 0 ? (
            <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-muted/50">
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">
                Sin eventos en los próximos 7 días.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {proximosEventos.slice(0, 5).map((e, idx) => {
                const startAt = new Date(e.startAt);
                const isToday = startAt.toDateString() === new Date().toDateString();
                return (
                  <li
                    key={e.id}
                    className="fade-in-up"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <Link
                      href={e.caseId ? `/casos/${e.caseId}` : "/calendario"}
                      className="group flex items-start gap-3 rounded-[3px] border border-transparent p-2.5 transition-all hover:border-border hover:bg-accent/40"
                    >
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[3px] border border-border bg-secondary">
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-action dark:text-action">
                          {startAt.toLocaleDateString("es-DO", { month: "short" }).replace(".", "")}
                        </span>
                        <span className="text-lg font-semibold leading-none">
                          {startAt.getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {e.title}
                          {e.eventType === "audiencia" ? (
                            <Badge variant="default" className="shrink-0 text-[9px]">Audiencia</Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isToday ? "Hoy" : startAt.toLocaleDateString("es-DO", { weekday: "long" })}
                          {" · "}
                          {startAt.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                          {e.caseCode ? (
                            <>
                              {" · "}
                              <span className="font-mono">{e.caseCode}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
    sugerencias:
      sugerencias.length > 0 ? (
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
      ) : null,
    mis_tareas: (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-action" />
            Mis tareas pendientes
            {misTareas.length > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-action/15 px-1.5 text-[10px] font-semibold text-action dark:text-action">
                {misTareas.length}
              </span>
            ) : null}
          </CardTitle>
          <Link
            href="/tareas"
            className="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            Ver todo →
          </Link>
        </CardHeader>
        <CardContent>
          {misTareas.length === 0 ? (
            <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-action/10">
                <CheckSquare className="h-5 w-5 text-action" />
              </span>
              <p className="text-sm text-muted-foreground">
                Sin tareas pendientes. ¡A respirar!
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {misTareas.slice(0, 6).map((t, idx) => {
                const overdue = t.dueAt && new Date(t.dueAt).getTime() < now.getTime();
                const priorityColor =
                  t.priority === "urgent"
                    ? "text-destructive dark:text-destructive bg-destructive/10 border-destructive/20"
                    : t.priority === "high"
                      ? "text-warning dark:text-warning bg-warning/10 border-warning/20"
                      : "text-muted-foreground bg-muted/40 border-border";
                return (
                  <li
                    key={t.id}
                    className="fade-in-up group flex items-start gap-3 rounded-[3px] border border-transparent p-2.5 transition-all hover:border-border hover:bg-accent/40"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${priorityColor}`}
                    >
                      <CheckSquare className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{t.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                        {t.caseCode ? (
                          <>
                            <span className="opacity-50">·</span>
                            <Link href={`/casos/${t.caseId}`} className="font-mono hover:underline">
                              {t.caseCode}
                            </Link>
                          </>
                        ) : null}
                        {t.dueAt ? (
                          <>
                            <span className="opacity-50">·</span>
                            <span
                              className={
                                overdue ? "font-medium text-destructive dark:text-destructive" : ""
                              }
                            >
                              {overdue ? "Vencida " : "Vence "}
                              {formatInFirmTz(t.dueAt, undefined, "dd/MM/yyyy")}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Badge
                      variant={TASK_PRIORITY_VARIANT[t.priority] ?? "outline"}
                      className="text-[10px] capitalize"
                    >
                      {t.priority}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
    actividad: (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-action" />
            Actividad reciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {actividad.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin actividad registrada todavía.
            </p>
          ) : (
            <ul className="relative space-y-0">
              {actividad.slice(0, 7).map((e, i, arr) => {
                const initials = (e.userName ?? "??")
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <li
                    key={e.id}
                    className="fade-in-up relative flex items-start gap-3 pb-3"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    {i < arr.length - 1 ? (
                      <span
                        aria-hidden
                        className="absolute left-[14px] top-7 h-[calc(100%-1.5rem)] w-px bg-border"
                      />
                    ) : null}
                    <span className="z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground ring-2 ring-background">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="text-xs">
                        <strong className="text-foreground">{e.userName ?? "Sistema"}</strong>{" "}
                        <span className="text-muted-foreground">
                          {ACTION_LABEL[e.action] ?? e.action}{" "}
                          {ENTITY_LABEL[e.entityType] ?? e.entityType}
                        </span>
                      </p>
                      {e.summary ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                          {e.summary}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                        {formatInFirmTz(e.createdAt, undefined, "dd/MM HH:mm")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
    casos_recientes: (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4 text-action" />
            Casos recientes
          </CardTitle>
          <Link
            href="/casos"
            className="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            Ver todos →
          </Link>
        </CardHeader>
        <CardContent>
          {(recentCasesRes?.rows ?? []).length === 0 ? (
            <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-muted/50">
                <Briefcase className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">Aún no hay casos.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {(recentCasesRes?.rows ?? []).map((c, idx) => (
                <li
                  key={c.id}
                  className="fade-in-up"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <Link
                    href={`/casos/${c.id}`}
                    className="group flex items-center gap-3 rounded-[3px] border border-transparent p-2.5 transition-all hover:border-border hover:bg-accent/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-mono">{c.code}</span>
                        <span className="opacity-50">·</span>
                        <span>{MATTER_LABEL[c.matterType]}</span>
                        {c.clientDisplayName ? (
                          <>
                            <span className="opacity-50">·</span>
                            <span className="truncate">{c.clientDisplayName}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Badge variant={CASE_STATUS_VARIANT[c.status] ?? "secondary"} className="text-[10px]">
                      {CASE_STATUS_LABEL[c.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
    agenda_hoy: (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-action" />
            Agenda de hoy
          </CardTitle>
          <Link
            href="/calendario"
            className="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            Calendario →
          </Link>
        </CardHeader>
        <CardContent>
          {eventosHoy.length === 0 ? (
            <div className="flex h-[160px] flex-col items-center justify-center gap-2 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-muted/50">
                <Calendar className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-sm text-muted-foreground">Nada agendado para hoy.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {eventosHoy.map((e, idx) => {
                const startAt = new Date(e.startAt);
                return (
                  <li key={e.id} className="fade-in-up" style={{ animationDelay: `${idx * 50}ms` }}>
                    <Link
                      href={e.caseId ? `/casos/${e.caseId}` : "/calendario"}
                      className="group flex items-center gap-3 rounded-[3px] border border-transparent p-2.5 transition-all hover:border-border hover:bg-accent/40"
                    >
                      <span className="shrink-0 rounded-lg border border-action/50 bg-action/10 px-2 py-1 font-mono text-xs font-semibold text-action dark:border-action/40 dark:text-action">
                        {startAt.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {e.title}
                          {e.eventType === "audiencia" ? (
                            <Badge variant="default" className="shrink-0 text-[9px]">Audiencia</Badge>
                          ) : null}
                        </p>
                        {e.caseCode ? (
                          <p className="font-mono text-xs text-muted-foreground">{e.caseCode}</p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
    facturas_vencidas: (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-destructive" />
            Facturas vencidas
            {facturasVencidas.length > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive/15 px-1.5 text-[10px] font-semibold text-destructive dark:text-destructive">
                {facturasVencidas.length}
              </span>
            ) : null}
          </CardTitle>
          <Link
            href="/facturacion"
            className="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            Facturación →
          </Link>
        </CardHeader>
        <CardContent>
          {facturasVencidas.length === 0 ? (
            <div className="flex h-[160px] flex-col items-center justify-center gap-2 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-action/10">
                <Receipt className="h-5 w-5 text-action" />
              </span>
              <p className="text-sm text-muted-foreground">Sin facturas vencidas. 👌</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {facturasVencidas.map((f, idx) => {
                const dias = Math.floor((now.getTime() - new Date(f.dueOn).getTime()) / 86400000);
                return (
                  <li key={f.id} className="fade-in-up" style={{ animationDelay: `${idx * 50}ms` }}>
                    <Link
                      href={`/facturacion/${f.id}`}
                      className="group flex items-center gap-3 rounded-[3px] border border-transparent p-2.5 transition-all hover:border-border hover:bg-accent/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          <span className="font-mono">{f.number}</span>
                          {f.clientName ? ` · ${f.clientName}` : ""}
                        </p>
                        <p className="text-xs text-destructive dark:text-destructive">
                          Vencida hace {dias} {dias === 1 ? "día" : "días"}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
                        {formatMoney(num(f.balance), f.currency)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
    tareas_equipo: (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-action" />
            Tareas del equipo
          </CardTitle>
          <Link
            href="/tareas"
            className="text-xs font-medium text-primary hover:underline underline-offset-4"
          >
            Ver todo →
          </Link>
        </CardHeader>
        <CardContent>
          {tareasEquipo.length === 0 ? (
            <div className="flex h-[160px] flex-col items-center justify-center gap-2 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-action/10">
                <CheckSquare className="h-5 w-5 text-action" />
              </span>
              <p className="text-sm text-muted-foreground">Sin tareas pendientes en la firma.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {tareasEquipo.map((t, idx) => (
                <li
                  key={t.id}
                  className="fade-in-up flex items-start gap-3 rounded-[3px] border border-transparent p-2.5 transition-all hover:border-border hover:bg-accent/40"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{t.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{t.assigneeName ?? "Sin asignar"}</span>
                      {t.caseCode ? (
                        <>
                          <span className="opacity-50">·</span>
                          <Link href={`/casos/${t.caseId}`} className="font-mono hover:underline">
                            {t.caseCode}
                          </Link>
                        </>
                      ) : null}
                      {t.dueAt ? (
                        <>
                          <span className="opacity-50">·</span>
                          <span>{formatInFirmTz(t.dueAt, undefined, "dd/MM/yyyy")}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <Badge
                    variant={TASK_PRIORITY_VARIANT[t.priority] ?? "outline"}
                    className="text-[10px] capitalize"
                  >
                    {t.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    ),
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {now.toLocaleDateString("es-DO", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
            {greeting}, {user.name.split(" ")[0]}.
          </h1>
        </div>
        <DashboardCustomize widgets={layout} />
      </div>

      <OnboardingChecklist progress={onboarding} firmName={firm?.name ?? "tu firma"} />

      <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-12">
        {layout
          .filter((w) => w.visible)
          .map((w) => {
            const node = nodes[w.id];
            if (!node) return null;
            return (
              <div key={w.id} className={SPAN_CLASS[w.span]}>
                {node}
              </div>
            );
          })}
      </div>
    </div>
  );
}
