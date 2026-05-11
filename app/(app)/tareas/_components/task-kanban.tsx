"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Link from "next/link";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/schemas/fase1";
import type { TareaRow } from "./tasks-view";
import { cambiarEstadoTareaAction } from "@/app/_actions/tareas/cambiar-estado";

const COLUMNS: Array<TareaRow["status"]> = ["todo", "in_progress", "waiting", "done"];

const COLUMN_TONE: Record<TareaRow["status"], string> = {
  todo: "border-muted-foreground/30",
  in_progress: "border-primary/40",
  waiting: "border-warning/40",
  done: "border-success/40",
};

const PRIORITY_VARIANT: Record<TareaRow["priority"], "default" | "warning" | "destructive" | "secondary"> = {
  low: "secondary",
  med: "default",
  high: "warning",
  urgent: "destructive",
};

export function TaskKanban({
  tareas: initialTareas,
}: {
  tareas: TareaRow[];
  casos?: Array<{ id: string; code: string; title: string }>;
  users?: Array<{ id: string; name: string }>;
}) {
  // Local optimistic copy so drop is instant; server roundtrip happens in transition.
  const [tareas, setTareas] = useState(initialTareas);
  const [, startTransition] = useTransition();

  // Sync when server-side tareas change (router refresh).
  useEffect(() => {
    setTareas(initialTareas);
  }, [initialTareas]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const taskId = e.active.id as string;
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    if (!COLUMNS.includes(overId as TareaRow["status"])) return;
    const newStatus = overId as TareaRow["status"];
    const task = tareas.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setTareas((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: newStatus, completedAt: newStatus === "done" ? new Date() : null }
          : t,
      ),
    );

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("status", newStatus);
        await cambiarEstadoTareaAction(fd);
      } catch {
        // Roll back on failure
        setTareas(initialTareas);
        toast.error("No se pudo cambiar el estado de la tarea.");
      }
    });
  }

  const grouped: Record<TareaRow["status"], TareaRow[]> = {
    todo: [],
    in_progress: [],
    waiting: [],
    done: [],
  };
  for (const t of tareas) grouped[t.status].push(t);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 md:grid-cols-4">
        {COLUMNS.map((status) => (
          <Column
            key={status}
            status={status}
            tareas={grouped[status]}
            tone={COLUMN_TONE[status]}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  tareas,
  tone,
}: {
  status: TareaRow["status"];
  tareas: TareaRow[];
  tone: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={
        "rounded-lg border-2 border-dashed " +
        tone +
        " bg-muted/30 p-3 transition-colors " +
        (isOver ? "border-solid bg-accent/30" : "")
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{TASK_STATUS_LABEL[status]}</h3>
        <Badge variant="outline">{tareas.length}</Badge>
      </div>
      <div className="space-y-2 min-h-[200px]">
        {tareas.length === 0 ? (
          <p className="rounded-md border border-dashed bg-background/40 p-4 text-center text-xs text-muted-foreground">
            Sin tareas
          </p>
        ) : (
          tareas.map((t) => <DraggableTask key={t.id} tarea={t} />)
        )}
      </div>
    </div>
  );
}

function DraggableTask({ tarea }: { tarea: TareaRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: tarea.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={
        "cursor-grab p-3 active:cursor-grabbing " +
        (isDragging ? "opacity-50 shadow-lg" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{tarea.title}</p>
        <Badge variant={PRIORITY_VARIANT[tarea.priority]} className="shrink-0">
          {TASK_PRIORITY_LABEL[tarea.priority]}
        </Badge>
      </div>
      {tarea.caseCode ? (
        <Link
          href={`/casos/${tarea.caseId}`}
          className="mt-1 inline-block font-mono text-[10px] text-muted-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {tarea.caseCode}
        </Link>
      ) : null}
      {tarea.assigneeName ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{tarea.assigneeName}</p>
      ) : null}
    </Card>
  );
}
