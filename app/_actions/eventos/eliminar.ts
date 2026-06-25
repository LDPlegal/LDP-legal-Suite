"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteEvent } from "@/lib/db/queries/events";

const Schema = z.object({
  eventId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
});

export async function eliminarEventoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const caseIdRaw = formData.get("caseId");
  const parsed = Schema.parse({
    eventId: formData.get("eventId"),
    caseId: typeof caseIdRaw === "string" && caseIdRaw ? caseIdRaw : undefined,
  });

  // Best-effort: borrar también en el calendario Microsoft ANTES del soft-
  // delete local. Si lo hacemos después y la query del lookup necesita el
  // event row, podríamos perder la referencia.
  try {
    const { pushEventDeleteToProvider } = await import("@/lib/calendar/sync");
    await pushEventDeleteToProvider(user.userId, parsed.eventId);
  } catch {
    // ignore
  }

  await softDeleteEvent(user.firmId, user.userId, parsed.eventId);
  revalidatePath("/calendario");
  if (parsed.caseId) revalidatePath(`/casos/${parsed.caseId}`);
}
