import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTasks } from "@/lib/db/queries/tasks";
import { listCases } from "@/lib/db/queries/cases";
import { listFirmUsers } from "@/lib/db/queries/users";
import { requireUser } from "@/lib/auth/session";
import { TasksView } from "./_components/tasks-view";
import { TaskFormDrawer } from "./_components/task-form-drawer";

export const metadata = { title: "Tareas · LDP Legal Suite" };

type SP = Promise<{ view?: string; mine?: string }>;

export default async function TareasPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "kanban" ? "kanban" : "lista";
  const mine = sp.mine === "1";

  const [tareas, casos, usuarios] = await Promise.all([
    listTasks(user.firmId, user.userId, { mine, limit: 200 }),
    listCases(user.firmId, user.userId, { limit: 200, status: "open" }),
    listFirmUsers(user.firmId, user.userId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
          <p className="text-sm text-muted-foreground">
            {tareas.length} {tareas.length === 1 ? "tarea" : "tareas"} {mine ? "asignadas a ti" : "del firm"}
          </p>
        </div>
        <TaskFormDrawer
          casos={casos.rows.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
          users={usuarios.map((u) => ({ id: u.id, name: u.name }))}
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Nueva tarea
            </Button>
          }
        />
      </div>

      <TasksView tareas={tareas} initialView={view} initialMine={mine} />
    </div>
  );
}
