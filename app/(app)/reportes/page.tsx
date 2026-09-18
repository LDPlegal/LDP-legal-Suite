import Link from "next/link";
import { Clock, DollarSign, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import {
  ACTION_LABEL,
  AGING_BUCKET_LABEL,
  AI_FEATURE_LABEL,
  aiCreatedEventsReport,
  aiGeneratedDocsReport,
  aiUsageSummary,
  arAgingReport,
  billingSummary,
  ENTITY_LABEL,
  hoursByMonthReport,
  hoursByUserReport,
  listFirmRecentAudit,
  topCasesByHoursReport,
  type AgingBucket,
} from "@/lib/db/queries/audit";
import {
  unbilledWipReport,
  stalledCasesReport,
  topClientsByRevenueReport,
} from "@/lib/db/queries/executive";
import { isAiEnabled } from "@/lib/ai";
import { formatMoney, num } from "@/lib/invoicing/calculate";
import { formatInFirmTz } from "@/lib/datetime/format";
import { HoursMonthlyChart } from "./_components/charts";
import { AlertTriangle, Hourglass, TrendingUp, TrendingDown, Briefcase } from "lucide-react";

export const metadata = { title: "Reportes · LDP Legal Suite" };

function fmtHours(seconds: number): string {
  const h = seconds / 3600;
  return `${h.toFixed(1)}h`;
}

export default async function ReportesPage() {
  const user = await requireUser();

  // Date ranges
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  const ytdEnd = new Date(now.getFullYear() + 1, 0, 1);

  // Mes anterior, para el delta de ingresos en la vista ejecutiva.
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = monthStart;

  const aiEnabled = isAiEnabled();
  const [
    aging,
    hoursByUser,
    hoursByMonth,
    topCases,
    summary,
    recent,
    aiStats,
    aiDocs,
    aiEvents,
    monthBilling,
    prevMonthBilling,
    wip,
    stalledCases,
    topClients,
  ] = await Promise.all([
    arAgingReport(user.firmId, user.userId),
    hoursByUserReport(user.firmId, user.userId, { from: monthStart, to: monthEnd }),
    hoursByMonthReport(user.firmId, user.userId, 6),
    topCasesByHoursReport(user.firmId, user.userId, { from: ytdStart, to: ytdEnd }, 10),
    billingSummary(user.firmId, user.userId, { from: ytdStart, to: ytdEnd }),
    listFirmRecentAudit(user.firmId, user.userId, 50),
    aiEnabled
      ? aiUsageSummary(user.firmId, user.userId, { from: monthStart, to: monthEnd })
      : Promise.resolve(null),
    aiEnabled
      ? aiGeneratedDocsReport(user.firmId, user.userId, 50)
      : Promise.resolve([]),
    aiEnabled
      ? aiCreatedEventsReport(user.firmId, user.userId, 50)
      : Promise.resolve([]),
    billingSummary(user.firmId, user.userId, { from: monthStart, to: monthEnd }),
    billingSummary(user.firmId, user.userId, { from: prevMonthStart, to: prevMonthEnd }),
    unbilledWipReport(user.firmId, user.userId, 15),
    stalledCasesReport(user.firmId, user.userId, 30, 15),
    topClientsByRevenueReport(user.firmId, user.userId, { from: ytdStart, to: ytdEnd }, 5),
  ]);

  // Delta de ingresos mes actual vs anterior.
  const monthBilled = num(monthBilling.total_billed);
  const prevBilled = num(prevMonthBilling.total_billed);
  const billedDeltaPct =
    prevBilled > 0 ? ((monthBilled - prevBilled) / prevBilled) * 100 : null;

  // Period strings for the 607 download button (current month).
  const dgiiYear = now.getFullYear();
  const dgiiMonth = now.getMonth() + 1;

  // Normalize aging buckets so all 5 always appear, even if empty.
  const agingMap = new Map<AgingBucket, { total: number; count: number }>();
  for (const r of aging) agingMap.set(r.bucket, { total: num(r.total), count: r.count });
  const agingFull = (
    ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as AgingBucket[]
  ).map((b) => ({
    bucket: b,
    label: AGING_BUCKET_LABEL[b],
    total: agingMap.get(b)?.total ?? 0,
    count: agingMap.get(b)?.count ?? 0,
  }));
  const totalAging = agingFull.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Año ${now.getFullYear()}`}
        title="Reportes"
        description="Indicadores de la firma: facturación, productividad por persona, AR aging y consumo de IA."
      />


      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Facturado YTD"
          value={formatMoney(num(summary.total_billed))}
          hint={`${summary.invoice_count} facturas`}
        />
        <KpiCard
          icon={DollarSign}
          label="Cobrado YTD"
          value={formatMoney(num(summary.total_collected))}
        />
        <KpiCard
          icon={FileText}
          label="Por cobrar"
          value={formatMoney(num(summary.total_outstanding))}
          hint={`${agingFull.reduce((s, r) => s + r.count, 0)} facturas abiertas`}
        />
        <KpiCard
          icon={Clock}
          label="Horas registradas (mes)"
          value={fmtHours(hoursByUser.reduce((s, u) => s + u.total_seconds, 0))}
          hint={`${hoursByUser.filter((u) => u.total_seconds > 0).length} miembros activos`}
        />
      </div>

      <Tabs defaultValue="direccion">
        <TabsList>
          <TabsTrigger value="direccion">Dirección</TabsTrigger>
          <TabsTrigger value="cobros">Por cobrar (aging)</TabsTrigger>
          <TabsTrigger value="horas">Horas por abogado</TabsTrigger>
          <TabsTrigger value="tendencia">Tendencia mensual</TabsTrigger>
          <TabsTrigger value="casos">Top casos</TabsTrigger>
          <TabsTrigger value="dgii">DGII</TabsTrigger>
          {aiEnabled ? <TabsTrigger value="ia">IA</TabsTrigger> : null}
          <TabsTrigger value="bitacora">Bitácora ({recent.length})</TabsTrigger>
        </TabsList>

        {/* ===== Vista ejecutiva: lo que el dueño quiere ver de un vistazo ===== */}
        <TabsContent value="direccion" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Facturado este mes
                </CardTitle>
                {billedDeltaPct !== null ? (
                  billedDeltaPct >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                  )
                ) : (
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                )}
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-semibold tabular-nums">
                  {formatMoney(monthBilled)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {billedDeltaPct !== null ? (
                    <span
                      className={
                        billedDeltaPct >= 0
                          ? "font-medium text-emerald-600 dark:text-emerald-400"
                          : "font-medium text-rose-600 dark:text-rose-400"
                      }
                    >
                      {billedDeltaPct >= 0 ? "+" : ""}
                      {billedDeltaPct.toFixed(0)}%
                    </span>
                  ) : (
                    "—"
                  )}{" "}
                  vs mes anterior ({formatMoney(prevBilled)})
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Trabajo sin facturar (WIP)
                </CardTitle>
                <Hourglass className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-semibold tabular-nums">
                  {formatMoney(num(wip.totalValue))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtHours(wip.totalSeconds)} facturables registradas, aún no
                  facturadas — dinero por cobrar.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Casos estancados
                </CardTitle>
                <AlertTriangle
                  className={
                    stalledCases.length > 0
                      ? "h-4 w-4 text-rose-500"
                      : "h-4 w-4 text-muted-foreground"
                  }
                />
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-semibold tabular-nums">
                  {stalledCases.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Casos abiertos sin actividad hace +30 días.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* WIP por caso */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Hourglass className="h-4 w-4 text-amber-500" />
                  Dónde está el dinero parado
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Horas facturables registradas que todavía no entraron a una
                  factura, por caso.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Caso</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wip.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                          Todo lo facturable ya está facturado. 🎉
                        </TableCell>
                      </TableRow>
                    ) : (
                      wip.rows.map((w) => (
                        <TableRow key={w.caseId}>
                          <TableCell>
                            <Link
                              href={`/casos/${w.caseId}?tab=tiempos`}
                              className="hover:underline"
                            >
                              <span className="font-mono text-xs text-muted-foreground">
                                {w.caseCode}
                              </span>{" "}
                              <span className="text-sm">{w.caseTitle}</span>
                            </Link>
                            {w.clientName ? (
                              <p className="text-[11px] text-muted-foreground">
                                {w.clientName}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">
                            {fmtHours(w.unbilledSeconds)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">
                            {formatMoney(num(w.unbilledValue))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Casos estancados */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  Casos que necesitan atención
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Abiertos sin movimiento hace +30 días. Revisá si requieren
                  acción o cierre.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Caso</TableHead>
                      <TableHead className="text-right">Última actividad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stalledCases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                          Ningún caso estancado. Buen ritmo. 👍
                        </TableCell>
                      </TableRow>
                    ) : (
                      stalledCases.map((s) => (
                        <TableRow key={s.caseId}>
                          <TableCell>
                            <Link href={`/casos/${s.caseId}`} className="hover:underline">
                              <span className="font-mono text-xs text-muted-foreground">
                                {s.caseCode}
                              </span>{" "}
                              <span className="text-sm">{s.caseTitle}</span>
                            </Link>
                            {s.clientName ? (
                              <p className="text-[11px] text-muted-foreground">
                                {s.clientName}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={s.daysSince > 60 ? "destructive" : "warning"}>
                              hace {s.daysSince} días
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Top clientes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="h-4 w-4 text-blue-500" />
                Top 5 clientes por facturación (YTD)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Facturas</TableHead>
                    <TableHead className="text-right">Facturado</TableHead>
                    <TableHead className="text-right">Cobrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        Sin facturación registrada este año.
                      </TableCell>
                    </TableRow>
                  ) : (
                    topClients.map((c) => (
                      <TableRow key={c.clientId}>
                        <TableCell>
                          <Link href={`/clientes/${c.clientId}`} className="text-sm hover:underline">
                            {c.clientName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm">
                          {c.invoiceCount}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm">
                          {formatMoney(num(c.totalBilled))}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm text-emerald-600 dark:text-emerald-400">
                          {formatMoney(num(c.totalCollected))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Handoff 3p: tablas, no gráficos decorativos. La tabla de
            antigüedad ya existía acá, así que se retiró el gráfico en vez
            de duplicar los mismos datos en dos formatos. */}
        <TabsContent value="cobros" className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Pendiente por antigüedad</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bucket</TableHead>
                      <TableHead className="text-right">Facturas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">% del total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingFull.map((r) => (
                      <TableRow key={r.bucket}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell className="text-right font-mono">{r.count}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMoney(r.total)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {totalAging > 0
                            ? `${((r.total / totalAging) * 100).toFixed(1)}%`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right font-mono">
                        {agingFull.reduce((s, r) => s + r.count, 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoney(totalAging)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="horas">
          <Card>
            <CardHeader>
              <CardTitle>Horas del mes por usuario</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Facturables</TableHead>
                    <TableHead className="text-right">Realización</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hoursByUser.map((u) => {
                    const realization =
                      u.total_seconds > 0
                        ? (u.billable_seconds / u.total_seconds) * 100
                        : 0;
                    return (
                      <TableRow key={u.user_id}>
                        <TableCell>{u.user_name}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmtHours(u.total_seconds)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmtHours(u.billable_seconds)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {u.total_seconds > 0 ? `${realization.toFixed(0)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {u.entry_count}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tendencia">
          <Card>
            <CardHeader>
              <CardTitle>Horas por mes (últimos 6)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <HoursMonthlyChart data={hoursByMonth.map((r) => ({
                month: r.month,
                total: r.total_seconds / 3600,
                billable: r.billable_seconds / 3600,
              }))} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="casos">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 casos por horas (YTD)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Código</TableHead>
                    <TableHead>Caso</TableHead>
                    <TableHead className="text-right">Horas totales</TableHead>
                    <TableHead className="text-right">Facturables</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                        Sin tiempos registrados aún este año.
                      </TableCell>
                    </TableRow>
                  ) : (
                    topCases.map((c) => (
                      <TableRow key={c.case_id}>
                        <TableCell className="font-mono text-xs">
                          <Link href={`/casos/${c.case_id}`} className="hover:underline">
                            {c.case_code}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{c.case_title}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmtHours(c.total_seconds)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmtHours(c.billable_seconds)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dgii">
          <Card>
            <CardHeader>
              <CardTitle>Reportes DGII</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-medium">607 — Ventas con NCF del mes</p>
                <p className="text-xs text-muted-foreground">
                  Archivo pipe-delimited con todas las facturas emitidas con NCF
                  durante el mes actual. Súbelo a la oficina virtual DGII.
                </p>
                <div className="mt-3">
                  <a
                    href={`/api/reportes/607?year=${dgiiYear}&month=${dgiiMonth}`}
                    download
                    className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
                  >
                    Descargar 607 {String(dgiiMonth).padStart(2, "0")}/{dgiiYear}
                  </a>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  El 606 (compras) requiere capturar NCF de proveedores en los
                  gastos, lo cual está deferred. Si necesitas el 606 hoy,
                  generarlo manualmente desde la lista de gastos.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {aiEnabled && aiStats ? (
          <TabsContent value="ia">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Llamadas (mes)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-2xl font-semibold tabular-nums">
                    {aiStats.totals.call_count}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tokens (mes)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-2xl font-semibold tabular-nums">
                    {(aiStats.totals.input_tokens + aiStats.totals.output_tokens).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {aiStats.totals.input_tokens.toLocaleString()} entrada ·{" "}
                    {aiStats.totals.output_tokens.toLocaleString()} salida
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Costo (mes)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-2xl font-semibold tabular-nums">
                    USD {Number(aiStats.totals.cost_usd).toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Por feature</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead className="text-right">Llamadas</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Costo USD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiStats.byFeature.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Sin uso registrado este mes.
                        </TableCell>
                      </TableRow>
                    ) : (
                      aiStats.byFeature.map((r) => (
                        <TableRow key={r.feature}>
                          <TableCell>
                            {AI_FEATURE_LABEL[r.feature] ?? r.feature}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {r.call_count}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {(r.input_tokens + r.output_tokens).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            ${Number(r.cost_usd).toFixed(4)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Por usuario</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead className="text-right">Llamadas</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Costo USD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiStats.byUser.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          Sin uso registrado este mes.
                        </TableCell>
                      </TableRow>
                    ) : (
                      aiStats.byUser.map((r) => (
                        <TableRow key={r.user_id ?? "sin-usuario"}>
                          <TableCell>{r.user_name ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {r.call_count}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {(r.input_tokens + r.output_tokens).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            ${Number(r.cost_usd).toFixed(4)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Documentos generados por IA</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Caso</TableHead>
                      <TableHead>Pedido por</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiDocs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                          No hay documentos generados por IA todavía.
                        </TableCell>
                      </TableRow>
                    ) : (
                      aiDocs.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(d.created_at).toLocaleDateString("es-DO", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={d.case_id ? `/casos/${d.case_id}` : `/documentos`}
                              className="hover:underline"
                              title={d.ai_original_prompt ?? undefined}
                            >
                              {d.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs">
                            {d.case_code ? (
                              <span className="font-mono">{d.case_code}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {d.uploader_name ?? "—"}
                          </TableCell>
                          <TableCell>
                            {d.review_status === "approved" ? (
                              <Badge variant="success">Aprobado</Badge>
                            ) : d.review_status === "rejected" ? (
                              <Badge variant="destructive">Rechazado</Badge>
                            ) : d.review_status === "pending" ? (
                              <Badge variant="warning">Pendiente revisión</Badge>
                            ) : (
                              <Badge variant="secondary">—</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Eventos creados por IA</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creado</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha evento</TableHead>
                      <TableHead>Caso</TableHead>
                      <TableHead>Por</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                          No hay eventos creados por IA todavía.
                        </TableCell>
                      </TableRow>
                    ) : (
                      aiEvents.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleDateString("es-DO", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </TableCell>
                          <TableCell title={e.original_prompt ?? undefined}>
                            {e.title}
                          </TableCell>
                          <TableCell className="text-xs">{e.event_type ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {new Date(e.start_at).toLocaleString("es-DO", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-xs">
                            {e.case_code ? (
                              <Link
                                href={`/casos/${e.case_id}`}
                                className="font-mono hover:underline"
                              >
                                {e.case_code}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {e.creator_name ?? "—"}
                          </TableCell>
                          <TableCell>
                            {e.deleted_at ? (
                              <Badge variant="destructive">Cancelado</Badge>
                            ) : (
                              <Badge variant="success">Activo</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="bitacora">
          <Card>
            <CardHeader>
              <CardTitle>Actividad reciente del firm</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {recent.length === 0 ? (
                  <li className="p-6 text-center text-sm text-muted-foreground">
                    Sin actividad registrada todavía.
                  </li>
                ) : (
                  recent.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 p-3 text-sm">
                      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase">
                        {(e.userName ?? "?").slice(0, 2)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p>
                          <strong>{e.userName ?? "Sistema"}</strong>{" "}
                          {ACTION_LABEL[e.action] ?? e.action}{" "}
                          <span className="text-muted-foreground">
                            {ENTITY_LABEL[e.entityType] ?? e.entityType}
                          </span>
                        </p>
                        {e.summary ? (
                          <p className="text-xs text-muted-foreground">{e.summary}</p>
                        ) : null}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {formatInFirmTz(e.createdAt, undefined, "dd/MM HH:mm")}
                      </Badge>
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
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
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
