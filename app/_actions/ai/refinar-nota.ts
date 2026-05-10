"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled, AiNotConfiguredError } from "@/lib/ai";
import { refineNote } from "@/lib/ai/note-assist";
import { getCaseById } from "@/lib/db/queries/cases";

const Schema = z.object({
  caseId: z.string().uuid(),
  noteTitle: z.string().max(200).nullable().optional(),
  // Tiptap JSON document arrives as a string from the form.
  content: z.string().min(1).max(200_000),
});

export type RefinarNotaState =
  | { ok: true; text: string; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; error: string };

export async function refinarNotaAction(
  input: { caseId: string; noteTitle: string | null; content: string },
): Promise<RefinarNotaState> {
  const user = await requireUser();
  if (!isAiEnabled()) {
    return {
      ok: false,
      error: "La integración con Claude no está configurada. Ve a Configuración → IA.",
    };
  }
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  // Verify the case belongs to the user's firm before sending content to
  // the AI provider — defense in depth, even though Tiptap content is
  // user-supplied.
  const caso = await getCaseById(user.firmId, user.userId, parsed.data.caseId);
  if (!caso) return { ok: false, error: "Caso no encontrado." };

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(parsed.data.content);
  } catch {
    return { ok: false, error: "Contenido inválido." };
  }

  try {
    const result = await refineNote({
      caseTitle: caso.case.title,
      noteTitle: parsed.data.noteTitle ?? null,
      content: parsedContent,
    });
    return { ok: true, text: result.text, usage: result.usage };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo refinar la nota.",
    };
  }
}
