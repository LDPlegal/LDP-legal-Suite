"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { discardTimer } from "@/lib/db/queries/timers";

export async function discardTimerAction(): Promise<void> {
  const user = await requireUser();
  await discardTimer(user.firmId, user.userId);
  revalidatePath("/", "layout");
}
