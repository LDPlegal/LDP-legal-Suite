"use server";

// Confirma + reagenda o cancela un evento desde el chat IA.
// Se invocan desde las tarjetas update_event / cancel_event en
// matter-chat-panel.tsx después de que el usuario hace clic confirmar.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { eventAlerts, events } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { logAuditStandalone } from "@/lib/audit/log";

const UpdateSchema = z.object({
  caseId: z.string().uuid(),
  chatMessageId: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  startAtIso: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(0).max(480).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().max(200).optional(),
  reason: z.string().trim().max(500).optional(),
});

export type UpdateEventState = { ok: true } | { ok: false; error: string };

export async function updateEventFromChatAction(
  input: z.input<typeof UpdateSchema>,
): Promise<UpdateEventState> {
  const user = await requireUser();
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }
  const data = parsed.data;

  // Validate the event belongs to this firm + case.
  const [ev] = await adminDb
    .select()
    .from(events)
    .where(and(eq(events.id, data.eventId), eq(events.firmId, user.firmId)))
    .limit(1);
  if (!ev) return { ok: false, error: "Evento no encontrado." };
  if (ev.caseId !== data.caseId) {
    return { ok: false, error: "El evento pertenece a otro expediente." };
  }

  // Compute the patch.
  const patch: Partial<typeof events.$inferInsert> = { updatedAt: new Date() };
  let newStart: Date | null = null;
  if (data.startAtIso) {
    newStart = new Date(data.startAtIso);
    patch.startAt = newStart;
  }
  let newDuration: number | null = null;
  if (typeof data.durationMinutes === "number") {
    newDuration = data.durationMinutes;
  }
  if (newStart || newDuration !== null) {
    const startAt = newStart ?? ev.startAt;
    const duration =
      newDuration !== null
        ? newDuration
        : Math.max(1, Math.round((ev.endAt.getTime() - ev.startAt.getTime()) / 60_000));
    patch.endAt = new Date(startAt.getTime() + Math.max(1, duration) * 60_000);
    patch.allDay = duration === 0;
  }
  if (data.title) patch.title = data.title;
  if (typeof data.location === "string") patch.location = data.location;

  await adminDb.update(events).set(patch).where(eq(events.id, data.eventId));

  // If startAt changed, reset pending alerts (delete and recompute).
  if (newStart) {
    await adminDb
      .delete(eventAlerts)
      .where(and(eq(eventAlerts.eventId, data.eventId), eq(eventAlerts.firmId, user.firmId)));
    // Rebuild via the same policy used at creation. Inline rather than
    // re-imported to avoid an extra dependency cycle.
    const { computeAlertDueDates, policyFor } = await import("@/lib/events/alert-policy");
    const policy = policyFor(ev.eventType ?? "recordatorio");
    const due = computeAlertDueDates(newStart, policy);
    if (due.length > 0) {
      const rows: Array<typeof eventAlerts.$inferInsert> = [];
      for (const dueAt of due) {
        for (const channel of policy.channels) {
          rows.push({
            firmId: user.firmId,
            eventId: data.eventId,
            dueAt,
            channel,
            recipientUserId: ev.createdBy ?? user.userId,
          });
        }
      }
      if (rows.length > 0) {
        await adminDb.insert(eventAlerts).values(rows);
      }
    }
  }

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "event",
    entityId: data.eventId,
    caseId: data.caseId,
    action: "updated",
    summary: `Reagendó evento por IA${data.reason ? `: ${data.reason}` : ""}`,
    diff: {
      changes: patch,
      reason: data.reason,
      chatMessageId: data.chatMessageId,
    },
  });

  // Best-effort: propagar el cambio al calendario Microsoft.
  try {
    const { pushEventUpdateToProvider } = await import("@/lib/calendar/sync");
    void pushEventUpdateToProvider(user.userId, data.eventId, {
      title: data.title,
      location: data.location,
      startAt: newStart ?? undefined,
      endAt: patch.endAt ?? undefined,
    });
  } catch {
    // ignore
  }

  revalidatePath(`/casos/${data.caseId}`);
  revalidatePath("/calendario");
  return { ok: true };
}

const CancelSchema = z.object({
  caseId: z.string().uuid(),
  chatMessageId: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export type CancelEventState = { ok: true } | { ok: false; error: string };

export async function cancelEventFromChatAction(
  input: z.input<typeof CancelSchema>,
): Promise<CancelEventState> {
  const user = await requireUser();
  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }
  const data = parsed.data;

  const [ev] = await adminDb
    .select()
    .from(events)
    .where(and(eq(events.id, data.eventId), eq(events.firmId, user.firmId)))
    .limit(1);
  if (!ev) return { ok: false, error: "Evento no encontrado." };
  if (ev.caseId !== data.caseId) {
    return { ok: false, error: "El evento pertenece a otro expediente." };
  }

  // Cancel = delete (soft-cancel via deletedAt). The events table uses
  // deletedAt to drive visibility; calendar feed filters on it.
  await adminDb
    .update(events)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(events.id, data.eventId));

  // Remove pending alerts so the cron doesn't try to send them.
  await adminDb
    .delete(eventAlerts)
    .where(and(eq(eventAlerts.eventId, data.eventId), eq(eventAlerts.firmId, user.firmId)));

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "event",
    entityId: data.eventId,
    caseId: data.caseId,
    action: "deleted",
    summary: `Canceló evento por IA: ${data.reason}`,
    diff: { reason: data.reason, chatMessageId: data.chatMessageId },
  });

  // Best-effort: borrar también en el calendario Microsoft.
  try {
    const { pushEventDeleteToProvider } = await import("@/lib/calendar/sync");
    void pushEventDeleteToProvider(user.userId, data.eventId);
  } catch {
    // ignore
  }

  revalidatePath(`/casos/${data.caseId}`);
  revalidatePath("/calendario");
  return { ok: true };
}
