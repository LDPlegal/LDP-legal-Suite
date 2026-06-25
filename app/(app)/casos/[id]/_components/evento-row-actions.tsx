"use client";

// Botones de acciones por fila del tab "Eventos" en /casos/[id].
// Renderiza Ver (drawer read-only), Editar (drawer con form), Eliminar
// (ConfirmButton con la action existente).

import { useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
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
import { eliminarEventoAction } from "@/app/_actions/eventos/eliminar";
import { formatInFirmTz } from "@/lib/datetime/format";
import {
  EventoEditDrawer,
  type EditableEvent,
} from "@/app/(app)/calendario/_components/evento-edit-drawer";

const EVENT_TYPE_LABEL: Record<string, string> = {
  audiencia: "Audiencia",
  plazo_procesal: "Plazo procesal",
  reunion_cliente: "Reunión con cliente",
  reunion_interna: "Reunión interna",
  vencimiento_administrativo: "Vencimiento administrativo",
  recordatorio: "Recordatorio",
};

export function EventoRowActions({
  event,
  caseId,
  casos,
  users,
  attendeeNames,
}: {
  event: EditableEvent;
  caseId: string;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
  attendeeNames: string[];
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        className="h-8 w-8"
        label="Ver detalle del evento"
        onClick={() => setViewOpen(true)}
      >
        <Eye className="h-4 w-4" />
      </IconButton>
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

      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{event.title}</SheetTitle>
            <SheetDescription>
              Detalle del evento (solo lectura).
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
