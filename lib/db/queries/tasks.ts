import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { cases, tasks, users, type NewTask, type Task } from "../schema";

export type TaskListOptions = {
  status?: Task["status"];
  assigneeId?: string;
  caseId?: string;
  mine?: boolean;
  limit?: number;
  offset?: number;
};

export async function listTasks(
  firmId: string,
  userId: string,
  opts: TaskListOptions = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(tasks.deletedAt)];
    if (opts.status) conds.push(eq(tasks.status, opts.status));
    if (opts.assigneeId) conds.push(eq(tasks.assigneeId, opts.assigneeId));
    if (opts.caseId) conds.push(eq(tasks.caseId, opts.caseId));
    if (opts.mine) conds.push(eq(tasks.assigneeId, userId));

    return tx
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueAt: tasks.dueAt,
        completedAt: tasks.completedAt,
        caseId: tasks.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
        assigneeId: tasks.assigneeId,
        assigneeName: users.name,
      })
      .from(tasks)
      .leftJoin(cases, eq(cases.id, tasks.caseId))
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(...conds))
      .orderBy(
        // pending first, completed last; within each, by due date asc nulls last.
        sql`CASE ${tasks.status} WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 WHEN 'done' THEN 3 END`,
        sql`${tasks.dueAt} asc nulls last`,
        desc(tasks.createdAt),
      )
      .limit(limit)
      .offset(offset);
  });
}

export async function createTask(
  firmId: string,
  userId: string,
  data: Omit<NewTask, "firmId" | "id" | "createdAt" | "updatedAt" | "deletedAt" | "createdBy">,
): Promise<Task> {
  const row = await withFirm(firmId, userId, async (tx) => {
    const [r] = await tx
      .insert(tasks)
      .values({ ...data, firmId, createdBy: userId })
      .returning();
    if (!r) throw new Error("createTask: insert returned no row");
    return r;
  });

  // Notificación cuando la tarea queda asignada a alguien — INCLUIDO uno
  // mismo (la firma pidió recibir el aviso aunque se autoasignen tareas,
  // como recordatorio/registro).
  // AWAIT (no void floating): notify() inserta la notificación in-app (rápido)
  // y difiere el email con after() internamente. El patrón anterior
  // `void (async()=>{})()` se moría al terminar la lambda en serverless, así
  // que la notificación podía no dispararse nunca. Lazy import por circular dep.
  if (data.assigneeId) {
    try {
      const { notify } = await import("./notifications");
      await notify({
        firmId,
        userId: data.assigneeId,
        type: "task_assigned",
        title: `Nueva tarea: ${row.title}`,
        body: data.dueAt
          ? `Vence el ${new Date(data.dueAt).toLocaleDateString("es-DO")}`
          : "Sin fecha de vencimiento",
        href: data.caseId ? `/casos/${data.caseId}?tab=tareas` : "/tareas",
      });
    } catch {
      // best-effort — un fallo de notificación no rompe la creación.
    }
  }

  return row;
}

export async function updateTaskStatus(
  firmId: string,
  userId: string,
  taskId: string,
  status: Task["status"],
): Promise<Task | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set({
        status,
        completedAt: status === "done" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .returning();
    return row ?? null;
  });
}

export async function updateTask(
  firmId: string,
  userId: string,
  taskId: string,
  data: Partial<Omit<NewTask, "firmId" | "id" | "createdAt" | "createdBy">>,
): Promise<Task | null> {
  // Detectar reasignación ANTES del update — necesitamos saber si el
  // assigneeId cambió respecto al anterior para notificar al nuevo.
  let previousAssigneeId: string | null = null;
  if (data.assigneeId !== undefined) {
    const previous = await withFirm(firmId, userId, async (tx) => {
      const [r] = await tx
        .select({ assigneeId: tasks.assigneeId })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
        .limit(1);
      return r ?? null;
    });
    previousAssigneeId = previous?.assigneeId ?? null;
  }

  const row = await withFirm(firmId, userId, async (tx) => {
    const [r] = await tx
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .returning();
    return r ?? null;
  });

  // Notificar al nuevo asignado si el assigneeId cambió. Notifica también
  // cuando el user se autoasigna (a pedido de la firma — sirve como recordatorio).
  if (
    row &&
    data.assigneeId !== undefined &&
    data.assigneeId &&
    data.assigneeId !== previousAssigneeId
  ) {
    try {
      const { notify } = await import("./notifications");
      await notify({
        firmId,
        userId: data.assigneeId,
        type: "task_assigned",
        title: `Te reasignaron: ${row.title}`,
        body: row.dueAt
          ? `Vence el ${new Date(row.dueAt).toLocaleDateString("es-DO")}`
          : "Sin fecha de vencimiento",
        href: row.caseId ? `/casos/${row.caseId}?tab=tareas` : "/tareas",
      });
    } catch {
      // best-effort — un fallo de notificación no rompe la actualización.
    }
  }

  return row;
}

export async function softDeleteTask(
  firmId: string,
  userId: string,
  taskId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });
    return !!row;
  });
}

export async function listTasksForCase(
  firmId: string,
  userId: string,
  caseId: string,
) {
  return listTasks(firmId, userId, { caseId, limit: 200 });
}

export async function listMyOpenTasks(firmId: string, userId: string) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueAt: tasks.dueAt,
        caseCode: cases.code,
        caseId: tasks.caseId,
      })
      .from(tasks)
      .leftJoin(cases, eq(cases.id, tasks.caseId))
      .where(
        and(
          eq(tasks.assigneeId, userId),
          isNull(tasks.deletedAt),
          or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress"), eq(tasks.status, "waiting")),
        ),
      )
      .orderBy(asc(tasks.dueAt))
      .limit(20);
  });
}
