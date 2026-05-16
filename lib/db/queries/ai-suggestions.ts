// F7 bloque 4 — Queries para la bandeja de sugerencias proactivas (ai_suggestions).
//
// La generación (worker) vive en lib/ai/suggestions.ts; este archivo solo
// expone las operaciones que la UI necesita: listar pending, marcar
// acted/dismissed, obtener contador para el badge.

import "server-only";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { adminDb } from "../admin";
import { withFirm } from "../with-firm";
import { aiSuggestions, type AiSuggestion } from "../schema";

export async function listPendingSuggestions(
  firmId: string,
  userId: string,
  opts: { limit?: number } = {},
): Promise<AiSuggestion[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(aiSuggestions)
      .where(
        and(
          eq(aiSuggestions.userId, userId),
          eq(aiSuggestions.status, "pending"),
          // Filter out expired ones too (worker will clean them up but a
          // user opening the inbox the moment they expire shouldn't see them).
          or(
            isNull(aiSuggestions.expiresAt),
            sql`${aiSuggestions.expiresAt} > now()`,
          ),
        ),
      )
      .orderBy(desc(aiSuggestions.severity), desc(aiSuggestions.createdAt))
      .limit(limit);
  });
}

export async function countPendingSuggestions(
  firmId: string,
  userId: string,
): Promise<number> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(aiSuggestions)
      .where(
        and(
          eq(aiSuggestions.userId, userId),
          eq(aiSuggestions.status, "pending"),
          or(
            isNull(aiSuggestions.expiresAt),
            sql`${aiSuggestions.expiresAt} > now()`,
          ),
        ),
      );
    return row?.count ?? 0;
  });
}

export async function dismissSuggestion(
  firmId: string,
  userId: string,
  suggestionId: string,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(aiSuggestions)
      .set({ status: "dismissed", dismissedAt: new Date() })
      .where(
        and(
          eq(aiSuggestions.id, suggestionId),
          eq(aiSuggestions.userId, userId),
          eq(aiSuggestions.status, "pending"),
        ),
      );
  });
}

export async function ackSuggestion(
  firmId: string,
  userId: string,
  suggestionId: string,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(aiSuggestions)
      .set({ status: "acted", actedAt: new Date() })
      .where(
        and(
          eq(aiSuggestions.id, suggestionId),
          eq(aiSuggestions.userId, userId),
          eq(aiSuggestions.status, "pending"),
        ),
      );
  });
}

// Worker-side helper: cleans up suggestions whose expiresAt has passed.
// Idempotent. Called from the cron sweeper.
export async function purgeExpiredSuggestions(): Promise<number> {
  const result = await adminDb
    .update(aiSuggestions)
    .set({ status: "dismissed", dismissedAt: new Date() })
    .where(
      and(
        eq(aiSuggestions.status, "pending"),
        lt(aiSuggestions.expiresAt, new Date()),
      ),
    )
    .returning({ id: aiSuggestions.id });
  return result.length;
}
