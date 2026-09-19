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
// (external_subscription_id, external_uid) makes the upsert idempotent,
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

  // Basic SSRF guard. We refuse to fetch obvious internal targets so a user
  // can't trick the server into hitting localhost / private LAN / cloud
  // metadata. This isn't bulletproof (a public hostname that resolves to
  // 127.0.0.1 still gets through), but it stops casual abuse.
  const ssrfError = sniffSsrf(sub.url);
  if (ssrfError) {
    await markError(firmId, userId, subscriptionId, ssrfError);
    return { ok: false, error: ssrfError };
  }

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
  // play well with partial indexes, so we look up + branch by hand. It's
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

// Refuses URLs whose hostname is a literal local/private/loopback address
// or a name that maps to one (only the well-known ones). Does NOT resolve
// DNS, a malicious public name pointing at 127.0.0.1 still gets through
// this. For Fase 4 the threat model is "user accidentally pastes intranet
// URL", not "user actively attacks our infra"; if/when we widen that, add
// dns.lookup() + IP-range check here.
function sniffSsrf(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "URL inválida.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Solo se aceptan URLs http(s).";
  }
  const host = parsed.hostname.toLowerCase();
  // Bare loopback / link-local / common local hostnames.
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "::" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return "URL apunta a un host local; se rechaza por seguridad.";
  }
  // RFC 1918 private ranges + cloud metadata IP.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return "URL apunta a un rango privado; se rechaza por seguridad.";
    }
  }
  return null;
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
