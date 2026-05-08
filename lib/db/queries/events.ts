import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { cases, events, type Event, type NewEvent } from "../schema";

export async function listEventsInRange(
  firmId: string,
  userId: string,
  range: { start: Date; end: Date },
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        location: events.location,
        startAt: events.startAt,
        endAt: events.endAt,
        allDay: events.allDay,
        attendees: events.attendees,
        caseId: events.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
      })
      .from(events)
      .leftJoin(cases, eq(cases.id, events.caseId))
      .where(
        and(
          isNull(events.deletedAt),
          // Overlap with the range: event.endAt >= range.start AND event.startAt < range.end
          sql`${events.endAt} >= ${range.start}`,
          sql`${events.startAt} < ${range.end}`,
        ),
      )
      .orderBy(asc(events.startAt));
  });
}

export async function listEventsForCase(
  firmId: string,
  userId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(events)
      .where(
        and(
          eq(events.caseId, caseId),
          isNull(events.deletedAt),
        ),
      )
      .orderBy(asc(events.startAt));
  });
}

// Detect conflicting events for a user (BRIEF / maestro 3.7). A conflict is
// any non-deleted event whose [startAt, endAt) range overlaps the proposed
// window AND whose attendees array contains the user. Excludes a specific
// id (used when editing — don't conflict with self).
export async function findConflictingEvents(
  firmId: string,
  userId: string,
  args: { start: Date; end: Date; userIds: string[]; excludeId?: string },
) {
  if (args.userIds.length === 0) return [];
  return withFirm(firmId, userId, async (tx) => {
    const conds = [
      isNull(events.deletedAt),
      sql`${events.endAt} > ${args.start}`,
      sql`${events.startAt} < ${args.end}`,
      sql`${events.attendees} && ${args.userIds}::text[]`,
    ];
    if (args.excludeId) conds.push(sql`${events.id} <> ${args.excludeId}`);
    return tx
      .select({
        id: events.id,
        title: events.title,
        startAt: events.startAt,
        endAt: events.endAt,
        attendees: events.attendees,
      })
      .from(events)
      .where(and(...conds))
      .orderBy(asc(events.startAt))
      .limit(20);
  });
}

export async function createEvent(
  firmId: string,
  userId: string,
  data: Omit<NewEvent, "firmId" | "id" | "icalUid" | "createdAt" | "updatedAt" | "deletedAt" | "createdBy">,
): Promise<Event> {
  return withFirm(firmId, userId, async (tx) => {
    const icalUid = `${crypto.randomUUID()}@ldp-legal-suite`;
    const [row] = await tx
      .insert(events)
      .values({
        ...data,
        firmId,
        createdBy: userId,
        icalUid,
      })
      .returning();
    if (!row) throw new Error("createEvent: insert returned no row");
    return row;
  });
}

export async function updateEvent(
  firmId: string,
  userId: string,
  eventId: string,
  data: Partial<Omit<NewEvent, "firmId" | "id" | "icalUid" | "createdAt" | "createdBy">>,
): Promise<Event | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(events)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .returning();
    return row ?? null;
  });
}

export async function softDeleteEvent(
  firmId: string,
  userId: string,
  eventId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(events)
      .set({ deletedAt: new Date() })
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .returning({ id: events.id });
    return !!row;
  });
}
