"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteTask } from "@/lib/db/queries/tasks";

const Schema = z.object({ taskId: z.string().uuid() });

export async function eliminarTareaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({ taskId: formData.get("taskId") });
  await softDeleteTask(user.firmId, user.userId, parsed.taskId);
  revalidatePath("/tareas");
}
