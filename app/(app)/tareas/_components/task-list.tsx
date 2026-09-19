"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInFirmTz } from "@/lib/datetime/format";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/schemas/fase1";
import { eliminarTareaAction } from "@/app/_actions/tareas/eliminar";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TaskFormDrawer } from "./task-form-drawer";
import type { TareaRow } from "./tasks-view";

const STATUS_VARIANT: Record<TareaRow["status"], "warning" | "success" | "secondary" | "default"> = {
  todo: "secondary",
  in_progress: "default",
  waiting: "warning",
  done: "success",
};

const PRIORITY_VARIANT: Record<TareaRow["priority"], "default" | "warning" | "destructive" | "secondary"> = {
  low: "secondary",
  med: "default",
  high: "warning",
  urgent: "destructive",
};

export function TaskList({
  tareas,
  casos,
  users,
}: {
  tareas: TareaRow[];
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
}) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead className="w-32">Caso</TableHead>
            <TableHead className="w-36">Asignado</TableHead>
            <TableHead className="w-28">Prioridad</TableHead>
            <TableHead className="w-28">Estado</TableHead>
            <TableHead className="w-32">Vence</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tareas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                Sin tareas. Crea una nueva.
              </TableCell>
            </TableRow>
          ) : (
            tareas.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="font-medium">{t.title}</p>
                  {t.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {t.caseCode ? (
                    <Link href={`/casos/${t.caseId}`} className="hover:underline">
                      {t.caseCode}
                    </Link>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-sm">{t.assigneeName ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={PRIORITY_VARIANT[t.priority]}>
                    {TASK_PRIORITY_LABEL[t.priority]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.dueAt ? formatInFirmTz(t.dueAt, undefined, "dd/MM/yyyy") : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <TaskFormDrawer
                    casos={casos}
                    users={users}
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
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Editar tarea"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                  <ConfirmButton
                    action={eliminarTareaAction}
                    title="¿Eliminar esta tarea?"
                    description={`"${t.title}", esta acción es reversible (queda archivada).`}
                    confirmLabel="Eliminar"
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        aria-label="Eliminar tarea"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    }
                  >
                    <input type="hidden" name="taskId" value={t.id} />
                  </ConfirmButton>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
