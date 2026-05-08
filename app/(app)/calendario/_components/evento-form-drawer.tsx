"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  SheetTrigger,
} from "@/components/ui/sheet";
import { crearEventoAction, type EventoFormState } from "@/app/_actions/eventos/crear";

const initial: EventoFormState = { ok: true };

function isoLocal(d: Date) {
  const pad = (n: number) => Math.abs(n).toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventoFormDrawer({
  trigger,
  casos,
  users,
  currentUserId,
  defaultCaseId,
  redirectTo,
}: {
  trigger: ReactNode;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
  currentUserId: string;
  defaultCaseId?: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [skipConflict, setSkipConflict] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([currentUserId]);
  const router = useRouter();
  const [state, action, pending] = useActionState<EventoFormState, FormData>(
    async (prev, fd) => {
      const result = await crearEventoAction(prev, fd);
      if (result.ok) {
        toast.success("Evento creado");
        setOpen(false);
        setSkipConflict(false);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
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

  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuevo evento</SheetTitle>
          <SheetDescription>
            Audiencia, reunión, vencimiento. Aparece en tu calendario y, si lo asignas a un
            caso, también en la pestaña Eventos del caso.
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
            if (skipConflict) fd.set("skipConflict", "true");
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" name="title" required />
              {err("title") ? <p className="text-xs text-destructive">{err("title")}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startAt">Inicio *</Label>
                <Input
                  id="startAt"
                  name="startAt"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(now)}
                />
                {err("startAt") ? <p className="text-xs text-destructive">{err("startAt")}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endAt">Fin *</Label>
                <Input
                  id="endAt"
                  name="endAt"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(inOneHour)}
                />
                {err("endAt") ? <p className="text-xs text-destructive">{err("endAt")}</p> : null}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Todo el día</Label>
              </div>
              <Switch checked={allDay} onCheckedChange={setAllDay} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Lugar</Label>
              <Input id="location" name="location" placeholder="Tribunal, oficina, link..." />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="caseId">Caso</Label>
              <select
                id="caseId"
                name="caseId"
                defaultValue={defaultCaseId ?? ""}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sin caso</option>
                {casos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
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
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" name="description" rows={3} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reminderMinutes">Recordatorio (minutos antes)</Label>
              <Input
                id="reminderMinutes"
                name="reminderMinutes"
                type="number"
                min={0}
                placeholder="Ej. 15"
              />
              <p className="text-[11px] text-muted-foreground">
                El sender de email llega en Fase 2; por ahora se guarda el valor.
              </p>
            </div>

            {!state.ok && state.error ? (
              <div className="space-y-2 rounded-md border border-warning bg-warning/10 p-3">
                <p className="text-sm font-medium text-warning-foreground">{state.error}</p>
                {state.conflicts && state.conflicts.length > 0 ? (
                  <>
                    <ul className="space-y-1 text-xs">
                      {state.conflicts.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span>{c.title}</span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {new Date(c.startAt).toLocaleString("es-DO", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={skipConflict}
                        onCheckedChange={(v) => setSkipConflict(!!v)}
                      />
                      Crear de todos modos
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Crear evento
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
