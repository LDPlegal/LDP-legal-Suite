"use server";

// Confirms + creates an event from a `create_event` tool_use call emitted
// by the matter chat assistant. The model SHOULD have already asked the
// user for confirmation in the chat; this action runs after the user
// clicks the "Crear evento" button on the tool card.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/db/admin";
import { eventAlerts, events } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getCaseById } from "@/lib/db/queries/cases";
import { logAuditStandalone } from "@/lib/audit/log";
import {
  DEFAULT_ALERT_POLICY,
  computeAlertDueDates,
  policyFor,
  type EventTypeName,
} from "@/lib/events/alert-policy";

const EventTypeEnum = z.enum([
  "audiencia",
  "plazo_procesal",
  "reunion_cliente",
  "reunion_interna",
  "vencimiento_administrativo",
  "recordatorio",
]);

const Schema = z.object({
  caseId: z.string().uuid(),
  chatMessageId: z.string().uuid().optional(),
  eventType: EventTypeEnum,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  startAtIso: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(0).max(480).optional(),
  location: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  originalPrompt: z.string().trim().max(8000),
});

export type CreateEventFromChatState =
  | {
      ok: true;
      eventId: string;
      alertCount: number;
    }
  | { ok: false; error: string };

export async function createEventFromChatAction(input: {
  caseId: string;
  chatMessageId?: string;
  eventType: EventTypeName;
  title: string;
  description?: string;
  startAtIso: string;
  durationMinutes?: number;
  location?: string;
  originalPrompt: string;
}): Promise<CreateEventFromChatState> {
  const user = await requireUser();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos del evento inválidos." };
  }
  const caso = await getCaseById(user.firmId, user.userId, parsed.data.caseId);
  if (!caso) return { ok: false, error: "Caso no encontrado o sin acceso." };

  const startAt = new Date(parsed.data.startAtIso);
  // Reasonable defaults if duration is missing: audiencia 120m, reunion 60m,
  // plazo/vencimiento/recordatorio puntuales (0 → endAt = startAt + 1 min).
  const defaultDur =
    parsed.data.eventType === "audiencia" ? 120 : parsed.data.eventType.startsWith("reunion") ? 60 : 0;
  const duration = parsed.data.durationMinutes ?? defaultDur;
  const endAt = new Date(startAt.getTime() + (duration || 1) * 60_000);

  const policy = policyFor(parsed.data.eventType);

  // Insert the event. We bypass withFirm because this comes from an
  // already-authenticated server action with the firm context resolved.
  const [created] = await adminDb
    .insert(events)
    .values({
      firmId: user.firmId,
      caseId: parsed.data.caseId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      location: parsed.data.location ?? null,
      startAt,
      endAt,
      allDay: duration === 0,
      icalUid: `${randomUUID()}@ldp-legal-suite`,
      eventType: parsed.data.eventType,
      createdByAi: true,
      originalPrompt: parsed.data.originalPrompt,
      aiChatMessageId: parsed.data.chatMessageId ?? null,
      alertPolicy: policy,
      createdBy: user.userId,
    })
    .returning({ id: events.id });

  if (!created) {
    return { ok: false, error: "No se pudo crear el evento." };
  }

  // Schedule alerts: one row per (offset, channel). The background sweeper
  // (cron) will pick them up when due.
  const dueDates = computeAlertDueDates(startAt, policy);
  const lawyerId = caso.case.leadLawyerId ?? user.userId;
  const alertRows: Array<typeof eventAlerts.$inferInsert> = [];
  for (const dueAt of dueDates) {
    for (const channel of policy.channels) {
      alertRows.push({
        firmId: user.firmId,
        eventId: created.id,
        dueAt,
        channel,
        recipientUserId: lawyerId,
      });
    }
  }
  if (alertRows.length > 0) {
    await adminDb.insert(eventAlerts).values(alertRows);
  }

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "event",
    entityId: created.id,
    caseId: parsed.data.caseId,
    action: "created",
    summary: `Creó evento por IA: ${parsed.data.title}`,
    diff: {
      eventType: parsed.data.eventType,
      startAt: startAt.toISOString(),
      alertsScheduled: alertRows.length,
    },
  });

  revalidatePath(`/casos/${parsed.data.caseId}`);
  revalidatePath("/calendario");
  return { ok: true, eventId: created.id, alertCount: alertRows.length };
}

// Suppress unused-import for the default policy table (kept for future
// docs / tooling helpers).
void DEFAULT_ALERT_POLICY;
