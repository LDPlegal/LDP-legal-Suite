"use client";

// Tab "Audiencias" dentro de /casos/[id].
//
// Lista los eventos del caso marcados como event_type='audiencia'. Cada
// audiencia tiene UN reporte asociado (1:1 vía event_id UNIQUE). Click en
// la fila → abre un drawer con:
//   - Editor de texto rico (tiptap, StarterKit) para escribir el reporte.
//   - Multi-select de usuarios del firm para elegir destinatarios.
//   - Botones "Guardar" y "Guardar y enviar".
//
// El envío usa M365 Graph del firm si está conectado, si no Resend / fallback.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, MapPin, Mail, Pencil, Send, Loader2, FileText, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RichTextEditor, type TiptapDoc } from "@/components/editor/rich-text-editor";
import { EventoFormDrawer } from "@/app/(app)/calendario/_components/evento-form-drawer";
import {
  EventoEditDrawer,
  type EditableEvent,
} from "@/app/(app)/calendario/_components/evento-edit-drawer";
import { Plus } from "lucide-react";
import { formatInFirmTz } from "@/lib/datetime/format";
import {
  guardarReporteAudienciaAction,
  enviarReporteAudienciaAction,
  eliminarReporteAudienciaAction,
} from "@/app/_actions/audiencias";
import { eliminarEventoAction } from "@/app/_actions/eventos/eliminar";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { IconButton } from "@/components/ui/icon-button";
import type { HearingListRow } from "@/lib/db/queries/hearing-reports";

const EMPTY_DOC: TiptapDoc = { type: "doc", content: [{ type: "paragraph" }] };

export function HearingReportsTab({
  caseId,
  caseCode,
  caseTitle,
  currentUserId,
  hearings,
  usuarios,
}: {
  caseId: string;
  caseCode: string;
  caseTitle: string;
  currentUserId: string;
  hearings: HearingListRow[];
  usuarios: Array<{ id: string; name: string }>;
}) {
  // Estado del drawer abierto: cuál audiencia se está editando/viendo.
  const [openFor, setOpenFor] = useState<{ h: HearingListRow; mode: "view" | "edit" } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {hearings.length === 0
            ? "Sin audiencias todavía. Creá un evento marcando «Audiencia» como tipo."
            : `${hearings.length} ${hearings.length === 1 ? "audiencia" : "audiencias"}`}
        </p>
        <EventoFormDrawer
          casos={[{ id: caseId, code: caseCode, title: caseTitle }]}
          users={usuarios}
          currentUserId={currentUserId}
          defaultCaseId={caseId}
          defaultEventType="audiencia"
          redirectTo={`/casos/${caseId}?tab=audiencias`}
          trigger={
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Nueva audiencia
            </Button>
          }
        />
      </div>

      {hearings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Marcá un evento como «Audiencia» al crearlo para que aparezca acá y puedas escribir un reporte.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {hearings.map((h) => (
            <HearingCard
              key={h.eventId}
              h={h}
              caseId={caseId}
              caseCode={caseCode}
              caseTitle={caseTitle}
              usuarios={usuarios}
              onView={() => setOpenFor({ h, mode: "view" })}
              onEdit={() => setOpenFor({ h, mode: "edit" })}
            />
          ))}
        </div>
      )}

      {openFor ? (
        <ReportDrawer
          hearing={openFor.h}
          mode={openFor.mode}
          caseId={caseId}
          usuarios={usuarios}
          onClose={() => setOpenFor(null)}
        />
      ) : null}
    </div>
  );
}

