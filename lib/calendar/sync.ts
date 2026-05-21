// F7+ Bloque 5 — Sync bidireccional con calendarios OAuth (Microsoft).
//
// Modelo:
//   - Cada usuario que conectó su Microsoft tiene una fila en
//     calendar_integrations. Esa fila es la "subscription" que une events
//     locales con events del provider.
//   - Pull: traemos eventos del provider que NO estén ya espejados en
//     nuestra DB (dedupe por iCalUId). Los insertamos como events del firm
//     marcados con external_subscription_id = integration.id y
//     external_uid = iCalUId del provider.
//   - Push: cuando se crea/actualiza/borra un evento en la app, lo
//     mandamos al provider del usuario que lo creó. Esto se dispara
//     desde las server actions de eventos, no acá.
//
// Frecuencia de pull: el cron diario corre sync para cada integración
// activa. Window: 30 días atrás y 90 días adelante.

import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, isNotNull, lte } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { calendarIntegrations, events } from "@/lib/db/schema";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  type CreateEventInput,
  type GraphCalendarEvent,
} from "@/lib/oauth/microsoft-graph";

export type SyncSummary = {
  userId: string;
  provider: "microsoft";
  pulled: number;
  errors: number;
  skipped: number;
};

const PULL_WINDOW_PAST_DAYS = 30;
const PULL_WINDOW_FUTURE_DAYS = 90;

// Pull todos los eventos del provider del usuario dentro de la ventana,
// dedupe contra lo que ya tenemos, y los inserta en events. Idempotente.
export async function pullCalendarFromProvider(
  userId: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = { userId, provider: "microsoft", pulled: 0, errors: 0, skipped: 0 };

  // 1. Cargar la integración activa.
  const [integration] = await adminDb
    .select()
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, userId),
        eq(calendarIntegrations.provider, "microsoft"),
        isNull(calendarIntegrations.disconnectedAt),
      ),
    )
    .limit(1);
  if (!integration) return summary;

  // 2. Pedir el listado al provider.
  const now = new Date();
  const past = new Date(now.getTime() - PULL_WINDOW_PAST_DAYS * 24 * 60 * 60 * 1000);
  const future = new Date(now.getTime() + PULL_WINDOW_FUTURE_DAYS * 24 * 60 * 60 * 1000);
  let providerEvents: GraphCalendarEvent[];
  try {
    providerEvents = await listCalendarEvents(userId, { from: past, to: future });
  } catch (err) {
    await adminDb
      .update(calendarIntegrations)
      .set({
        lastError: err instanceof Error ? err.message.slice(0, 500) : "unknown",
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(calendarIntegrations.id, integration.id));
    summary.errors++;
    return summary;
  }

  // 3. Para cada evento del provider, upsert en events.
  //    Identificador estable: external_subscription_id = integration.id,
  //    external_uid = e.id (Graph REST id, único por instancia incluyendo
  //    eventos recurrentes — el iCalUId se comparte entre instancias).
  //    El icalUid local lo generamos nosotros (no usamos el del provider)
  //    para no chocar con events_ical_uid_unique que cuenta cada fila.
  let firstEventError: string | null = null;
  for (const e of providerEvents) {
    try {
      // Si está cancelado en el provider, soft-delete acá.
      if (e.isCancelled) {
        await adminDb
          .update(events)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(events.oauthIntegrationId, integration.id),
              eq(events.externalUid, e.id),
              isNull(events.deletedAt),
            ),
          );
        summary.skipped++;
        continue;
      }

      // Defensive: algunos eventos (workflows raros) llegan sin dateTime
      // o con valores vacíos. Skipeamos sin contar como error.
      if (!e.start?.dateTime || !e.end?.dateTime) {
        summary.skipped++;
        continue;
      }
      const startAt = new Date(e.start.dateTime + "Z");
      const endAt = new Date(e.end.dateTime + "Z");
      if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
        summary.skipped++;
        continue;
      }
      const allDay = e.isAllDay;

      // Buscar si ya existe (por subscription + provider event id).
      const [existing] = await adminDb
        .select({ id: events.id, updatedAt: events.updatedAt })
        .from(events)
        .where(
          and(
            eq(events.oauthIntegrationId, integration.id),
            eq(events.externalUid, e.id),
          ),
        )
        .limit(1);

      if (existing) {
        await adminDb
          .update(events)
          .set({
            title: e.subject || "(sin título)",
            description: e.bodyPreview || null,
            location: e.location?.displayName ?? null,
            startAt,
            endAt,
            allDay,
            deletedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(events.id, existing.id));
        summary.skipped++;
      } else {
        await adminDb.insert(events).values({
          firmId: integration.firmId,
          caseId: null,
          title: e.subject || "(sin título)",
          description: e.bodyPreview || null,
          location: e.location?.displayName ?? null,
          startAt,
          endAt,
          allDay,
          // icalUid local generado por nosotros (único por fila).
          icalUid: `${randomUUID()}@sync-microsoft`,
          oauthIntegrationId: integration.id,
          externalUid: e.id,
          createdBy: userId,
        });
        summary.pulled++;
      }
    } catch (err) {
      summary.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      if (!firstEventError) firstEventError = msg.slice(0, 500);
      console.error(`[calendar-sync] error syncing event ${e.id}:`, err);
    }
  }

  // 4. Actualizar el timestamp + último error si hubo. NO limpiamos
  //    lastError si hubo errores per-event — antes los borrábamos a null
  //    y dejábamos al usuario sin pista de qué falló.
  await adminDb
    .update(calendarIntegrations)
    .set({
      lastSyncAt: new Date(),
      lastError: firstEventError,
      updatedAt: new Date(),
    })
    .where(eq(calendarIntegrations.id, integration.id));

  return summary;
}

