"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { startTimer } from "@/lib/db/queries/timers";
import { StartTimerSchema } from "@/lib/schemas/fase1";

export async function startTimerAction(formData: FormData) {
  const user = await requireUser();
  const parsed = StartTimerSchema.safeParse({
    caseId: formData.get("caseId"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    throw new Error("startTimerAction: " + JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  await startTimer(user.firmId, user.userId, {
    caseId: parsed.data.caseId,
    description: parsed.data.description ?? null,
  });
  revalidatePath("/", "layout");
}