function HearingCard({
  h,
  caseId,
  caseCode,
  caseTitle,
  usuarios,
  onView,
  onEdit,
}: {
  h: HearingListRow;
  caseId: string;
  caseCode: string;
  caseTitle: string;
  usuarios: Array<{ id: string; name: string }>;
  onView: () => void;
  onEdit: () => void;
}) {
  const [editEventOpen, setEditEventOpen] = useState(false);

  const editableEvent: EditableEvent = {
    id: h.eventId,
    title: h.eventTitle,
    description: h.eventDescription,
    location: h.eventLocation,
    caseId: h.eventCaseId,
    startAt: h.eventStartAt,
    endAt: h.eventEndAt,
    allDay: h.eventAllDay,
    attendees: h.eventAttendees,
    reminderMinutes: h.eventReminderMinutes,
    eventType: h.eventType,
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold">{h.eventTitle}</h3>
            {h.reportId ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                Reporte
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                Sin reporte
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatInFirmTz(h.eventStartAt, undefined, "EEEE dd 'de' MMMM, HH:mm")}
            </span>
            {h.eventLocation ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {h.eventLocation}
              </span>
            ) : null}
            {h.lastSentAt ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Enviado {formatInFirmTz(h.lastSentAt, undefined, "dd/MM HH:mm")} a{" "}
                {h.lastSentToCount} {h.lastSentToCount === 1 ? "persona" : "personas"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {/* ── Acciones del evento (audiencia) ── */}
          <IconButton
            className="h-8 w-8"
            label="Editar audiencia"
            onClick={() => setEditEventOpen(true)}
          >
            <Pencil className="h-4 w-4" />
          </IconButton>
          <ConfirmButton
            action={eliminarEventoAction}
            title="¿Eliminar esta audiencia?"
            description={`"${h.eventTitle}" — se archiva y desaparece del calendario. Si tiene reporte asociado, también se dejará de mostrar.`}
            confirmLabel="Eliminar"
            trigger={
              <IconButton
                className="h-8 w-8 text-destructive"
                label="Eliminar audiencia (archivar)"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            }
          >
            <input type="hidden" name="eventId" value={h.eventId} />
            <input type="hidden" name="caseId" value={caseId} />
          </ConfirmButton>

          {/* ── Separador visual ── */}
          <div className="mx-1 h-5 w-px bg-border" />

          {/* ── Acciones del reporte ── */}
          {h.reportId ? (
            <>
              <IconButton
                className="h-8 w-8"
                label="Ver reporte (solo lectura)"
                onClick={onView}
              >
                <Eye className="h-4 w-4" />
              </IconButton>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <FileText className="h-3.5 w-3.5" />
                Editar reporte
              </Button>
              <ConfirmButton
                action={eliminarReporteAudienciaAction}
                title="¿Eliminar este reporte de audiencia?"
                description="El reporte queda archivado (reversible). La audiencia sigue existiendo como evento del caso."
                confirmLabel="Eliminar"
                trigger={
                  <IconButton
                    className="h-8 w-8 text-destructive"
                    label="Eliminar reporte (archivar)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                }
              >
                <input type="hidden" name="reportId" value={h.reportId} />
                <input type="hidden" name="caseId" value={caseId} />
              </ConfirmButton>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <FileText className="h-3.5 w-3.5" />
              Crear reporte
            </Button>
          )}
        </div>
      </div>

      {/* Drawer de edición del evento audiencia (controlled) */}
      <EventoEditDrawer
        open={editEventOpen}
        onOpenChange={setEditEventOpen}
        event={editableEvent}
        casos={[{ id: caseId, code: caseCode, title: caseTitle }]}
        users={usuarios}
      />
    </Card>
  );
}

function ReportDrawer({
  hearing,
  mode,
  caseId,
  usuarios,
  onClose,
}: {
  hearing: HearingListRow;
  mode: "view" | "edit";
  caseId: string;
  usuarios: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const readOnly = mode === "view";
  const router = useRouter();
  const [title, setTitle] = useState(
    hearing.reportTitle ?? `Reporte de audiencia — ${hearing.eventTitle}`,
  );
  const [content, setContent] = useState<TiptapDoc>(EMPTY_DOC);
  const [loadingContent, setLoadingContent] = useState(!!hearing.reportId);

  // Si ya existe reporte, bajamos el contentJson una sola vez al montar.
  useEffect(() => {
    if (!hearing.reportId) return;
    let cancelled = false;
    fetch(`/api/audiencias/reportes/${hearing.reportId}`)
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
  }, [hearing.reportId]);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [saving, startSaving] = useTransition();
  const [sending, startSending] = useTransition();

  function toggle(id: string) {
    setRecipients((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAll() {
    setRecipients(usuarios.map((u) => u.id));
  }
  function clearAll() {
    setRecipients([]);
  }

  async function save(): Promise<string | null> {
    return new Promise((resolve) => {
      startSaving(async () => {
        const r = await guardarReporteAudienciaAction({
          caseId,
          eventId: hearing.eventId,
          title: title.trim() || `Reporte de audiencia — ${hearing.eventTitle}`,
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

  return (
    <Sheet
      open={true}
      onOpenChange={(v) => {
        // Bloquear cierre durante save/send para evitar:
        //  - emails parciales (el user cree que falló y reintenta → manda 2x)
        //  - drawer cerrado con datos en limbo
        if (pending && !v) return;
        if (!v) onClose();
      }}
    >
      <SheetContent
        className="sm:max-w-2xl"
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>
            {readOnly ? "Reporte de audiencia" : hearing.reportId ? "Editar reporte" : "Nuevo reporte"}
          </SheetTitle>
          <SheetDescription>
            {hearing.eventTitle} ·{" "}
            {formatInFirmTz(hearing.eventStartAt, undefined, "dd/MM/yyyy HH:mm")}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hearing-report-title">Título</Label>
            {readOnly ? (
              <p className="text-sm font-medium">{title}</p>
            ) : (
              <Input
                id="hearing-report-title"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                placeholder="Ej. Reporte de audiencia preliminar"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Contenido</Label>
            {loadingContent ? (
              <div className="flex h-[260px] items-center justify-center rounded-md border border-input bg-background">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <RichTextEditor
                initialContent={content}
                onChange={readOnly ? undefined : setContent}
                placeholder="Escribí el reporte de la audiencia..."
                className="min-h-[260px]"
                editable={!readOnly}
              />
            )}
            {!readOnly ? (
              <p className="text-[11px] text-muted-foreground">
                Soporta negritas, listas, citas, encabezados. Lo que escribas se
                renderiza tal cual en el correo a los destinatarios.
              </p>
            ) : null}
          </div>

          {!readOnly ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Destinatarios del email</Label>
                <div className="flex gap-1 text-[11px]">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={selectAll}
                  >
                    Todos
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground hover:underline"
                    onClick={clearAll}
                  >
                    Ninguno
                  </button>
                </div>
              </div>
              <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
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
                  : `${recipients.length} ${recipients.length === 1 ? "destinatario" : "destinatarios"} seleccionado(s).`}
              </p>
            </div>
          ) : null}

          {readOnly && hearing.lastSentAt ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Mail className="mr-1 inline h-3 w-3" />
              Último envío:{" "}
              {formatInFirmTz(hearing.lastSentAt, undefined, "dd/MM/yyyy HH:mm")} a{" "}
              {hearing.lastSentToCount}{" "}
              {hearing.lastSentToCount === 1 ? "persona" : "personas"}.
            </div>
          ) : null}
        </SheetBody>
        <SheetFooter className="flex flex-wrap gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {readOnly ? "Cerrar" : "Cancelar"}
          </Button>
          {!readOnly ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => void save()}
                disabled={pending || loadingContent}
                title={
                  loadingContent
                    ? "Esperá a que cargue el reporte antes de guardar"
                    : undefined
                }
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
              <Button
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
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
