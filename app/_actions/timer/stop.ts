"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { stopTimer } from "@/lib/db/queries/timers";

export async function stopTimerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const description = (formData.get("description") as string | null)?.trim() || null;
  await stopTimer(user.firmId, user.userId, { description });
  revalidatePath("/", "layout");
}
