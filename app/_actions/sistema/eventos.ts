"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  markAllSystemEventsResolved,
  markSystemEventResolved,
} from "@/lib/db/queries/system-events";

const IdSchema = z.object({ eventId: z.string().uuid() });

export async function resolverEventoSistemaAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  // Solo admins/socios gestionan la salud del sistema.
  if (user.role !== "admin" && user.role !== "partner") return;
  const parsed = IdSchema.safeParse({ eventId: formData.get("eventId") });
  if (!parsed.success) return;
  await markSystemEventResolved(user.firmId, user.userId, parsed.data.eventId);
  revalidatePath("/configuracion");
}

export async function resolverTodosEventosSistemaAction(): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") return;
  await markAllSystemEventsResolved(user.firmId, user.userId);
  revalidatePath("/configuracion");
}
