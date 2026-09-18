"use client";

// Botones de acciones por fila del tab "Eventos" en /casos/[id].
// Renderiza:
//   - Título clickeable que abre drawer de detalle (read-only).
//   - Editar (drawer con form), Eliminar (ConfirmButton).
//   - Para audiencias: sección de reporte en el drawer de detalle
//     con acciones de crear/editar/ver/enviar reporte.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Trash2,
  FileText,
  Send,
  Loader2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { IconButton } from "@/components/ui/icon-button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { eliminarEventoAction } from "@/app/_actions/eventos/eliminar";
import {
  guardarReporteAudienciaAction,
  enviarReporteAudienciaAction,
  eliminarReporteAudienciaAction,
} from "@/app/_actions/audiencias";
import { formatInFirmTz } from "@/lib/datetime/format";
import {
  EventoEditDrawer,
  type EditableEvent,
} from "@/app/(app)/calendario/_components/evento-edit-drawer";
import { RichTextEditor, type TiptapDoc } from "@/components/editor/rich-text-editor";

const EVENT_TYPE_LABEL: Record<string, string> = {
  audiencia: "Audiencia",
  plazo_procesal: "Plazo procesal",
  reunion_cliente: "Reunión con cliente",
  reunion_interna: "Reunión interna",
  vencimiento_administrativo: "Vencimiento administrativo",
  recordatorio: "Recordatorio",
};

export type EventReportData = {
  reportId: string | null;
  reportTitle: string | null;
  lastSentAt: Date | null;
  lastSentToCount: number;
};

const EMPTY_DOC: TiptapDoc = { type: "doc", content: [{ type: "paragraph" }] };

