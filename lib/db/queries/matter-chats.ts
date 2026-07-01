// Per-case chat persistence (F7).
//
// Why a dedicated module: chats accumulate fast (50+ messages per active
// case is normal) and the read path is hot — every keystroke in the panel
// hits a load. Index on (firm_id, case_id, created_at) covers the typical
// query (load oldest→newest for a case).

import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import {
  cases,
  documents,
  events,
  matterChats,
  matterContexts,
  notes,
  timeEntries,
  type MatterChat,
} from "../schema";

export async function listChatMessages(
  firmId: string,
  userId: string,
  caseId: string,
  opts: { limit?: number; before?: Date } = {},
): Promise<MatterChat[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  return withFirm(firmId, userId, async (tx) => {
    // Fase 13: chat individual. Cada usuario ve SOLO su conversación
    // (owner_id = él). Los mensajes viejos del chat compartido (owner_id
    // NULL) quedan ocultos — no se borran, pero ya no se muestran.
    const conds = [
      eq(matterChats.caseId, caseId),
      eq(matterChats.ownerId, userId),
    ];
    if (opts.before) {
      conds.push(sql`${matterChats.createdAt} < ${opts.before}`);
    }
    return tx
      .select()
      .from(matterChats)
      .where(and(...conds))
      .orderBy(asc(matterChats.createdAt))
      .limit(limit);
  });
}

export async function appendChatMessage(
  firmId: string,
  userId: string,
  data: {
    caseId: string;
    role: "user" | "assistant" | "system";
    content: string;
    toolCalls?: Array<Record<string, unknown>>;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    createdBy?: string | null;
  },
): Promise<MatterChat> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(matterChats)
      .values({
        firmId,
        caseId: data.caseId,
        role: data.role,
        content: data.content,
        toolCalls: data.toolCalls ?? null,
        inputTokens: data.inputTokens ?? null,
        outputTokens: data.outputTokens ?? null,
        cacheReadTokens: data.cacheReadTokens ?? null,
        cacheCreationTokens: data.cacheCreationTokens ?? null,
        createdBy: data.createdBy ?? userId,
        // Fase 13: dueño del chat individual — cada usuario tiene el suyo.
        ownerId: userId,
      })
      .returning();
    if (!row) throw new Error("appendChatMessage: insert returned no row");
    return row;
  });
}

// Truncate the chat history kept in active LLM context so it doesn't grow
// unbounded. Returns a "tail" suitable for sending to the model: last N
// messages, with the oldest summarized into a single system note when over
// the limit. The DB row store is untouched — this only shapes the LLM input.
export function truncateForContext(
  messages: MatterChat[],
  opts: { keepLast: number },
): MatterChat[] {
  if (messages.length <= opts.keepLast) return messages;
  return messages.slice(-opts.keepLast);
}

// =============================================================================
// matter_contexts — narrative summary updated incrementally
// =============================================================================

// Load (and lazy-initialize) the matter context row for a case.
export async function getOrCreateMatterContext(
  firmId: string,
  userId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(matterContexts)
      .where(eq(matterContexts.caseId, caseId))
      .limit(1);
    if (existing) return existing;
    const [created] = await tx
      .insert(matterContexts)
      .values({ firmId, caseId, summary: "", stats: {}, needsRefresh: true })
      .returning();
    if (!created) throw new Error("getOrCreateMatterContext: insert failed");
    return created;
  });
}

export async function markContextStale(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .insert(matterContexts)
      .values({ firmId, caseId, needsRefresh: true })
      .onConflictDoUpdate({
        target: matterContexts.caseId,
        set: { needsRefresh: true, updatedAt: new Date() },
      });
  });
}

export async function saveMatterContext(
  firmId: string,
  userId: string,
  caseId: string,
  data: {
    summary: string;
    stats: MatterContextStats;
    tokenCount: number;
  },
): Promise<void> {
  // Drizzle's jsonb $type narrows nullable string → undefined; coerce here
  // so lastActivityAt matches the schema's declared shape (`string | undefined`).
  const stats = {
    docCount: data.stats.docCount,
    eventCount: data.stats.eventCount,
    noteCount: data.stats.noteCount,
    timeEntryCount: data.stats.timeEntryCount,
    lastActivityAt: data.stats.lastActivityAt ?? undefined,
  };
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .insert(matterContexts)
      .values({
        firmId,
        caseId,
        summary: data.summary,
        stats,
        tokenCount: data.tokenCount,
        needsRefresh: false,
        refreshedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: matterContexts.caseId,
        set: {
          summary: data.summary,
          stats,
          tokenCount: data.tokenCount,
          needsRefresh: false,
          refreshedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  });
}

export type MatterContextStats = {
  docCount: number;
  eventCount: number;
  noteCount: number;
  timeEntryCount: number;
  lastActivityAt: string | null;
};

// Compute the stats shown in the chat header. Cheap COUNT queries; the
// expensive narrative summary is rebuilt by the LLM separately when
// needsRefresh = true.
export async function computeMatterStats(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<MatterContextStats> {
  return withFirm(firmId, userId, async (tx) => {
    const [[d], [e], [n], [t], [c]] = await Promise.all([
      tx
        .select({ n: count() })
        .from(documents)
        .where(
          and(
            eq(documents.caseId, caseId),
            sql`${documents.deletedAt} IS NULL`,
          ),
        ),
      tx
        .select({ n: count() })
        .from(events)
        .where(
          and(eq(events.caseId, caseId), sql`${events.deletedAt} IS NULL`),
        ),
      tx
        .select({ n: count() })
        .from(notes)
        .where(
          and(eq(notes.caseId, caseId), sql`${notes.deletedAt} IS NULL`),
        ),
      tx
        .select({ n: count() })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.caseId, caseId),
            sql`${timeEntries.deletedAt} IS NULL`,
          ),
        ),
      tx
        .select({ updatedAt: cases.updatedAt })
        .from(cases)
        .where(eq(cases.id, caseId))
        .limit(1),
    ]);
    return {
      docCount: d?.n ?? 0,
      eventCount: e?.n ?? 0,
      noteCount: n?.n ?? 0,
      timeEntryCount: t?.n ?? 0,
      lastActivityAt: c?.updatedAt ? c.updatedAt.toISOString() : null,
    };
  });
}

// Convenience: count user messages in the chat (analytics).
export async function countChatMessages(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<{ user: number; assistant: number }> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select({ role: matterChats.role, n: count() })
      .from(matterChats)
      .where(eq(matterChats.caseId, caseId))
      .groupBy(matterChats.role);
    let user = 0;
    let assistant = 0;
    for (const r of rows) {
      if (r.role === "user") user = r.n;
      else if (r.role === "assistant") assistant = r.n;
    }
    return { user, assistant };
  });
}

// Used by the chat sheet to position the scroll on the most recent message.
export async function getLatestChatMessage(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<MatterChat | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(matterChats)
      .where(
        and(
          eq(matterChats.caseId, caseId),
          eq(matterChats.ownerId, userId),
        ),
      )
      .orderBy(desc(matterChats.createdAt))
      .limit(1);
    return row ?? null;
  });
}
