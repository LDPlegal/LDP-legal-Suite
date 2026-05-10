"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled, AiNotConfiguredError } from "@/lib/ai";
import { summarizeCase } from "@/lib/ai/case-summary";
import { createNote } from "@/lib/db/queries/notes";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({ caseId: z.string().uuid() });
const SaveSchema = z.object({
  caseId: z.string().uuid(),
  text: z.string().min(1),
});

export type ResumirCasoState =
  | { ok: true; text: string; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; error: string };

export async function resumirCasoAction(
  _prev: ResumirCasoState | undefined,
  formData: FormData,
): Promise<ResumirCasoState> {
  const user = await requireUser();
  if (!isAiEnabled()) {
    return {
      ok: false,
      error: "La integración con Claude no está configurada. Ve a Configuración → IA.",
    };
  }
  const parsed = Schema.safeParse({ caseId: formData.get("caseId") });
  if (!parsed.success) {
    return { ok: false, error: "Caso inválido." };
  }
  try {
    const result = await summarizeCase(user.firmId, user.userId, parsed.data.caseId);
    return { ok: true, text: result.text, usage: result.usage };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo generar el resumen.",
    };
  }
}

// Convert the generated summary into a note attached to the case so the
// partner can keep / edit it instead of regenerating every time.
export async function guardarResumenComoNotaAction(
  formData: FormData,
): Promise<{ ok: true; noteId: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = SaveSchema.safeParse({
    caseId: formData.get("caseId"),
    text: formData.get("text"),
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  // Wrap the markdown text in a minimal Tiptap doc so it renders in the
  // notes editor. We store as a single paragraph block; the user can
  // re-open and re-format if needed.
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: parsed.data.text }],
      },
    ],
  };

  const note = await createNote(user.firmId, user.userId, {
    caseId: parsed.data.caseId,
    title: `Resumen IA — ${new Date().toLocaleDateString("es-DO")}`,
    content,
  });
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "note",
    entityId: note.id,
    caseId: parsed.data.caseId,
    action: "created",
    summary: "Guardó resumen IA como nota",
  });
  revalidatePath(`/casos/${parsed.data.caseId}`);
  return { ok: true, noteId: note.id };
}
