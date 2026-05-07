import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ComingSoon } from "@/components/layout/coming-soon";
import { getCaseById } from "@/lib/db/queries/cases";
import { listTimeEntriesForCase } from "@/lib/db/queries/time-entries";
import { listExpensesForCase, totalAmount } from "@/lib/db/queries/expenses";
import { listTasksForCase } from "@/lib/db/queries/tasks";
import { listEventsForCase } from "@/lib/db/queries/events";
import { listFirmUsers } from "@/lib/db/queries/users";
import { requireUser } from "@/lib/auth/session";
import { eliminarCasoAction } from "@/app/_actions/casos/eliminar";
import { aprobarTiempoAction } from "@/app/_actions/tiempos/aprobar";
import { aprobarGastoAction } from "@/app/_actions/gastos/aprobar";
import {
  BILLING_MODE_LABEL,
  CASE_STATUS_LABEL,
  MATTER_LABEL,
} from "@/lib/schemas/caso";
import {
  EXPENSE_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TIME_ENTRY_STATUS_LABEL,
} from "@/lib/schemas/fase1";
import { formatInFirmTz } from "@/lib/datetime/format";
import { ManualTimeEntryDrawer } from "@/app/(app)/tiempos/_components/manual-entry-drawer";
import { TaskFormDrawer } from "@/app/(app)/tareas/_components/task-form-drawer";
import { EventoFormDrawer } from "@/app/(app)/calendario/_components/evento-form-drawer";
import { StartTimerButton } from "./_components/start-timer-button";
import { GastoFormDrawer } from "./_components/gasto-form-drawer";

export const metadata = { title: "Caso · LDP Legal Suite" };

