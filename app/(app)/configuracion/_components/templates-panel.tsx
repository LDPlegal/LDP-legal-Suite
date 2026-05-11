"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  guardarTemplateAction,
  eliminarTemplateAction,
  type GuardarTemplateState,
} from "@/app/_actions/configuracion/templates";
import { MATTER_LABEL, type MatterType } from "@/lib/schemas/caso";

type TemplateTask = {
  title: string;
  description?: string;
  priority?: "low" | "med" | "high" | "urgent";
  offsetDays?: number;
};
type TemplateEvent = {
  title: string;
  description?: string;
  location?: string;
  offsetDays: number;
  durationMinutes?: number;
};
type TemplateRow = {
  id: string;
  name: string;
  matterType: MatterType;
  description: string | null;
  defaultTasks: TemplateTask[];
  defaultEvents: TemplateEvent[];
};

const initial: GuardarTemplateState = { ok: true, id: "" };

export function TemplatesPanel({
  templates,
  canEdit,
}: {
  templates: TemplateRow[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {templates.length}{" "}
          {templates.length === 1 ? "plantilla" : "plantillas"}
        </p>
        {canEdit ? (
          <TemplateDrawer
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5" />
                Nueva plantilla
              </Button>
            }
          />
        ) : null}
      </div>
      {templates.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Aún no hay plantillas. Crea una para autopoblar tareas y eventos al
          abrir casos de un tipo común (demanda en cobro, constitución de
          sociedad, etc.).
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <TemplateRowItem key={t.id} template={t} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateRowItem({
  template,
  canEdit,
}: {
  template: TemplateRow;
  canEdit: boolean;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{template.name}</p>
          <Badge variant="outline" className="text-[10px]">
            {MATTER_LABEL[template.matterType]}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {template.defaultTasks.length} tareas ·{" "}
            {template.defaultEvents.length} eventos
          </span>
        </div>
        {template.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {template.description}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex shrink-0 gap-1">
          <TemplateDrawer
            template={template}
            trigger={
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <ConfirmButton
            action={eliminarTemplateAction}
            title="¿Eliminar esta plantilla?"
            description={`"${template.name}" — los casos ya creados con esta plantilla no se afectan.`}
            confirmLabel="Eliminar"
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <input type="hidden" name="templateId" value={template.id} />
          </ConfirmButton>
        </div>
      ) : null}
    </li>
  );
}

function TemplateDrawer({
  trigger,
  template,
}: {
  trigger: ReactNode;
  template?: TemplateRow;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [tasks, setTasks] = useState<TemplateTask[]>(
    template?.defaultTasks ?? [],
  );
  const [events, setEvents] = useState<TemplateEvent[]>(
    template?.defaultEvents ?? [],
  );
  const [state, action, pending] = useActionState<GuardarTemplateState, FormData>(
    async (prev, fd) => {
      const r = await guardarTemplateAction(prev, fd);
      if (r.ok) {
        toast.success(template ? "Plantilla actualizada" : "Plantilla creada");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    initial,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {template ? "Editar plantilla" : "Nueva plantilla de matter"}
          </SheetTitle>
          <SheetDescription>
            Cuando crees un caso y elijas esta plantilla, se generarán
            automáticamente las tareas y eventos definidos aquí, con fechas
            relativas a hoy.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            if (template) fd.set("templateId", template.id);
            fd.set("defaultTasks", JSON.stringify(tasks));
            fd.set("defaultEvents", JSON.stringify(events));
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  name="name"
                  required
                  defaultValue={template?.name ?? ""}
                  placeholder="Demanda en cobro de pesos"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Materia *</Label>
                <select
                  name="matterType"
                  required
                  defaultValue={template?.matterType ?? "civil"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(MATTER_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea
                name="description"
                rows={2}
                defaultValue={template?.description ?? ""}
                placeholder="Cuándo usar esta plantilla"
              />
            </div>

            <TasksEditor tasks={tasks} onChange={setTasks} />
            <EventsEditor events={events} onChange={setEvents} />

            {!state.ok ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Guardar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TasksEditor({
  tasks,
  onChange,
}: {
  tasks: TemplateTask[];
  onChange: (next: TemplateTask[]) => void;
}) {
  function update(idx: number, patch: Partial<TemplateTask>) {
    onChange(tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }
  function add() {
    onChange([...tasks, { title: "", priority: "med", offsetDays: 7 }]);
  }
  function remove(idx: number) {
    onChange(tasks.filter((_, i) => i !== idx));
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Tareas predefinidas ({tasks.length})</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3 w-3" />
          Agregar
        </Button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin tareas definidas.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t, i) => (
            <li key={i} className="grid gap-2 rounded-md border bg-muted/30 p-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Input
                value={t.title}
                onChange={(e) => update(i, { title: e.currentTarget.value })}
                placeholder="Título de la tarea"
                required
              />
              <select
                value={t.priority ?? "med"}
                onChange={(e) =>
                  update(i, {
                    priority: e.target.value as TemplateTask["priority"],
                  })
                }
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="low">Baja</option>
                <option value="med">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
              <Input
                type="number"
                value={t.offsetDays ?? ""}
                onChange={(e) =>
                  update(i, {
                    offsetDays: e.currentTarget.value
                      ? Number(e.currentTarget.value)
                      : undefined,
                  })
                }
                placeholder="Días desde hoy"
                min={-365}
                max={365}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => remove(i)}
                aria-label="Quitar tarea"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventsEditor({
  events,
  onChange,
}: {
  events: TemplateEvent[];
  onChange: (next: TemplateEvent[]) => void;
}) {
  function update(idx: number, patch: Partial<TemplateEvent>) {
    onChange(events.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function add() {
    onChange([...events, { title: "", offsetDays: 14, durationMinutes: 60 }]);
  }
  function remove(idx: number) {
    onChange(events.filter((_, i) => i !== idx));
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Eventos predefinidos ({events.length})</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3 w-3" />
          Agregar
        </Button>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin eventos definidos.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e, i) => (
            <li key={i} className="grid gap-2 rounded-md border bg-muted/30 p-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Input
                value={e.title}
                onChange={(ev) => update(i, { title: ev.currentTarget.value })}
                placeholder="Título del evento"
                required
              />
              <Input
                type="number"
                value={e.offsetDays}
                onChange={(ev) =>
                  update(i, { offsetDays: Number(ev.currentTarget.value || 0) })
                }
                placeholder="Días desde hoy"
                min={-365}
                max={365}
                required
              />
              <Input
                type="number"
                value={e.durationMinutes ?? ""}
                onChange={(ev) =>
                  update(i, {
                    durationMinutes: ev.currentTarget.value
                      ? Number(ev.currentTarget.value)
                      : undefined,
                  })
                }
                placeholder="Duración (min)"
                min={15}
                max={480}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => remove(i)}
                aria-label="Quitar evento"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
