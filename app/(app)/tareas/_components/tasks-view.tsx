"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import dynamic from "next/dynamic";
import { Kanban, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskList } from "./task-list";

// @dnd-kit's useDraggable assigns incrementing aria-describedby ids
// (DndDescribedBy-N) which differ between server-render and client-render,
// causing a React hydration mismatch on first paint. Loading the kanban
// only on the client side avoids that — the kanban is interactive anyway.
const TaskKanban = dynamic(
  () => import("./task-kanban").then((m) => ({ default: m.TaskKanban })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[400px] w-full" />,
  },
);

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
  casos,
  users,
}: {
  tareas: TareaRow[];
  initialView: "lista" | "kanban";
  initialMine: boolean;
  casos: Array<{ id: string; code: string; title: string }>;
  users: Array<{ id: string; name: string }>;
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
        <TaskKanban tareas={tareas} casos={casos} users={users} />
      ) : (
        <TaskList tareas={tareas} casos={casos} users={users} />
      )}
    </div>
  );
}
