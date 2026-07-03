import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CornerDownRight, MessageSquare, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WithTooltip } from "@/components/ui/icon-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
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
import { getCaseById, listCaseFees } from "@/lib/db/queries/cases";
import { listClients } from "@/lib/db/queries/clients";
import { listMatterTemplates } from "@/lib/db/queries/matter-templates";
import { listTimeEntriesForCase } from "@/lib/db/queries/time-entries";
import { listExpensesForCase, totalAmount } from "@/lib/db/queries/expenses";
import { listTasksForCase } from "@/lib/db/queries/tasks";
import { listEventsForCase } from "@/lib/db/queries/events";
import { listDocumentsForCase } from "@/lib/db/queries/documents";
import {
  getFolderBreadcrumb,
  listDocumentsInFolder,
  listFolderChildren,
} from "@/lib/db/queries/folders";
import { listNotesForCase } from "@/lib/db/queries/notes";
import { listHearingsForCase } from "@/lib/db/queries/hearing-reports";
import { listBillableForCase, listInvoices } from "@/lib/db/queries/invoices";
import { listNcfRanges } from "@/lib/db/queries/ncf-ranges";
import { listFirmUsers } from "@/lib/db/queries/users";
import { listAuditFor, ACTION_LABEL, ENTITY_LABEL } from "@/lib/db/queries/audit";
import type { NcfType } from "@/lib/invoicing/ncf";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/ai";
import { eliminarCasoAction } from "@/app/_actions/casos/eliminar";
import { aprobarTiempoAction } from "@/app/_actions/tiempos/aprobar";
import { aprobarGastoAction } from "@/app/_actions/gastos/aprobar";
import { PendingSubmitButton } from "@/components/ui/pending-submit";
import { DocumentUploadDrawer } from "./_components/document-upload-drawer";
import { CaseDocumentsSection } from "./_components/case-documents-section";
import { CaseFolderBrowser } from "./_components/case-folder-browser";
import { CaseDocumentsView } from "./_components/case-documents-view";
import { NewFolderDialog } from "@/app/(app)/documentos/_components/new-folder-dialog";
import { UploadFolderButton } from "@/app/(app)/documentos/_components/upload-folder-button";
import { NoteFormDrawer } from "./_components/note-form-drawer";
import { NoteCard } from "./_components/note-card";
import { GenerarFacturaDrawer } from "./_components/generar-factura-drawer";
import { num, formatMoney } from "@/lib/invoicing/calculate";
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
import { SubcaseCreateButton } from "./_components/subcase-create-button";
import { StartTimerButton } from "./_components/start-timer-button";
import { GastoFormDrawer } from "./_components/gasto-form-drawer";
import { AiSummaryDrawer } from "./_components/ai-summary-drawer";
import { MatterChatPanel } from "./_components/matter-chat-panel";
import { ConfidentialTierSwitch } from "./_components/confidential-tier-switch";
import { HearingReportsTab } from "./_components/hearing-reports-tab";
import { CasoEditDrawer } from "./_components/caso-edit-drawer";
import { HonorariosPanel } from "./_components/honorarios-panel";
import { EventoRowActions } from "./_components/evento-row-actions";
import { TareaRowActions } from "./_components/tarea-row-actions";
import { GastoRowActions } from "./_components/gasto-row-actions";
import { TiempoRowActions } from "./_components/tiempo-row-actions";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; folder?: string; docvista?: string; error?: string }>;
}) {
  const user = await requireUser();
  const aiEnabled = isAiEnabled();
  const { id } = await params;
  const sp = await searchParams;
  const detail = await getCaseById(user.firmId, user.userId, id);
  if (!detail) notFound();

  const { case: c, client, leadLawyer, assignments, parent, subcases } = detail;
  // Solo los casos raíz pueden tener subcasos (máx. 1 nivel).
  const canHaveSubcases = !c.parentCaseId;

  // Carpetas para el tab documentos. folderId del query string; null = raíz.
  const folderId = sp.folder ?? null;
  const folderScope = { kind: "case" as const, caseId: c.id };

  const [tiempos, gastos, tareas, eventos, documentos, notas, billables, casoInvoices, usuarios, ncfRanges, bitacoraCaso, honorarios, folderChildren, docsInFolder, folderBreadcrumb, audiencias, clientesRes, templates] = await Promise.all([
    listTimeEntriesForCase(user.firmId, user.userId, c.id),
    listExpensesForCase(user.firmId, user.userId, c.id),
    listTasksForCase(user.firmId, user.userId, c.id),
    listEventsForCase(user.firmId, user.userId, c.id),
    listDocumentsForCase(user.firmId, user.userId, c.id),
    listNotesForCase(user.firmId, user.userId, c.id),
    listBillableForCase(user.firmId, user.userId, c.id),
    listInvoices(user.firmId, user.userId, { limit: 100 }),
    listFirmUsers(user.firmId, user.userId),
    listNcfRanges(user.firmId, user.userId),
    listAuditFor(user.firmId, user.userId, { caseId: c.id, limit: 100 }),
    listCaseFees(user.firmId, user.userId, c.id),
    listFolderChildren(user.firmId, user.userId, folderId, folderScope),
    listDocumentsInFolder(user.firmId, user.userId, folderId, folderScope),
    folderId
      ? getFolderBreadcrumb(user.firmId, user.userId, folderId)
      : Promise.resolve([]),
    listHearingsForCase(user.firmId, user.userId, c.id),
    listClients(user.firmId, user.userId, { limit: 200 }),
    listMatterTemplates(user.firmId, user.userId),
  ]);
  const nowMs = Date.now();
  const availableNcfTypes: NcfType[] = ncfRanges
    .filter(
      (r) =>
        r.lastSeq < r.rangeEnd &&
        (!r.expiresOn || r.expiresOn.getTime() > nowMs),
    )
    .map((r) => r.ncfType);
  const facturasCaso = casoInvoices.rows.filter((r) => r.caseId === c.id);
  const isCorporate = client?.type === "corporate";

  const totalTimeSec = tiempos.reduce((s, t) => s + t.durationSeconds, 0);
  const totalGastos = totalAmount(gastos);
  const billableGastos = totalAmount(gastos.filter((g) => g.billable));
  const isApprover = user.role === "admin" || user.role === "partner";

  return (
    <div className="space-y-6">
      {sp.error === "subcasos" ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            No se puede archivar este caso porque tiene subcasos activos.
            Archiva primero los subcasos (tab &quot;Subcasos&quot;).
          </p>
        </div>
      ) : null}
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
              {parent ? (
                <Badge variant="secondary" className="gap-1">
                  <CornerDownRight className="h-3 w-3" />
                  Subcaso
                </Badge>
              ) : null}
              {c.visibility === "restricted" ? (
                <Badge variant="warning" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Restringido
                </Badge>
              ) : null}
              <ConfidentialTierSwitch
                caseId={c.id}
                currentTier={(c.confidentialTier ?? "normal") as "normal" | "confidential" | "ultra_confidential"}
                canEdit={user.role === "admin" || user.role === "partner"}
              />
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.title}</h1>
            <p className="text-sm text-muted-foreground">
              {client?.displayName ?? "—"} · {MATTER_LABEL[c.matterType]}
            </p>
            {parent ? (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <CornerDownRight className="h-3.5 w-3.5" />
                Subcaso de{" "}
                {parent.deletedAt ? (
                  <span>
                    <span className="font-mono">{parent.code}</span> — {parent.title}{" "}
                    <Badge variant="outline" className="ml-1 text-[10px]">archivado</Badge>
                  </span>
                ) : (
                  <Link href={`/casos/${parent.id}`} className="hover:underline">
                    <span className="font-mono">{parent.code}</span> — {parent.title}
                  </Link>
                )}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <StartTimerButton caseId={c.id} caseTitle={c.title} />
            <MatterChatPanel
              caseId={c.id}
              caseCode={c.code}
              caseTitle={c.title}
              aiEnabled={aiEnabled}
              initialStats={{
                docCount: documentos.length,
                eventCount: eventos.length,
                noteCount: notas.length,
                timeEntryCount: tiempos.length,
              }}
              trigger={
                <WithTooltip label="Chatear con la IA sobre este caso · atajo Cmd/Ctrl+J">
                  <Button variant="outline" size="sm">
                    <MessageSquare className="h-4 w-4" />
                    Asistente IA
                  </Button>
                </WithTooltip>
              }
            />
            {aiEnabled ? (
              <AiSummaryDrawer
                caseId={c.id}
                trigger={
                  <Button variant="outline" size="sm">
                    <Sparkles className="h-4 w-4" />
                    Resumen IA
                  </Button>
                }
              />
            ) : null}
            <Badge variant="outline">{CASE_STATUS_LABEL[c.status]}</Badge>
            <CasoEditDrawer
              caseData={{
                id: c.id,
                title: c.title,
                description: c.description,
                status: c.status,
                matterType: c.matterType,
                court: c.court,
                counterpartyName: c.counterpartyName,
                counterpartyTaxId: c.counterpartyTaxId,
                tags: c.tags,
                visibility: c.visibility,
                billingMode: c.billingMode,
                leadLawyerId: c.leadLawyerId,
              }}
              users={usuarios.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
              assignedUserIds={assignments.map((a) => a.userId)}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              }
            />
            <ConfirmButton
              action={eliminarCasoAction}
              title="¿Archivar este caso?"
              description={`"${c.title}" — queda archivado. Lo puedes restaurar desde /casos/archivados.`}
              confirmLabel="Archivar"
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Archivar
                </Button>
              }
            >
              <input type="hidden" name="caseId" value={c.id} />
            </ConfirmButton>
          </div>
        </div>
      </div>

      <Tabs defaultValue={sp.tab ?? "resumen"}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          {canHaveSubcases ? (
            <TabsTrigger value="subcasos">Subcasos ({subcases.length})</TabsTrigger>
          ) : null}
          <TabsTrigger value="tiempos">Tiempos ({tiempos.length})</TabsTrigger>
          <TabsTrigger value="gastos">Gastos ({gastos.length})</TabsTrigger>
          <TabsTrigger value="tareas">Tareas ({tareas.length})</TabsTrigger>
          <TabsTrigger value="eventos">Eventos ({eventos.length})</TabsTrigger>
          <TabsTrigger value="audiencias">Audiencias ({audiencias.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos ({documentos.length})</TabsTrigger>
          <TabsTrigger value="notas">Gestiones ({notas.length})</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación ({facturasCaso.length})</TabsTrigger>
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
                <Row label="Honorarios">
                  <HonorariosPanel
                    caseId={c.id}
                    canEdit={isApprover}
                    fees={honorarios.map((h) => ({
                      id: h.id,
                      feeType: h.feeType,
                      description: h.description,
                      amountUsd: h.amountUsd,
                      amountDop: h.amountDop,
                    }))}
                  />
                </Row>
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
                  <CardTitle>Gastos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
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
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle>Equipo y acceso</CardTitle>
                  {c.visibility === "restricted" ? (
                    <Badge variant="warning" className="gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Restringido
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Toda la firma</Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {c.visibility === "restricted"
                      ? "Solo los usuarios listados abajo (y los admins) pueden ver este caso."
                      : "Este caso es visible para toda la firma. Los usuarios listados son el equipo asignado."}
                  </p>
                  {assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {c.visibility === "restricted"
                        ? "Sin usuarios con acceso — solo los admins lo ven. Editá el caso para dar acceso."
                        : "Sin asignaciones específicas todavía."}
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

        {/* ----- Subcasos ----- */}
        {canHaveSubcases ? (
          <TabsContent value="subcasos" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {subcases.length} {subcases.length === 1 ? "subcaso" : "subcasos"} ·
                expedientes que cuelgan de este caso
              </p>
              <SubcaseCreateButton
                clientes={clientesRes.rows.map((cl) => ({ id: cl.id, displayName: cl.displayName }))}
                users={usuarios.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
                templates={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  matterType: t.matterType,
                  defaultTasks: t.defaultTasks ?? [],
                  defaultEvents: t.defaultEvents ?? [],
                }))}
                parentCase={{
                  id: c.id,
                  code: c.code,
                  title: c.title,
                  clientId: c.clientId,
                  matterType: c.matterType,
                  visibility: c.visibility,
                  assignments: assignments.map((a) => ({
                    userId: a.userId,
                    roleInCase: a.roleInCase,
                  })),
                }}
              />
            </div>
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Código</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Materia</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden md:table-cell">Apertura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subcases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        Sin subcasos. Crea el primero con &quot;Nuevo subcaso&quot; —
                        útil para separar demandas, recursos o incidencias dentro
                        de este expediente.
                      </TableCell>
                    </TableRow>
                  ) : (
                    subcases.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">
                          <Link href={`/casos/${s.id}`} className="hover:underline">
                            {s.code}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          <Link href={`/casos/${s.id}`} className="font-medium hover:underline">
                            {s.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{MATTER_LABEL[s.matterType]}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{CASE_STATUS_LABEL[s.status]}</Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                          {formatInFirmTz(s.openedAt, undefined, "dd/MM/yyyy")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        ) : null}

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
                  <TableHead className="w-32 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiempos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isApprover ? 8 : 7}
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
                              <PendingSubmitButton variant="ghost" size="sm">
                                Aprobar
                              </PendingSubmitButton>
                            </form>
                          ) : null}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right">
                        <TiempoRowActions
                          entry={{
                            id: t.id,
                            description: t.description,
                            startedAt: t.startedAt,
                            endedAt: t.endedAt,
                            durationSeconds: t.durationSeconds,
                            billable: t.billable,
                            userName: t.userName,
                            status: t.status,
                          }}
                          caseId={c.id}
                        />
                      </TableCell>
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
                  <TableHead className="w-32 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastos.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={isApprover ? 8 : 7}
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
                              <PendingSubmitButton variant="ghost" size="sm">
                                Aprobar
                              </PendingSubmitButton>
                            </form>
                          ) : null}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right">
                        <GastoRowActions
                          expense={{
                            id: g.id,
                            description: g.description,
                            amount: g.amount,
                            currency: g.currency,
                            incurredOn: g.incurredOn,
                            billable: g.billable,
                            receiptUrl: g.receiptUrl,
                          }}
                          caseId={c.id}
                          status={g.status}
                          userName={g.userName}
                        />
                      </TableCell>
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
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tareas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
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
                      <TableCell className="text-right">
                        <TareaRowActions
                          task={{
                            id: t.id,
                            title: t.title,
                            description: t.description,
                            caseId: t.caseId,
                            assigneeId: t.assigneeId,
                            dueAt: t.dueAt,
                            priority: t.priority,
                            status: t.status,
                          }}
                          casos={[{ id: c.id, code: c.code, title: c.title }]}
                          users={usuarios.map((u) => ({ id: u.id, name: u.name }))}
                        />
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
                  <TableHead className="w-32 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Sin eventos en este caso.
                    </TableCell>
                  </TableRow>
                ) : (
                  eventos.map((e) => {
                    const attendeeNames = e.attendees
                      .map((id) => usuarios.find((u) => u.id === id)?.name)
                      .filter((n): n is string => !!n);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm font-medium">{e.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatInFirmTz(e.startAt, undefined, "dd/MM HH:mm")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatInFirmTz(e.endAt, undefined, "dd/MM HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">{e.location ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <EventoRowActions
                            event={{
                              id: e.id,
                              title: e.title,
                              description: e.description,
                              location: e.location,
                              caseId: e.caseId,
                              startAt: e.startAt,
                              endAt: e.endAt,
                              allDay: e.allDay,
                              attendees: e.attendees,
                              reminderMinutes: e.reminderMinutes,
                              eventType: e.eventType,
                            }}
                            caseId={c.id}
                            casos={[{ id: c.id, code: c.code, title: c.title }]}
                            users={usuarios.map((u) => ({ id: u.id, name: u.name }))}
                            attendeeNames={attendeeNames}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="audiencias" className="space-y-3">
          <HearingReportsTab
            caseId={c.id}
            caseCode={c.code}
            caseTitle={c.title}
            currentUserId={user.userId}
            hearings={audiencias}
            usuarios={usuarios.map((u) => ({ id: u.id, name: u.name }))}
          />
        </TabsContent>

        <TabsContent value="documentos" className="space-y-4">
          {(() => {
            // Sub-navegador: "Documentos del caso" (equipo) vs "Mi carpeta"
            // (mis privados). Se controla por ?docvista para mantener el
            // estado en la URL, igual que las tabs del caso.
            const docVista = sp.docvista === "mia" ? "mia" : "caso";
            // La query del caso ya trae docs de equipo + MIS privados juntos;
            // los separamos por visibilidad para cada vista.
            const misPrivados = documentos.filter((d) => d.visibility === "private");
            // La vista por carpetas solo muestra docs de equipo (los privados
            // viven en "Mi carpeta").
            const docsCasoEnCarpeta = docsInFolder.filter(
              (d) => d.visibility === "case",
            );

            const baseHref = `/casos/${c.id}?tab=documentos`;
            return (
              <>
                {/* Sub-navegador Documentos del caso / Mi carpeta */}
                <div className="inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
                  <Link
                    href={baseHref}
                    className={
                      docVista === "caso"
                        ? "rounded-md bg-background px-3 py-1.5 font-medium shadow-sm"
                        : "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
                    }
                  >
                    Documentos del caso
                  </Link>
                  <Link
                    href={`${baseHref}&docvista=mia`}
                    className={
                      docVista === "mia"
                        ? "rounded-md bg-background px-3 py-1.5 font-medium shadow-sm"
                        : "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
                    }
                  >
                    Mi carpeta ({misPrivados.length})
                  </Link>
                </div>

                {docVista === "caso" ? (
                  <CaseDocumentsView
                    teamDocs={documentos.filter((d) => d.visibility === "case")}
                    caseId={c.id}
                    aiEnabled={aiEnabled}
                    currentUserId={user.userId}
                    actions={
                      <>
                        <DocumentUploadDrawer
                          caseId={c.id}
                          folderId={folderId}
                          trigger={
                            <Button variant="outline" size="sm">
                              <Plus className="h-3.5 w-3.5" />
                              Subir archivo
                            </Button>
                          }
                        />
                        <NewFolderDialog parentFolderId={folderId} scope={folderScope} />
                        <UploadFolderButton parentFolderId={folderId} scope={folderScope} />
                      </>
                    }
                    folderView={
                      <CaseFolderBrowser
                        caseId={c.id}
                        folderId={folderId}
                        breadcrumb={folderBreadcrumb.map((b) => ({ id: b.id, name: b.name }))}
                        folders={folderChildren.map((f) => ({ id: f.id, name: f.name }))}
                        documents={docsCasoEnCarpeta.map((d) => ({
                          id: d.id,
                          name: d.name,
                          mimeType: d.mimeType,
                          sizeBytes: d.sizeBytes,
                          tags: d.tags,
                          ocrStatus: d.ocrStatus,
                          version: d.version,
                          sharedWithClient: d.sharedWithClient,
                          visibility: d.visibility,
                          uploadedById: d.uploadedById,
                          createdAt: d.createdAt,
                          caseId: d.caseId,
                          clientId: d.clientId,
                        }))}
                        aiEnabled={aiEnabled}
                        currentUserId={user.userId}
                      />
                    }
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        Tu espacio privado en este caso — solo vos ves estos
                        documentos. Movés cualquiera al equipo desde el menú «⋮».
                      </p>
                      <DocumentUploadDrawer
                        caseId={c.id}
                        folderId={null}
                        defaultVisibility="private"
                        lockVisibility
                        trigger={
                          <Button variant="outline" size="sm">
                            <Plus className="h-3.5 w-3.5" />
                            Subir a mi carpeta
                          </Button>
                        }
                      />
                    </div>
                    <CaseDocumentsSection
                      docs={misPrivados}
                      caseId={c.id}
                      aiEnabled={aiEnabled}
                      currentUserId={user.userId}
                    />
                  </div>
                )}
              </>
            );
          })()}
        </TabsContent>
        <TabsContent value="notas" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {notas.length} {notas.length === 1 ? "gestión" : "gestiones"}
            </p>
            <NoteFormDrawer
              caseId={c.id}
              aiEnabled={aiEnabled}
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  Nueva gestión
                </Button>
              }
            />
          </div>
          {notas.length === 0 ? (
            <Card className="py-10 text-center text-sm text-muted-foreground">
              Sin gestiones. Crea la primera arriba.
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {notas.map((n) => (
                <NoteCard key={n.id} note={n} caseId={c.id} aiEnabled={aiEnabled} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="facturacion" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {facturasCaso.length} {facturasCaso.length === 1 ? "factura" : "facturas"} ·{" "}
              {billables.timeEntries.length + billables.expenses.length} concepto(s) por facturar
            </p>
            {isApprover && client ? (
              <GenerarFacturaDrawer
                caseId={c.id}
                clientId={client.id}
                isCorporate={isCorporate}
                billables={billables}
                availableNcfTypes={availableNcfTypes}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus className="h-3.5 w-3.5" />
                    Generar factura
                  </Button>
                }
              />
            ) : null}
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Número</TableHead>
                  <TableHead>Emitida</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturasCaso.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Sin facturas aún. Genera una desde el botón de arriba.
                    </TableCell>
                  </TableRow>
                ) : (
                  facturasCaso.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/facturacion/${f.id}`} className="hover:underline">
                          {f.number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatInFirmTz(f.issuedOn, undefined, "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatInFirmTz(f.dueOn, undefined, "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{f.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoney(num(f.total), f.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoney(num(f.balance), f.currency)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="bitacora" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {bitacoraCaso.length} {bitacoraCaso.length === 1 ? "evento" : "eventos"} registrado{bitacoraCaso.length === 1 ? "" : "s"} sobre este caso.
          </p>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {bitacoraCaso.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Sin actividad registrada todavía.
                </li>
              ) : (
                bitacoraCaso.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 p-3 text-sm">
                    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium uppercase">
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
                      {formatInFirmTz(e.createdAt, undefined, "dd/MM/yyyy HH:mm")}
                    </Badge>
                  </li>
                ))
              )}
            </ul>
          </Card>
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
