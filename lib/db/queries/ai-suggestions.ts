// F7 bloque 4 — Queries para la bandeja de sugerencias proactivas (ai_suggestions).
//
// La generación (worker) vive en lib/ai/suggestions.ts; este archivo solo
// expone las operaciones que la UI necesita: listar pending, marcar
// acted/dismissed, obtener contador para el badge.

import "server-only";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { adminDb } from "../admin";
import { withFirm } from "../with-firm";
import {
  aiSuggestions,
  userMutedSuggestionKinds,
  type AiSuggestion,
} from "../schema";

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

// F7+ feedback loop. El usuario marca una sugerencia como útil, no
// relevante, o "no me muestres más de este tipo". Si elige mute_kind,
// se inserta una fila en user_muted_suggestion_kinds y el worker no
// vuelve a generar ese kind para este usuario.
export async function setSuggestionFeedback(
  firmId: string,
  userId: string,
  suggestionId: string,
  feedback: "useful" | "not_relevant" | "mute_kind",
): Promise<{ ok: true; mutedKind?: string } | { ok: false; error: string }> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select({ id: aiSuggestions.id, kind: aiSuggestions.kind })
      .from(aiSuggestions)
      .where(
        and(
          eq(aiSuggestions.id, suggestionId),
          eq(aiSuggestions.userId, userId),
        ),
      )
      .limit(1);
    if (!row) return { ok: false, error: "Sugerencia no encontrada." };

    await tx
      .update(aiSuggestions)
      .set({ feedback, feedbackAt: new Date() })
      .where(eq(aiSuggestions.id, suggestionId));

    // Si silenció el tipo: registralo. El kind a guardar es la "raíz"
    // (sin sufijos como `:2026-05` que usamos para budget warns); pero
    // como guardamos el kind con sufijo en algunos casos, igualar exacto
    // es la opción más conservadora. El worker hace ILIKE para los
    // patrones con `*`.
    let mutedKind: string | undefined;
    if (feedback === "mute_kind") {
      // Use the prefix before ":" so budget warn-70:2026-05 mutes future
      // budget warn-70 (cualquier mes).
      const root = row.kind.split(":")[0] ?? row.kind;
      mutedKind = root;
      await tx
        .insert(userMutedSuggestionKinds)
        .values({ userId, kindPattern: root })
        .onConflictDoNothing();
      // Also dismiss this suggestion + cualquier otra pending del mismo
      // root para que desaparezcan inmediatamente.
      await tx
        .update(aiSuggestions)
        .set({ status: "dismissed", dismissedAt: new Date() })
        .where(
          and(
            eq(aiSuggestions.userId, userId),
            eq(aiSuggestions.status, "pending"),
            sql`${aiSuggestions.kind} LIKE ${root + "%"}`,
          ),
        );
    }
    return { ok: true, mutedKind };
  });
}

// F7+ feedback loop: lista los tipos silenciados por el usuario para
// que pueda re-activarlos desde /configuracion → IA.
export async function listMutedKinds(
  firmId: string,
  userId: string,
): Promise<Array<{ kindPattern: string; mutedAt: Date }>> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select({
        kindPattern: userMutedSuggestionKinds.kindPattern,
        mutedAt: userMutedSuggestionKinds.mutedAt,
      })
      .from(userMutedSuggestionKinds)
      .where(eq(userMutedSuggestionKinds.userId, userId));
    return rows;
  });
}

export async function unmuteKind(
  firmId: string,
  userId: string,
  kindPattern: string,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .delete(userMutedSuggestionKinds)
      .where(
        and(
          eq(userMutedSuggestionKinds.userId, userId),
          eq(userMutedSuggestionKinds.kindPattern, kindPattern),
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