export function EventoRowActions({
  event,
  caseId,
  casos,
  users,
  attendeeNames,
  reportData,
}: {
  event: EditableEvent;
  caseId: string;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
  attendeeNames: string[];
  /** Datos del reporte de audiencia (solo se pasa cuando eventType=audiencia). */
  reportData?: EventReportData;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isAudiencia = event.eventType === "audiencia";

  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        className="h-8 w-8"
        label="Editar evento"
        onClick={() => setEditOpen(true)}
      >
        <Pencil className="h-4 w-4" />
      </IconButton>
      <ConfirmButton
        action={eliminarEventoAction}
        title="¿Eliminar este evento?"
        description={`"${event.title}" — se archiva y desaparece del calendario. Si está sincronizado con Outlook, también se borra ahí.`}
        confirmLabel="Eliminar"
        trigger={
          <IconButton className="h-8 w-8 text-destructive" label="Eliminar evento (archivar)">
            <Trash2 className="h-4 w-4" />
          </IconButton>
        }
      >
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="caseId" value={caseId} />
      </ConfirmButton>

      {/* Drawer de detalle del evento — se abre al clickear el título (via parent) */}
      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent className={isAudiencia ? "sm:max-w-2xl" : undefined}>
          <SheetHeader>
            <SheetTitle>{event.title}</SheetTitle>
            <SheetDescription>
              Detalle del evento{isAudiencia ? " · Audiencia" : ""}.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3 text-sm">
            <DetailRow label="Tipo">
              {event.eventType ? (
                <Badge variant="outline">{EVENT_TYPE_LABEL[event.eventType] ?? event.eventType}</Badge>
              ) : (
                <span className="text-muted-foreground">Sin tipo</span>
              )}
            </DetailRow>
            <DetailRow label="Inicio">
              {formatInFirmTz(event.startAt, undefined, "EEEE dd 'de' MMMM yyyy, HH:mm")}
            </DetailRow>
            <DetailRow label="Fin">
              {formatInFirmTz(event.endAt, undefined, "EEEE dd 'de' MMMM yyyy, HH:mm")}
            </DetailRow>
            <DetailRow label="Todo el día">
              {event.allDay ? "Sí" : "No"}
            </DetailRow>
            <DetailRow label="Lugar">
              {event.location || <span className="text-muted-foreground">—</span>}
            </DetailRow>
            <DetailRow label="Asistentes">
              {attendeeNames.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {attendeeNames.map((n) => (
                    <Badge key={n} variant="secondary">
                      {n}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">Sin asistentes</span>
              )}
            </DetailRow>
            <DetailRow label="Recordatorio">
              {event.reminderMinutes != null
                ? `${event.reminderMinutes} minutos antes`
                : <span className="text-muted-foreground">—</span>}
            </DetailRow>
            {event.description ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Descripción
                </p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {event.description}
                </p>
              </div>
            ) : null}

            {/* Sección de Reporte para audiencias */}
            {isAudiencia && reportData ? (
              <>
                <Separator />
                <ReportSection
                  eventId={event.id}
                  eventTitle={event.title}
                  caseId={caseId}
                  reportData={reportData}
                  usuarios={users}
                  onClose={() => setViewOpen(false)}
                />
              </>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                setViewOpen(false);
                setEditOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <EventoEditDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        event={event}
        casos={casos}
        users={users}
      />
    </div>
  );
}

/** Expone el open setter para que el parent (título clickeable) pueda abrir el drawer. */
export function EventoRowWithTitle({
  event,
  caseId,
  casos,
  users,
  attendeeNames,
  reportData,
}: {
  event: EditableEvent;
  caseId: string;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
  attendeeNames: string[];
  reportData?: EventReportData;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isAudiencia = event.eventType === "audiencia";

  return (
    <>
      {/* Título clickeable */}
      <button
        type="button"
        className="text-left font-medium hover:underline hover:text-primary transition-colors"
        onClick={() => setViewOpen(true)}
      >
        {event.title}
      </button>

      {/* Drawer de detalle */}
      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent className={isAudiencia ? "sm:max-w-2xl" : undefined}>
          <SheetHeader>
            <SheetTitle>{event.title}</SheetTitle>
            <SheetDescription>
              Detalle del evento{isAudiencia ? " · Audiencia" : ""}.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3 text-sm">
            <DetailRow label="Tipo">
              {event.eventType ? (
                <Badge variant="outline">{EVENT_TYPE_LABEL[event.eventType] ?? event.eventType}</Badge>
              ) : (
                <span className="text-muted-foreground">Sin tipo</span>
              )}
            </DetailRow>
            <DetailRow label="Inicio">
              {formatInFirmTz(event.startAt, undefined, "EEEE dd 'de' MMMM yyyy, HH:mm")}
            </DetailRow>
            <DetailRow label="Fin">
              {formatInFirmTz(event.endAt, undefined, "EEEE dd 'de' MMMM yyyy, HH:mm")}
            </DetailRow>
            <DetailRow label="Todo el día">
              {event.allDay ? "Sí" : "No"}
            </DetailRow>
            <DetailRow label="Lugar">
              {event.location || <span className="text-muted-foreground">—</span>}
            </DetailRow>
            <DetailRow label="Asistentes">
              {attendeeNames.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {attendeeNames.map((n) => (
                    <Badge key={n} variant="secondary">
                      {n}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">Sin asistentes</span>
              )}
            </DetailRow>
            <DetailRow label="Recordatorio">
              {event.reminderMinutes != null
                ? `${event.reminderMinutes} minutos antes`
                : <span className="text-muted-foreground">—</span>}
            </DetailRow>
            {event.description ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Descripción
                </p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {event.description}
                </p>
              </div>
            ) : null}

            {/* Sección de Reporte para audiencias */}
            {isAudiencia && reportData ? (
              <>
                <Separator />
                <ReportSection
                  eventId={event.id}
                  eventTitle={event.title}
                  caseId={caseId}
                  reportData={reportData}
                  usuarios={users}
                  onClose={() => setViewOpen(false)}
                />
              </>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                setViewOpen(false);
                setEditOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <EventoEditDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        event={event}
        casos={casos}
        users={users}
      />
    </>
  );
}

// ─── Sección de Reporte (incrustada en el drawer de detalle) ─────────────────

function ReportSection({
  eventId,
  eventTitle,
  caseId,
  reportData,
  usuarios,
  onClose,
}: {
  eventId: string;
  eventTitle: string;
  caseId: string;
  reportData: EventReportData;
  usuarios: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(
    reportData.reportTitle ?? `Reporte — ${eventTitle}`,
  );
  const [content, setContent] = useState<TiptapDoc>(EMPTY_DOC);
  const [loadingContent, setLoadingContent] = useState(!!reportData.reportId);

  // Cargar contenido del reporte si ya existe.
  useEffect(() => {
    if (!reportData.reportId) {
      setLoadingContent(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/audiencias/reportes/${reportData.reportId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.contentJson) setContent(data.contentJson);
        if (data?.title) setTitle(data.title);
        setLoadingContent(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportData.reportId]);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [saving, startSaving] = useTransition();
  const [sending, startSending] = useTransition();

  function toggle(id: string) {
    setRecipients((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save(): Promise<string | null> {
    return new Promise((resolve) => {
      startSaving(async () => {
        const r = await guardarReporteAudienciaAction({
          caseId,
          eventId,
          title: title.trim() || `Reporte — ${eventTitle}`,
          contentJson: content,
        });
        if (r.ok) {
          toast.success("Reporte guardado");
          router.refresh();
          resolve(r.reportId);
        } else {
          toast.error("No se pudo guardar", { description: r.error });
          resolve(null);
        }
      });
    });
  }

  async function saveAndSend() {
    if (recipients.length === 0) {
      toast.error("Elegí al menos un destinatario antes de enviar.");
      return;
    }
    startSending(async () => {
      const reportId = await save();
      if (!reportId) return;
      const r = await enviarReporteAudienciaAction({
        reportId,
        caseId,
        recipientUserIds: recipients,
      });
      if (r.ok) {
        toast.success(`Reporte enviado a ${r.sentTo} ${r.sentTo === 1 ? "persona" : "personas"}`, {
          description:
            r.via === "m365"
              ? "Vía Microsoft 365"
              : r.via === "fallback"
                ? "Vía proveedor genérico"
                : "Vía mixta (M365 + fallback)",
        });
        router.refresh();
        onClose();
      } else {
        toast.error("No se pudo enviar", { description: r.error });
      }
    });
  }

  const pending = saving || sending;

  // Sin reporte y sin modo edición → botón para crear
  if (!reportData.reportId && !editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Reporte de audiencia
          </p>
          <Badge variant="secondary" className="text-[10px]">Sin reporte</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <FileText className="h-3.5 w-3.5" />
          Crear reporte
        </Button>
      </div>
    );
  }

  // Con reporte pero sin modo edición → vista resumida
  if (reportData.reportId && !editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Reporte de audiencia
          </p>
          <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50">
            Tiene reporte
          </Badge>
        </div>
        <p className="text-sm font-medium">{title}</p>
        {loadingContent ? (
          <div className="flex h-20 items-center justify-center rounded-md border bg-muted/30">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="prose prose-sm max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-3">
            <RichTextEditor
              initialContent={content}
              placeholder=""
              className="min-h-0"
              editable={false}
            />
          </div>
        )}
        {reportData.lastSentAt ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Mail className="mr-1 inline h-3 w-3" />
            Último envío:{" "}
            {formatInFirmTz(reportData.lastSentAt, undefined, "dd/MM/yyyy HH:mm")} a{" "}
            {reportData.lastSentToCount}{" "}
            {reportData.lastSentToCount === 1 ? "persona" : "personas"}.
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar reporte
          </Button>
          <ConfirmButton
            action={eliminarReporteAudienciaAction}
            title="¿Eliminar este reporte?"
            description="El reporte queda archivado (reversible). El evento sigue existiendo."
            confirmLabel="Eliminar"
            trigger={
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar reporte
              </Button>
            }
          >
            <input type="hidden" name="reportId" value={reportData.reportId} />
            <input type="hidden" name="caseId" value={caseId} />
          </ConfirmButton>
        </div>
      </div>
    );
  }

  // Modo edición → editor completo inline
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {reportData.reportId ? "Editar reporte" : "Nuevo reporte"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="report-title-inline">Título del reporte</Label>
        <Input
          id="report-title-inline"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          placeholder="Ej. Reporte de audiencia preliminar"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Contenido</Label>
        {loadingContent ? (
          <div className="flex h-[200px] items-center justify-center rounded-md border border-input bg-background">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <RichTextEditor
            initialContent={content}
            onChange={setContent}
            placeholder="Escribí el reporte de la audiencia..."
            className="min-h-[200px]"
            editable={true}
          />
        )}
        <p className="text-[11px] text-muted-foreground">
          Soporta negritas, listas, citas, encabezados.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Destinatarios del email</Label>
          <div className="flex gap-1 text-[11px]">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setRecipients(usuarios.map((u) => u.id))}
            >
              Todos
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => setRecipients([])}
            >
              Ninguno
            </button>
          </div>
        </div>
        <div className="grid max-h-36 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {usuarios.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={recipients.includes(u.id)}
                onCheckedChange={() => toggle(u.id)}
              />
              {u.name}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {recipients.length === 0
            ? "Ninguno seleccionado — podés guardar sin enviar."
            : `${recipients.length} destinatario(s) seleccionado(s).`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void save()}
          disabled={pending || loadingContent}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
        <Button
          size="sm"
          onClick={() => void saveAndSend()}
          disabled={pending || loadingContent}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Guardar y enviar
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3 border-b pb-2 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export { EVENT_TYPE_LABEL };
