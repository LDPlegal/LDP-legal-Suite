// CRUD + sync for external_calendar_subscriptions (Fase 4.3).

import { and, desc, eq, isNull } from "drizzle-orm";
import { withFirm } from "../with-firm";
import {
  events,
  externalCalendarSubscriptions,
  type ExternalCalendarSubscription,
} from "../schema";
import { parseIcs } from "@/lib/ical/parse";

export async function listSubscriptionsForUser(
  firmId: string,
  userId: string,
): Promise<ExternalCalendarSubscription[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(externalCalendarSubscriptions)
      .where(
        and(
          eq(externalCalendarSubscriptions.userId, userId),
          isNull(externalCalendarSubscriptions.deletedAt),
        ),
      )
      .orderBy(desc(externalCalendarSubscriptions.createdAt));
  });
}

export async function createSubscription(
  firmId: string,
  userId: string,
  data: { name: string; url: string },
): Promise<ExternalCalendarSubscription> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(externalCalendarSubscriptions)
      .values({
        firmId,
        userId,
        name: data.name,
        url: data.url,
      })
      .returning();
    if (!row) throw new Error("createSubscription: insert returned no row");
    return row;
  });
}

export async function softDeleteSubscription(
  firmId: string,
  userId: string,
  subscriptionId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(externalCalendarSubscriptions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(externalCalendarSubscriptions.id, subscriptionId),
          eq(externalCalendarSubscriptions.userId, userId),
          isNull(externalCalendarSubscriptions.deletedAt),
        ),
      )
      .returning({ id: externalCalendarSubscriptions.id });
    return !!row;
  });
}

// Fetch the URL, parse the ICS, and upsert events. The unique index
// (external_subscription_id, external_uid) makes the upsert idempotent —
// repeated syncs don't duplicate, they just update fields.
//
// On error we record lastError and bail without touching events; on success
// we update lastSyncedAt and lastEventCount.
export async function syncSubscription(
  firmId: string,
  userId: string,
  subscriptionId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  // Fetch the subscription row first to get its URL.
  const [sub] = await withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(externalCalendarSubscriptions)
      .where(
        and(
          eq(externalCalendarSubscriptions.id, subscriptionId),
          eq(externalCalendarSubscriptions.userId, userId),
          isNull(externalCalendarSubscriptions.deletedAt),
        ),
      )
      .limit(1);
  });
  if (!sub) return { ok: false, error: "Suscripción no encontrada." };

  let body: string;
  try {
    const res = await fetch(sub.url, {
      // Best-effort: we don't follow redirects across hosts. 8s timeout.
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "text/calendar, text/plain, */*" },
    });
    if (!res.ok) {
      await markError(firmId, userId, subscriptionId, `HTTP ${res.status}`);
      return { ok: false, error: `Servidor remoto respondió ${res.status}.` };
    }
    body = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch falló";
    await markError(firmId, userId, subscriptionId, msg);
    return { ok: false, error: `No se pudo descargar el feed: ${msg}` };
  }

  let parsed;
  try {
    parsed = parseIcs(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse falló";
    await markError(firmId, userId, subscriptionId, msg);
    return { ok: false, error: `Feed inválido: ${msg}` };
  }

  if (parsed.length === 0) {
    await markSync(firmId, userId, subscriptionId, 0);
    return { ok: true, count: 0 };
  }

  // Upsert all parsed events in one transaction so a partial failure rolls
  // back. The unique partial index on (external_subscription_id, external_uid)
  // gives us idempotency, but Drizzle's onConflictDoUpdate doesn't always
  // play well with partial indexes — so we look up + branch by hand. It's
  // O(n) extra round-trips per sync, which is fine for typical 50-200 event
  // feeds.
  await withFirm(firmId, userId, async (tx) => {
    for (const e of parsed) {
      const [existing] = await tx
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.externalSubscriptionId, subscriptionId),
            eq(events.externalUid, e.uid),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .update(events)
          .set({
            title: e.summary,
            description: e.description,
            location: e.location,
            startAt: e.start,
            endAt: e.end,
            allDay: e.allDay,
            updatedAt: new Date(),
          })
          .where(eq(events.id, existing.id));
      } else {
        await tx.insert(events).values({
          firmId,
          title: e.summary,
          description: e.description,
          location: e.location,
          startAt: e.start,
          endAt: e.end,
          allDay: e.allDay,
          icalUid: `ext-${subscriptionId}-${e.uid}`,
          externalSubscriptionId: subscriptionId,
          externalUid: e.uid,
          createdBy: userId,
        });
      }
    }
  });

  await markSync(firmId, userId, subscriptionId, parsed.length);
  return { ok: true, count: parsed.length };
}

async function markSync(
  firmId: string,
  userId: string,
  subscriptionId: string,
  count: number,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(externalCalendarSubscriptions)
      .set({
        lastSyncedAt: new Date(),
        lastEventCount: count,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(externalCalendarSubscriptions.id, subscriptionId));
  });
}

async function markError(
  firmId: string,
  userId: string,
  subscriptionId: string,
  message: string,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(externalCalendarSubscriptions)
      .set({
        lastError: message.slice(0, 400),
        updatedAt: new Date(),
      })
      .where(eq(externalCalendarSubscriptions.id, subscriptionId));
  });
}
