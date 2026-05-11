"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateTask } from "@/lib/db/queries/tasks";

const Schema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  caseId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  assigneeId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  dueAt: z.string().optional().or(z.literal("").transform(() => undefined)),
  priority: z.enum(["low", "med", "high", "urgent"]),
  status: z.enum(["todo", "in_progress", "waiting", "done"]),
});

export type EditarTareaState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function editarTareaAction(
  _prev: EditarTareaState | undefined,
  formData: FormData,
): Promise<EditarTareaState> {
  const user = await requireUser();
  const parsed = Schema.safeParse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
    description: formData.get("description"),
    caseId: formData.get("caseId"),
    assigneeId: formData.get("assigneeId"),
    dueAt: formData.get("dueAt"),
    priority: formData.get("priority"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  const updated = await updateTask(user.firmId, user.userId, data.taskId, {
    title: data.title,
    description: data.description ?? null,
    caseId: data.caseId ?? null,
    assigneeId: data.assigneeId ?? null,
    dueAt: data.dueAt ? new Date(data.dueAt) : null,
    priority: data.priority,
    status: data.status,
  });
  if (!updated) return { ok: false, error: "Tarea no encontrada." };

  revalidatePath("/tareas");
  if (data.caseId) revalidatePath(`/casos/${data.caseId}`);
  return { ok: true };
}
