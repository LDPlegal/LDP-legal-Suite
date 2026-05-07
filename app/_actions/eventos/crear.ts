"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createEvent, findConflictingEvents } from "@/lib/db/queries/events";
import { EventoSchema } from "@/lib/schemas/fase1";

export type EventoFormState =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      conflicts?: Array<{ id: string; title: string; startAt: Date; endAt: Date }>;
    };

export async function crearEventoAction(
  _prev: EventoFormState | undefined,
  formData: FormData,
): Promise<EventoFormState> {
  const user = await requireUser();

  const attendeesRaw = formData.get("attendees");
  let attendees: string[] = [];
  if (typeof attendeesRaw === "string" && attendeesRaw) {
    try {
      const parsed = JSON.parse(attendeesRaw);
      if (Array.isArray(parsed)) attendees = parsed.filter((s) => typeof s === "string");
    } catch {
      attendees = [];
    }
  }

  const parsed = EventoSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    location: formData.get("location"),
    caseId: formData.get("caseId"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    allDay: formData.get("allDay") === "on" || formData.get("allDay") === "true",
    attendees,
    reminderMinutes: formData.get("reminderMinutes") || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los campos del formulario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const skipConflict = formData.get("skipConflict") === "true";
  if (!skipConflict && data.attendees.length > 0) {
    const conflicts = await findConflictingEvents(user.firmId, user.userId, {
      start: new Date(data.startAt),
      end: new Date(data.endAt),
      userIds: data.attendees,
    });
    if (conflicts.length > 0) {
      return {
        ok: false,
        error: "Conflicto de horario detectado. Revisa o continúa de todos modos.",
        conflicts,
      };
    }
  }

  await createEvent(user.firmId, user.userId, {
    title: data.title,
    description: data.description ?? null,
    location: data.location ?? null,
    caseId: data.caseId ?? null,
    startAt: new Date(data.startAt),
    endAt: new Date(data.endAt),
    allDay: data.allDay,
    attendees: data.attendees,
    reminderMinutes: data.reminderMinutes ?? null,
  });

  const back = (formData.get("redirectTo") as string | null) || "/calendario";
  revalidatePath("/calendario");
  if (data.caseId) revalidatePath(`/casos/${data.caseId}`);
  redirect(back);
}
