"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { updateEvent } from "@/lib/db/queries/events";
import { EventoSchema } from "@/lib/schemas/fase1";

export type EditarEventoFormState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function editarEventoAction(
  eventId: string,
  _prev: EditarEventoFormState | undefined,
  formData: FormData,
): Promise<EditarEventoFormState> {
  const user = await requireUser();

  const attendeesRaw = formData.get("attendees");
  let attendees: string[] = [];
  if (typeof attendeesRaw === "string" && attendeesRaw) {
    try {
      const a = JSON.parse(attendeesRaw);
      if (Array.isArray(a)) attendees = a.filter((s) => typeof s === "string");
    } catch {
      attendees = [];
    }
  }

  const eventTypeRaw = formData.get("eventType");
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
    eventType: typeof eventTypeRaw === "string" && eventTypeRaw ? eventTypeRaw : undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisá los campos.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);

  const updated = await updateEvent(user.firmId, user.userId, eventId, {
    title: data.title,
    description: data.description ?? null,
    location: data.location ?? null,
    caseId: data.caseId ?? null,
    startAt,
    endAt,
    allDay: data.allDay,
    attendees: data.attendees,
    reminderMinutes: data.reminderMinutes ?? null,
    eventType: data.eventType ?? null,
  });

  if (!updated) {
    return { ok: false, error: "No se encontró el evento (puede haber sido borrado)." };
  }

  // Best-effort: empujar el cambio al calendario M365 del usuario si está
  // conectado. Si falla, el cron diario reconcilia.
  try {
    const { pushEventToProvider } = await import("@/lib/calendar/sync");
    void pushEventToProvider(user.userId, eventId, {
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      startAt,
      endAt,
      allDay: data.allDay,
    });
  } catch {
    // ignore
  }

  revalidatePath("/calendario");
  if (data.caseId) revalidatePath(`/casos/${data.caseId}`);
  return { ok: true };
}
