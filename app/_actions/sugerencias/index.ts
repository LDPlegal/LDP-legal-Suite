"use server";

// F7 bloque 4 — Actions para la bandeja de sugerencias proactivas IA.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  ackSuggestion,
  countPendingSuggestions,
  dismissSuggestion,
  listPendingSuggestions,
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