const ASSIGNMENT_LABEL: Record<"lead" | "associate" | "paralegal", string> = {
  lead: "Líder",
  associate: "Asociado",
  paralegal: "Paralegal",
};

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export default async function CasoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getCaseById(user.firmId, user.userId, id);
  if (!detail) notFound();

  const { case: c, client, leadLawyer, assignments } = detail;

  const [tiempos, gastos, tareas, eventos, usuarios] = await Promise.all([
    listTimeEntriesForCase(user.firmId, user.userId, c.id),
    listExpensesForCase(user.firmId, user.userId, c.id),
    listTasksForCase(user.firmId, user.userId, c.id),
    listEventsForCase(user.firmId, user.userId, c.id),
    listFirmUsers(user.firmId, user.userId),
  ]);

  const totalTimeSec = tiempos.reduce((s, t) => s + t.durationSeconds, 0);
  const billableTimeSec = tiempos
    .filter((t) => t.billable)
    .reduce((s, t) => s + t.durationSeconds, 0);
  const totalGastos = totalAmount(gastos);
  const billableGastos = totalAmount(gastos.filter((g) => g.billable));
  const isApprover = user.role === "admin" || user.role === "partner";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/casos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a casos
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">
                {c.code}
              </span>
              {c.visibility === "restricted" ? (
                <Badge variant="warning" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Restringido
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.title}</h1>
            <p className="text-sm text-muted-foreground">
              {client?.displayName ?? "—"} · {MATTER_LABEL[c.matterType]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StartTimerButton caseId={c.id} caseTitle={c.title} />
            <Badge variant="outline">{CASE_STATUS_LABEL[c.status]}</Badge>
            <form action={eliminarCasoAction}>
              <input type="hidden" name="caseId" value={c.id} />
              <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="h-4 w-4" />
                Archivar
              </Button>
            </form>
          </div>
        </div>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="tiempos">Tiempos ({tiempos.length})</TabsTrigger>
          <TabsTrigger value="gastos">Gastos ({gastos.length})</TabsTrigger>
          <TabsTrigger value="tareas">Tareas ({tareas.length})</TabsTrigger>
          <TabsTrigger value="eventos">Eventos ({eventos.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
          <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
        </TabsList>

        {/* ----- Resumen ----- */}
        <TabsContent value="resumen" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Detalle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Cliente">
                  {client ? (
                    <Link href={`/clientes/${client.id}`} className="hover:underline">
                      {client.displayName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row label="Líder">{leadLawyer?.name ?? "Sin asignar"}</Row>
                <Row label="Modo de facturación">{BILLING_MODE_LABEL[c.billingMode]}</Row>
                {c.flatFeeAmount ? (
                  <Row label="Tarifa plana">
                    <span className="font-mono">DOP {c.flatFeeAmount}</span>
                  </Row>
                ) : null}
                {c.retainerBalance ? (
                  <Row label="Iguala">
                    <span className="font-mono">DOP {c.retainerBalance}</span>
                  </Row>
                ) : null}
                {c.court ? <Row label="Tribunal">{c.court}</Row> : null}
                <Separator />
                <Row label="Contraparte">
                  {c.counterpartyName ?? "—"}
                  {c.counterpartyTaxId ? (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      ({c.counterpartyTaxId})
                    </span>
                  ) : null}
                </Row>
                {c.tags.length > 0 ? (
                  <Row label="Etiquetas">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </Row>
                ) : null}
                <Separator />
                <Row label="Apertura">{formatInFirmTz(c.openedAt)}</Row>
                {c.closedAt ? <Row label="Cierre">{formatInFirmTz(c.closedAt)}</Row> : null}
                {c.description ? (
                  <>
                    <Separator />
                    <p className="whitespace-pre-wrap text-sm">{c.description}</p>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Indicadores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Horas registradas</span>
                    <span className="font-mono tabular-nums">{fmtDuration(totalTimeSec)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Horas facturables</span>
                    <span className="font-mono tabular-nums">{fmtDuration(billableTimeSec)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total gastos</span>
                    <span className="font-mono tabular-nums">DOP {totalGastos.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gastos facturables</span>
                    <span className="font-mono tabular-nums">DOP {billableGastos.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Equipo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin asignaciones específicas (visibilidad: firma).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {assignments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between rounded-md border p-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">{a.userName}</p>
                            <p className="text-xs text-muted-foreground">{a.userEmail}</p>
                          </div>
                          <Badge variant="outline">{ASSIGNMENT_LABEL[a.roleInCase]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ----- Tiempos ----- */}
        <TabsContent value="tiempos" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {tiempos.length} entradas · {fmtDuration(totalTimeSec)} totales
            </p>
            <ManualTimeEntryDrawer
              casos={[{ id: c.id, code: c.code, title: c.title }]}
              defaultCaseId={c.id}
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  Entrada manual
                </Button>
              }
            />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Duración</TableHead>
                  <TableHead>Facturable</TableHead>
                  <TableHead>Estado</TableHead>
                  {isApprover ? <TableHead className="w-24" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiempos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isApprover ? 7 : 6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Sin tiempos registrados. Inicia un timer arriba o registra entrada manual.
                    </TableCell>
                  </TableRow>
                ) : (
                  tiempos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatInFirmTz(t.startedAt, undefined, "dd/MM HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm">{t.userName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{t.description ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {fmtDuration(t.durationSeconds)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.billable ? "outline" : "secondary"}>
                          {t.billable ? "Sí" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            t.status === "approved"
                              ? "success"
                              : t.status === "invoiced"
                                ? "default"
                                : "warning"
                          }
                        >
                          {TIME_ENTRY_STATUS_LABEL[t.status]}
                        </Badge>
                      </TableCell>
                      {isApprover ? (
                        <TableCell>
                          {t.status === "draft" ? (
                            <form action={aprobarTiempoAction}>
                              <input type="hidden" name="entryId" value={t.id} />
                              <input type="hidden" name="caseId" value={c.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                Aprobar
                              </Button>
                            </form>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ----- Gastos ----- */}
        <TabsContent value="gastos" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {gastos.length} gastos · DOP {totalGastos.toFixed(2)} total
            </p>
            <GastoFormDrawer
              caseId={c.id}
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo gasto
                </Button>
              }
            />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Facturable</TableHead>
                  <TableHead>Estado</TableHead>
                  {isApprover ? <TableHead className="w-24" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isApprover ? 7 : 6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Sin gastos. Captura uno con el botón de arriba.
                    </TableCell>
                  </TableRow>
                ) : (
                  gastos.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatInFirmTz(g.incurredOn, undefined, "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-sm">{g.userName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{g.description}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {g.currency} {Number(g.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={g.billable ? "outline" : "secondary"}>
                          {g.billable ? "Sí" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            g.status === "approved"
                              ? "success"
                              : g.status === "invoiced"
                                ? "default"
                                : "warning"
                          }
                        >
                          {EXPENSE_STATUS_LABEL[g.status]}
                        </Badge>
                      </TableCell>
                      {isApprover ? (
                        <TableCell>
                          {g.status === "draft" ? (
                            <form action={aprobarGastoAction}>
                              <input type="hidden" name="expenseId" value={g.id} />
                              <input type="hidden" name="caseId" value={c.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                Aprobar
                              </Button>
                            </form>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ----- Tareas ----- */}
        <TabsContent value="tareas" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {tareas.length} {tareas.length === 1 ? "tarea" : "tareas"}
            </p>
            <TaskFormDrawer
              casos={[{ id: c.id, code: c.code, title: c.title }]}
              users={usuarios.map((u) => ({ id: u.id, name: u.name }))}
              defaultCaseId={c.id}
              redirectTo={`/casos/${c.id}`}
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  Nueva tarea
                </Button>
              }
            />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Asignado</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tareas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Sin tareas en este caso.
                    </TableCell>
                  </TableRow>
                ) : (
                  tareas.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">
                        <p className="font-medium">{t.title}</p>
                        {t.description ? (
                          <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{t.assigneeName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{TASK_PRIORITY_LABEL[t.priority]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge>{TASK_STATUS_LABEL[t.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.dueAt ? formatInFirmTz(t.dueAt, undefined, "dd/MM/yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ----- Eventos ----- */}
        <TabsContent value="eventos" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {eventos.length} {eventos.length === 1 ? "evento" : "eventos"}
            </p>
            <EventoFormDrawer
              casos={[{ id: c.id, code: c.code, title: c.title }]}
              users={usuarios.map((u) => ({ id: u.id, name: u.name }))}
              currentUserId={user.userId}
              defaultCaseId={c.id}
              redirectTo={`/casos/${c.id}`}
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo evento
                </Button>
              }
            />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Lugar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      Sin eventos en este caso.
                    </TableCell>
                  </TableRow>
                ) : (
                  eventos.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm font-medium">{e.title}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatInFirmTz(e.startAt, undefined, "dd/MM HH:mm")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatInFirmTz(e.endAt, undefined, "dd/MM HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm">{e.location ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <ComingSoon module="Documentos" phase="Fase 2" description="Upload, OCR, versiones." />
        </TabsContent>
        <TabsContent value="notas">
          <ComingSoon module="Notas" phase="Fase 2" description="Tiptap richtext, privadas y compartidas." />
        </TabsContent>
        <TabsContent value="facturacion">
          <ComingSoon module="Facturación" phase="Fase 2" description="Generar factura desde tiempos + gastos aprobados." />
        </TabsContent>
        <TabsContent value="bitacora">
          <ComingSoon module="Bitácora" phase="Fase 3" description="Audit log completo de cambios sobre el caso." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
