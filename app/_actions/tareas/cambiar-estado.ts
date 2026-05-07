"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateTaskStatus } from "@/lib/db/queries/tasks";

const Schema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["todo", "in_progress", "waiting", "done"]),
});

export async function cambiarEstadoTareaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({
    taskId: formData.get("taskId"),
    status: formData.get("status"),
  });
  await updateTaskStatus(user.firmId, user.userId, parsed.taskId, parsed.status);
  revalidatePath("/tareas");
}
