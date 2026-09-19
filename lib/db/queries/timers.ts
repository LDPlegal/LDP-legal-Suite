import { and, eq, isNull, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import {
  activeTimers,
  cases,
  timeEntries,
  type ActiveTimer,
} from "../schema";

// Stale threshold: BRIEF / maestro § 9.4, if no heartbeat for >15 min, the
// timer is considered stale and the user should decide whether to keep or
// discard it on next visit.
export const STALE_THRESHOLD_MINUTES = 15;

export async function getActiveTimer(
  firmId: string,
  userId: string,
): Promise<(ActiveTimer & { caseCode: string | null; caseTitle: string | null }) | null> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select({
        userId: activeTimers.userId,
        firmId: activeTimers.firmId,
        caseId: activeTimers.caseId,
        description: activeTimers.description,
        startedAt: activeTimers.startedAt,
        lastHeartbeatAt: activeTimers.lastHeartbeatAt,
        caseCode: cases.code,
        caseTitle: cases.title,
      })
      .from(activeTimers)
      .leftJoin(cases, eq(cases.id, activeTimers.caseId))
      .where(eq(activeTimers.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function startTimer(
  firmId: string,
  userId: string,
  data: { caseId: string; description?: string | null },
): Promise<ActiveTimer> {
  return withFirm(firmId, userId, async (tx) => {
    // Replace any existing timer atomically, one per user (PK on user_id).
    const [row] = await tx
      .insert(activeTimers)
      .values({
        userId,
        firmId,
        caseId: data.caseId,
        description: data.description ?? null,
      })
      .onConflictDoUpdate({
        target: activeTimers.userId,
        set: {
          firmId,
          caseId: data.caseId,
          description: data.description ?? null,
          startedAt: sql`now()`,
          lastHeartbeatAt: sql`now()`,
        },
      })
      .returning();
    if (!row) throw new Error("startTimer: insert returned no row");
    return row;
  });
}

export async function heartbeatTimer(
  firmId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx
      .update(activeTimers)
      .set({ lastHeartbeatAt: sql`now()` })
      .where(eq(activeTimers.userId, userId))
      .returning({ userId: activeTimers.userId });
    return { ok: result.length > 0 };
  });
}

// Stop the active timer and write a `time_entries` row for the elapsed
// duration. Returns the new entry. If `useUntil` is provided (typically the
// stale recovery flow), use that as the end time; otherwise use NOW().
export async function stopTimer(
  firmId: string,
  userId: string,
  options?: { useUntil?: Date; description?: string | null; billable?: boolean },
) {
  return withFirm(firmId, userId, async (tx) => {
    const [active] = await tx
      .select()
      .from(activeTimers)
      .where(eq(activeTimers.userId, userId))
      .limit(1);
    if (!active) return null;

    const endedAt = options?.useUntil ?? new Date();
    const startedAt = active.startedAt;
    const durationSeconds = Math.max(
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
      0,
    );

    const description = options?.description ?? active.description;
    const billable = options?.billable ?? true;

    const [entry] = await tx
      .insert(timeEntries)
      .values({
        firmId,
        caseId: active.caseId,
        userId,
        description,
        startedAt,
        endedAt,
        durationSeconds,
        billable,
        status: "draft",
      })
      .returning();

    await tx.delete(activeTimers).where(eq(activeTimers.userId, userId));

    return entry ?? null;
  });
}

export async function discardTimer(firmId: string, userId: string): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx
      .delete(activeTimers)
      .where(eq(activeTimers.userId, userId))
      .returning({ userId: activeTimers.userId });
    return result.length > 0;
  });
}

export function isStale(t: { lastHeartbeatAt: Date }, now: Date = new Date()): boolean {
  const diffMin = (now.getTime() - new Date(t.lastHeartbeatAt).getTime()) / 60_000;
  return diffMin > STALE_THRESHOLD_MINUTES;
}

export async function listMyTimeEntries(
  firmId: string,
  userId: string,
  opts: { limit?: number; from?: Date; to?: Date } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  return withFirm(firmId, userId, async (tx) => {
    const conds = [
      eq(timeEntries.userId, userId),
      isNull(timeEntries.deletedAt),
    ];
    if (opts.from) conds.push(sql`${timeEntries.startedAt} >= ${opts.from}`);
    if (opts.to) conds.push(sql`${timeEntries.startedAt} < ${opts.to}`);
    return tx
      .select({
        id: timeEntries.id,
        caseId: timeEntries.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
        description: timeEntries.description,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        durationSeconds: timeEntries.durationSeconds,
        billable: timeEntries.billable,
        status: timeEntries.status,
      })
      .from(timeEntries)
      .leftJoin(cases, eq(cases.id, timeEntries.caseId))
      .where(and(...conds))
      .orderBy(sql`${timeEntries.startedAt} desc`)
      .limit(limit);
  });
}