// Push: crear un evento del firm en el calendario del provider del autor.
// Se llama desde createEventFromChatAction después de insertar local.
// Best-effort: si el push falla loguemos pero NO revertimos el evento local
// (el usuario ya hizo su acción, no queremos romper la UX por un problema
// transitorio del provider; el cron retomará el siguiente día).
export async function pushEventToProvider(
  userId: string,
  eventId: string,
  input: {
    title: string;
    description: string | null;
    location: string | null;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
  },
): Promise<{ ok: boolean; providerEventId?: string; error?: string }> {
  try {
    const [integration] = await adminDb
      .select()
      .from(calendarIntegrations)
      .where(
        and(
          eq(calendarIntegrations.userId, userId),
          eq(calendarIntegrations.provider, "microsoft"),
          isNull(calendarIntegrations.disconnectedAt),
        ),
      )
      .limit(1);
    if (!integration) return { ok: false, error: "no_integration" };

    const created = await createCalendarEvent(userId, {
      subject: input.title,
      body: input.description ?? undefined,
      location: input.location ?? undefined,
      startUtc: input.startAt,
      endUtc: input.endAt,
      allDay: input.allDay,
    } satisfies CreateEventInput);

    // Marcar el evento local con su referencia al provider para poder
    // hacer update/delete después. Usamos el id REST (único por instancia)
    // como externalUid — mismo criterio que el pull.
    await adminDb
      .update(events)
      .set({
        oauthIntegrationId: integration.id,
        externalUid: created.id,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));

    return { ok: true, providerEventId: created.id };
  } catch (err) {
    console.error("[calendar-sync] push failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

// Update remoto. Mismo best-effort. eventId = id local; el lookup
// resuelve el id remoto por external_subscription_id + external_uid.
export async function pushEventUpdateToProvider(
  userId: string,
  eventId: string,
  patch: {
    title?: string;
    description?: string | null;
    location?: string | null;
    startAt?: Date;
    endAt?: Date;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const [row] = await adminDb
      .select({
        externalUid: events.externalUid,
        oauthIntegrationId: events.oauthIntegrationId,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!row?.externalUid || !row.oauthIntegrationId) {
      return { ok: false, error: "not_synced" };
    }
    // El externalUid es el id REST del Graph (no el iCalUId) — podemos
    // usarlo directamente en PATCH/DELETE.
    await updateCalendarEvent(userId, row.externalUid, {
      subject: patch.title,
      body: patch.description ?? undefined,
      location: patch.location ?? undefined,
      startUtc: patch.startAt,
      endUtc: patch.endAt,
    });
    return { ok: true };
  } catch (err) {
    console.error("[calendar-sync] update push failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function pushEventDeleteToProvider(
  userId: string,
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const [row] = await adminDb
      .select({
        externalUid: events.externalUid,
        oauthIntegrationId: events.oauthIntegrationId,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!row?.externalUid || !row.oauthIntegrationId) {
      return { ok: false, error: "not_synced" };
    }
    await deleteCalendarEvent(userId, row.externalUid);
    return { ok: true };
  } catch (err) {
    console.error("[calendar-sync] delete push failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

// Sync para TODAS las integraciones activas. Llamado desde el cron.
export async function syncAllCalendars(): Promise<SyncSummary[]> {
  const integrations = await adminDb
    .select({ userId: calendarIntegrations.userId })
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.provider, "microsoft"),
        isNull(calendarIntegrations.disconnectedAt),
      ),
    );
  const out: SyncSummary[] = [];
  for (const i of integrations) {
    out.push(await pullCalendarFromProvider(i.userId));
  }
  return out;
}

// Helper: quita-warnings de import.
void gte;
void lte;
void isNotNull;
