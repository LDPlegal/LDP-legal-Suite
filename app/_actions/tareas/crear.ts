"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createTask } from "@/lib/db/queries/tasks";
import { TareaSchema } from "@/lib/schemas/fase1";

export type TareaFormState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function crearTareaAction(
  _prev: TareaFormState | undefined,
  formData: FormData,
): Promise<TareaFormState> {
  const user = await requireUser();
  const parsed = TareaSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    caseId: formData.get("caseId"),
    assigneeId: formData.get("assigneeId"),
    dueAt: formData.get("dueAt"),
    priority: formData.get("priority") || "med",
    status: formData.get("status") || "todo",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  await createTask(user.firmId, user.userId, {
    title: data.title,
    description: data.description ?? null,
    caseId: data.caseId ?? null,
    assigneeId: data.assigneeId ?? null,
    dueAt: data.dueAt ? new Date(data.dueAt) : null,
    priority: data.priority,
    status: data.status,
  });
  const back = (formData.get("redirectTo") as string | null) || "/tareas";
  revalidatePath("/tareas");
  if (data.caseId) revalidatePath(`/casos/${data.caseId}`);
  redirect(back);
}
