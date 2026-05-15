"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled, AiNotConfiguredError } from "@/lib/ai";
import { runMatterChatTurn } from "@/lib/ai/matter-chat";
import { getCaseById } from "@/lib/db/queries/cases";
import { listChatMessages } from "@/lib/db/queries/matter-chats";

const Schema = z.object({
  caseId: z.string().uuid(),
  message: z.string().trim().min(1).max(8000),
});

export type SendChatState =
  | {
      ok: true;
      assistantMessageId: string;
      assistantText: string;
      toolUses: Array<{ id: string; name: string; input: unknown }>;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
      };
    }
  | { ok: false; error: string };

export async function sendChatMessageAction(input: {
  caseId: string;
  message: string;
}): Promise<SendChatState> {
  const user = await requireUser();
  if (!isAiEnabled()) {
    return {
      ok: false,
      error: "La IA no está configurada. Pídele al admin que active la integración con Claude.",
    };
  }
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Mensaje inválido o vacío." };
  }

  // Verify the case exists in this firm before we send anything to the LLM.
  // Belt-and-suspenders even though listChatMessages is firm-scoped via RLS.
  const caso = await getCaseById(user.firmId, user.userId, parsed.data.caseId);
  if (!caso) {
    return { ok: false, error: "Caso no encontrado o sin acceso." };
  }

  try {
    const out = await runMatterChatTurn({
      firmId: user.firmId,
      userId: user.userId,
      caseId: parsed.data.caseId,
      userMessage: parsed.data.message,
      // tools will be filled in by future blocks (generate_document, create_event)
    });
    revalidatePath(`/casos/${parsed.data.caseId}`);
    return {
      ok: true,
      assistantMessageId: out.assistantMessage.id,
      assistantText: out.assistantMessage.content,
      toolUses: out.toolUses,
      usage: out.usage,
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al procesar tu mensaje.",
    };
  }
}

// Initial load for the chat panel — last 200 messages, oldest first.
export async function loadChatHistory(caseId: string) {
  const user = await requireUser();
  const id = z.string().uuid().parse(caseId);
  return listChatMessages(user.firmId, user.userId, id, { limit: 200 });
}
