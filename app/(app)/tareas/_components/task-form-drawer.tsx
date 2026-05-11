"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { crearTareaAction, type TareaFormState } from "@/app/_actions/tareas/crear";
import {
  editarTareaAction,
  type EditarTareaState,
} from "@/app/_actions/tareas/editar";

type FormState = TareaFormState | EditarTareaState;
const initial: FormState = { ok: true };

export type TaskInitial = {
  id: string;
  title: string;
  description: string | null;
  caseId: string | null;
  assigneeId: string | null;
  dueAt: Date | null;
  priority: "low" | "med" | "high" | "urgent";
  status: "todo" | "in_progress" | "waiting" | "done";
};

// Convierte un Date a "YYYY-MM-DDTHH:mm" en hora local — formato que el
// input datetime-local entiende. Si no hay fecha, devuelve "".
function toLocalDatetimeInput(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TaskFormDrawer({
  trigger,
  casos,
  users,
  defaultCaseId,
  redirectTo,
  task,
}: {
  trigger: ReactNode;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
  defaultCaseId?: string;
  redirectTo?: string;
  /** When set, the drawer edits the existing task instead of creating one. */
  task?: TaskInitial;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = !!task;
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      const result = isEdit
        ? await editarTareaAction(prev as EditarTareaState, fd)
        : await crearTareaAction(prev as TareaFormState, fd);
      if (result.ok) {
        toast.success(isEdit ? "Tarea actualizada" : "Tarea creada");
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      }
      return result;
    },
    initial,
  );

  function err(field: string): string | undefined {
    if (state.ok) return undefined;
    return (state as { fieldErrors?: Record<string, string[]> }).fieldErrors?.[
      field
    ]?.[0];
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar tarea" : "Nueva tarea"}</SheetTitle>
          <SheetDescription>
            Asigna una tarea a un miembro del firm. Sin caso = tarea interna del firm.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            // <input type="datetime-local"> emits "YYYY-MM-DDTHH:mm" without
            // a timezone. Convert to ISO with offset before submitting.
            const dueAt = fd.get("dueAt") as string | null;
            if (dueAt) fd.set("dueAt", new Date(dueAt).toISOString());
            else fd.delete("dueAt");
            if (isEdit) fd.set("taskId", task!.id);
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                name="title"
                required
                defaultValue={task?.title ?? ""}
              />
              {err("title") ? <p className="text-xs text-destructive">{err("title")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={task?.description ?? ""}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="caseId">Caso</Label>
                <select
                  id="caseId"
                  name="caseId"
                  defaultValue={task?.caseId ?? defaultCaseId ?? ""}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin caso (interno)</option>
                  {casos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assigneeId">Asignar a</Label>
                <select
                  id="assigneeId"
                  name="assigneeId"
                  defaultValue={task?.assigneeId ?? ""}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin asignar</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="priority">Prioridad</Label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue={task?.priority ?? "med"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="low">Baja</option>
                  <option value="med">Media</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dueAt">Vence</Label>
                <Input
                  id="dueAt"
                  name="dueAt"
                  type="datetime-local"
                  defaultValue={toLocalDatetimeInput(task?.dueAt ?? null)}
                />
              </div>
            </div>

            {isEdit ? (
              <div className="space-y-1.5">
                <Label htmlFor="status">Estado</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={task!.status}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="todo">Por hacer</option>
                  <option value="in_progress">En curso</option>
                  <option value="waiting">Esperando</option>
                  <option value="done">Hecha</option>
                </select>
              </div>
            ) : (
              <input type="hidden" name="status" value="todo" />
            )}

            {!state.ok && state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {isEdit ? "Guardar cambios" : "Crear tarea"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
