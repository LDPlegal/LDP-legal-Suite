import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import {
  cases,
  timeEntries,
  users,
  type NewTimeEntry,
  type TimeEntry,
} from "../schema";

export async function listTimeEntriesForCase(
  firmId: string,
  userId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: timeEntries.id,
        userId: timeEntries.userId,
        userName: users.name,
        description: timeEntries.description,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        durationSeconds: timeEntries.durationSeconds,
        billable: timeEntries.billable,
        status: timeEntries.status,
        approvedAt: timeEntries.approvedAt,
      })
      .from(timeEntries)
      .leftJoin(users, eq(users.id, timeEntries.userId))
      .where(
        and(
          eq(timeEntries.caseId, caseId),
          isNull(timeEntries.deletedAt),
        ),
      )
      .orderBy(desc(timeEntries.startedAt));
  });
}

export async function createTimeEntry(
  firmId: string,
  userId: string,
  data: Omit<
    NewTimeEntry,
    "firmId" | "id" | "durationSeconds" | "createdAt" | "updatedAt" | "deletedAt"
  >,
): Promise<TimeEntry> {
  const startedAt = new Date(data.startedAt);
  const endedAt = new Date(data.endedAt);
  const durationSeconds = Math.max(
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    0,
  );
  if (durationSeconds === 0) {
    throw new Error("createTimeEntry: end must be after start");
  }
  return withFirm(firmId, userId, async (tx) => {
    // Resolve the most specific applicable rate at start time (Fase 6).
    // We snapshot the hourly rate so historical entries keep their value
    // even when current rates change. Skip if caller already passed one
    // (e.g. fixed-fee or contingency cases set 0 explicitly).
    let hourlyRateSnapshot = data.hourlyRateSnapshot ?? null;
    if (hourlyRateSnapshot == null && data.caseId && data.userId) {
      try {
        const { cases } = await import("../schema");
        const { eq, and: andOp, isNull } = await import("drizzle-orm");
        const [caseRow] = await tx
          .select({ matterType: cases.matterType, clientId: cases.clientId })
          .from(cases)
          .where(andOp(eq(cases.id, data.caseId), isNull(cases.deletedAt)))
          .limit(1);
        if (caseRow) {
          const { resolveRate } = await import("./rates");
          const rate = await resolveRate(firmId, userId, {
            forUserId: data.userId,
            matterType: caseRow.matterType,
            clientId: caseRow.clientId,
            asOf: startedAt,
          });
          if (rate) hourlyRateSnapshot = rate.hourlyRate;
        }
      } catch {
        // Best-effort. Fall back to user.hourly_rate at billing time.
      }
    }

    const [row] = await tx
      .insert(timeEntries)
      .values({
        ...data,
        firmId,
        durationSeconds,
        hourlyRateSnapshot,
      })
      .returning();
    if (!row) throw new Error("createTimeEntry: insert returned no row");
    return row;
  });
}

export async function approveTimeEntry(
  firmId: string,
  userId: string,
  entryId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(timeEntries)
      .set({
        status: "approved",
        approvedById: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timeEntries.id, entryId),
          eq(timeEntries.status, "draft"),
          isNull(timeEntries.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  });
}

export async function softDeleteTimeEntry(
  firmId: string,
  userId: string,
  entryId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(timeEntries)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(timeEntries.id, entryId),
          isNull(timeEntries.deletedAt),
          // Only the owner OR a partner/admin can delete; checked at action level too.
        ),
      )
      .returning({ id: timeEntries.id });
    return !!row;
  });
}

// Pivot helper for the weekly timesheet view: groups duration_seconds by
// (caseId, dayOfWeek). Returns a map keyed by case id with arrays of 7 numbers.
export async function weeklyTimesheet(
  firmId: string,
  userId: string,
  weekStart: Date,
) {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select({
        caseId: timeEntries.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
        startedAt: timeEntries.startedAt,
        durationSeconds: timeEntries.durationSeconds,
      })
      .from(timeEntries)
      .leftJoin(cases, eq(cases.id, timeEntries.caseId))
      .where(
        and(
          eq(timeEntries.userId, userId),
          isNull(timeEntries.deletedAt),
          sql`${timeEntries.startedAt} >= ${weekStart}`,
          sql`${timeEntries.startedAt} < ${weekEnd}`,
        ),
      )
      .orderBy(asc(timeEntries.startedAt));

    const byCase = new Map<
      string,
      { caseId: string; caseCode: string | null; caseTitle: string | null; days: number[] }
    >();
    for (const r of rows) {
      const existing = byCase.get(r.caseId) ?? {
        caseId: r.caseId,
        caseCode: r.caseCode,
        caseTitle: r.caseTitle,
        days: [0, 0, 0, 0, 0, 0, 0],
      };
      const dayIdx = Math.floor(
        (new Date(r.startedAt).getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000),
      );
      const idx = Math.max(0, Math.min(6, dayIdx));
      existing.days[idx] = (existing.days[idx] ?? 0) + r.durationSeconds;
      byCase.set(r.caseId, existing);
    }
    return Array.from(byCase.values());
  });
}
