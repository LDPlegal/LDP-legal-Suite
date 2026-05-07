"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Kanban, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskList } from "./task-list";
import { TaskKanban } from "./task-kanban";

export type TareaRow = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "waiting" | "done";
  priority: "low" | "med" | "high" | "urgent";
  dueAt: Date | null;
  completedAt: Date | null;
  caseId: string | null;
  caseCode: string | null;
  caseTitle: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
};

export function TasksView({
  tareas,
  initialView,
  initialMine,
}: {
  tareas: TareaRow[];
  initialView: "lista" | "kanban";
  initialMine: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setSearch(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => {
      router.replace(`/tareas${next.toString() ? `?${next.toString()}` : ""}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            type="button"
            variant={initialView === "lista" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSearch({ view: null })}
            disabled={pending}
          >
            <List className="h-4 w-4" /> Lista
          </Button>
          <Button
            type="button"
            variant={initialView === "kanban" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSearch({ view: "kanban" })}
            disabled={pending}
          >
            <Kanban className="h-4 w-4" /> Kanban
          </Button>
        </div>
        <Button
          type="button"
          variant={initialMine ? "default" : "outline"}
          size="sm"
          onClick={() => setSearch({ mine: initialMine ? null : "1" })}
          disabled={pending}
        >
          {initialMine ? "Mostrando: mías" : "Mostrar solo mías"}
        </Button>
      </div>

      {initialView === "kanban" ? (
        <TaskKanban tareas={tareas} />
      ) : (
        <TaskList tareas={tareas} />
      )}
    </div>
  );
}
