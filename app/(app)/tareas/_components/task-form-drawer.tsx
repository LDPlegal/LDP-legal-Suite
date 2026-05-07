"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
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

const initial: TareaFormState = { ok: true };

export function TaskFormDrawer({
  trigger,
  casos,
  users,
  defaultCaseId,
  redirectTo,
}: {
  trigger: ReactNode;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
  defaultCaseId?: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<TareaFormState, FormData>(
    crearTareaAction,
    initial,
  );

  function err(field: string): string | undefined {
    if (state.ok) return undefined;
    return state.fieldErrors?.[field]?.[0];
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nueva tarea</SheetTitle>
          <SheetDescription>
            Asigna una tarea a un miembro del firm. Sin caso = tarea interna del firm.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex h-full flex-col">
          {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" name="title" required />
              {err("title") ? <p className="text-xs text-destructive">{err("title")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" name="description" rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="caseId">Caso</Label>
                <select
                  id="caseId"
                  name="caseId"
                  defaultValue={defaultCaseId ?? ""}
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
                  defaultValue=""
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
                  defaultValue="med"
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
                <Input id="dueAt" name="dueAt" type="datetime-local" />
              </div>
            </div>

            <input type="hidden" name="status" value="todo" />

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
              Crear tarea
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
