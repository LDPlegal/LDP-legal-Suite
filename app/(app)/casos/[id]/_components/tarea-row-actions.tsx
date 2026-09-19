"use client";

import { useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatInFirmTz } from "@/lib/datetime/format";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/schemas/fase1";
import { eliminarTareaAction } from "@/app/_actions/tareas/eliminar";
import { TaskFormDrawer } from "@/app/(app)/tareas/_components/task-form-drawer";

type TaskInitial = {
  id: string;
  title: string;
  description: string | null;
  caseId: string | null;
  assigneeId: string | null;
  dueAt: Date | null;
  priority: "low" | "med" | "high" | "urgent";
  status: "todo" | "in_progress" | "waiting" | "done";
};

export function TareaRowActions({
  task,
  casos,
  users,
}: {
  task: TaskInitial;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
}) {
  const [viewOpen, setViewOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        className="h-8 w-8"
        label="Ver detalle de la tarea"
        onClick={() => setViewOpen(true)}
      >
        <Eye className="h-4 w-4" />
      </IconButton>
      <TaskFormDrawer
        casos={casos}
        users={users}
        task={task}
        trigger={
          <IconButton className="h-8 w-8" label="Editar tarea">
            <Pencil className="h-4 w-4" />
          </IconButton>
        }
      />
      <ConfirmButton
        action={eliminarTareaAction}
        title="¿Eliminar esta tarea?"
        description={`"${task.title}", esta acción es reversible (queda archivada).`}
        confirmLabel="Eliminar"
        trigger={
          <IconButton
            className="h-8 w-8 text-destructive"
            label="Eliminar tarea (archivar)"
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        }
      >
        <input type="hidden" name="taskId" value={task.id} />
      </ConfirmButton>

      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{task.title}</SheetTitle>
            <SheetDescription>Detalle de la tarea (solo lectura).</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3 text-sm">
            <DetailRow label="Estado">
              <Badge>{TASK_STATUS_LABEL[task.status]}</Badge>
            </DetailRow>
            <DetailRow label="Prioridad">
              <Badge variant="outline">{TASK_PRIORITY_LABEL[task.priority]}</Badge>
            </DetailRow>
            <DetailRow label="Asignado a">
              {users.find((u) => u.id === task.assigneeId)?.name ?? (
                <span className="text-muted-foreground">Sin asignar</span>
              )}
            </DetailRow>
            <DetailRow label="Vence">
              {task.dueAt
                ? formatInFirmTz(task.dueAt, undefined, "EEEE dd 'de' MMMM yyyy")
                : <span className="text-muted-foreground">Sin fecha</span>}
            </DetailRow>
            {task.description ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Descripción
                </p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {task.description}
                </p>
              </div>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Cerrar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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
