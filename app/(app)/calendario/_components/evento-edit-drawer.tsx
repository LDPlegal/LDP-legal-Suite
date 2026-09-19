"use client";

// Drawer de EDICIÓN de evento. Controlled: el parent decide cuándo está
// abierto (en /casos/[id] el row tiene los botones Ver/Editar/Eliminar).
//
// Re-usa el mismo set de campos del create drawer pero pre-rellena con el
// evento existente y apunta a editarEventoAction.

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  editarEventoAction,
  type EditarEventoFormState,
} from "@/app/_actions/eventos/editar";

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "- Sin tipo -" },
  { value: "audiencia", label: "Audiencia" },
  { value: "plazo_procesal", label: "Plazo procesal" },
  { value: "reunion_cliente", label: "Reunión con cliente" },
  { value: "reunion_interna", label: "Reunión interna" },
  { value: "vencimiento_administrativo", label: "Vencimiento administrativo" },
  { value: "recordatorio", label: "Recordatorio" },
] as const;

const initial: EditarEventoFormState = { ok: true };

function isoLocal(d: Date) {
  const pad = (n: number) => Math.abs(n).toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type EditableEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  caseId: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  attendees: string[];
  reminderMinutes: number | null;
  eventType: string | null;
};

export function EventoEditDrawer({
  open,
  onOpenChange,
  event,
  casos,
  users,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: EditableEvent;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [allDay, setAllDay] = useState(event.allDay);
  const [attendees, setAttendees] = useState<string[]>(event.attendees);
  const [state, action, pending] = useActionState<EditarEventoFormState, FormData>(
    async (prev, fd) => {
      const result = await editarEventoAction(event.id, prev, fd);
      if (result.ok) {
        toast.success("Evento actualizado");
        onOpenChange(false);
        router.refresh();
      }
      return result;
    },
    initial,
  );

  function err(field: string): string | undefined {
    if (state.ok) return undefined;
    return state.fieldErrors?.[field]?.[0];
  }

  function toggleAttendee(id: string) {
    setAttendees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (pending && !v) return;
        onOpenChange(v);
      }}
    >
      <SheetContent
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>Editar evento</SheetTitle>
          <SheetDescription>
            Los cambios se reflejan en el calendario y en el caso. Si el evento
            está sincronizado con Outlook, también se actualiza allá.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            const start = fd.get("startAt") as string | null;
            const end = fd.get("endAt") as string | null;
            if (start) fd.set("startAt", new Date(start).toISOString());
            if (end) fd.set("endAt", new Date(end).toISOString());
            fd.set("allDay", allDay ? "true" : "false");
            fd.set("attendees", JSON.stringify(attendees));
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Título *</Label>
              <Input id="edit-title" name="title" required defaultValue={event.title} />
              {err("title") ? <p className="text-xs text-destructive">{err("title")}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-startAt">Inicio *</Label>
                <Input
                  id="edit-startAt"
                  name="startAt"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(event.startAt)}
                />
                {err("startAt") ? <p className="text-xs text-destructive">{err("startAt")}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-endAt">Fin *</Label>
                <Input
                  id="edit-endAt"
                  name="endAt"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(event.endAt)}
                />
                {err("endAt") ? <p className="text-xs text-destructive">{err("endAt")}</p> : null}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">Todo el día</Label>
              <Switch checked={allDay} onCheckedChange={setAllDay} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-location">Lugar</Label>
              <Input
                id="edit-location"
                name="location"
                defaultValue={event.location ?? ""}
                placeholder="Tribunal, oficina, link..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-caseId">Caso</Label>
                <select
                  id="edit-caseId"
                  name="caseId"
                  defaultValue={event.caseId ?? ""}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin caso</option>
                  {casos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-eventType">Tipo</Label>
                <select
                  id="edit-eventType"
                  name="eventType"
                  defaultValue={event.eventType ?? ""}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {EVENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Asistentes</Label>
              <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={attendees.includes(u.id)}
                      onCheckedChange={() => toggleAttendee(u.id)}
                    />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                name="description"
                rows={3}
                defaultValue={event.description ?? ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-reminderMinutes">Recordatorio (minutos antes)</Label>
              <Input
                id="edit-reminderMinutes"
                name="reminderMinutes"
                type="number"
                min={0}
                placeholder="Ej. 15"
                defaultValue={event.reminderMinutes ?? ""}
              />
            </div>

            {!state.ok && state.error ? (
              <div className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
                {state.error}
              </div>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
