"use server";

// F7 bloque 4 — Actions para la bandeja de sugerencias proactivas IA.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  ackSuggestion,
  countPendingSuggestions,
  dismissSuggestion,
  listMutedKinds,
  listPendingSuggestions,
  setSuggestionFeedback,
  unmuteKind,
} from "@/lib/db/queries/ai-suggestions";

export async function fetchSuggestions() {
  const user = await requireUser();
  const [items, count] = await Promise.all([
    listPendingSuggestions(user.firmId, user.userId, { limit: 30 }),
    countPendingSuggestions(user.firmId, user.userId),
  ]);
  return { items, count };
}

const IdSchema = z.string().uuid();

export async function descartarSugerenciaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = IdSchema.parse(formData.get("suggestionId"));
  await dismissSuggestion(user.firmId, user.userId, id);
  revalidatePath("/dashboard");
}

export async function aceptarSugerenciaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = IdSchema.parse(formData.get("suggestionId"));
  await ackSuggestion(user.firmId, user.userId, id);
  revalidatePath("/dashboard");
}

const FeedbackSchema = z.enum(["useful", "not_relevant", "mute_kind"]);

export async function feedbackSugerenciaAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const id = IdSchema.parse(formData.get("suggestionId"));
  const feedback = FeedbackSchema.parse(formData.get("feedback"));
  const r = await setSuggestionFeedback(user.firmId, user.userId, id, feedback);
  revalidatePath("/dashboard");
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

const KindSchema = z.string().trim().min(1).max(80);

export async function listMutedKindsAction(): Promise<
  Array<{ kindPattern: string; mutedAt: string }>
> {
  const user = await requireUser();
  const rows = await listMutedKinds(user.firmId, user.userId);
  return rows.map((r) => ({ kindPattern: r.kindPattern, mutedAt: r.mutedAt.toISOString() }));
}

export async function unmuteKindAction(
  formData: FormData,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const kind = KindSchema.parse(formData.get("kindPattern"));
  await unmuteKind(user.firmId, user.userId, kind);
  revalidatePath("/configuracion");
  revalidatePath("/dashboard");
  return { ok: true };
}
