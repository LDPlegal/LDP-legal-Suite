"use server";

import { requireUser } from "@/lib/auth/session";
import { chatWithContext } from "@/lib/ai/chat";
import type { AiMessage } from "@/lib/ai/claude";
import { gatherCaseContext, buildPrompt as buildCasePrompt } from "@/lib/ai/case-summary";
import { getDocumentById } from "@/lib/db/queries/documents";

export type ChatState =
  | { ok: true; text: string; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; error: string };

export async function chatAction(
  type: "document" | "case",
  id: string,
  history: AiMessage[],
): Promise<ChatState> {
  const user = await requireUser();

  try {
    let contextText = "";

    if (type === "case") {
      const ctx = await gatherCaseContext(user.firmId, user.userId, id);
      if (!ctx) return { ok: false, error: "Caso no encontrado o sin acceso." };
      contextText = buildCasePrompt(ctx);
    } else if (type === "document") {
      const doc = await getDocumentById(user.firmId, user.userId, id);
      if (!doc) return { ok: false, error: "Documento no encontrado o sin acceso." };
      if (!doc.ocrText) return { ok: false, error: "El documento no tiene texto OCR extraído." };
      contextText = `Documento:\n\n${doc.ocrText}`;
    }

    const result = await chatWithContext(contextText, history, {
      firmId: user.firmId,
      userId: user.userId,
      feature: "chat",
    });

    return { ok: true, text: result.text, usage: result.usage };
  } catch (err: unknown) {
    console.error("[chatAction] Error:", err);
    return { ok: false, error: "Error al procesar el mensaje con Claude." };
  }
}
