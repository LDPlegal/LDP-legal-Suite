"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteEvent } from "@/lib/db/queries/events";

const Schema = z.object({ eventId: z.string().uuid() });

export async function eliminarEventoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({ eventId: formData.get("eventId") });
  await softDeleteEvent(user.firmId, user.userId, parsed.eventId);
  revalidatePath("/calendario");
}
