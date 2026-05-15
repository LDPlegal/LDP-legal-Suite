// lib/ai/matter-chat.ts
//
// Per-case chat orchestration. Combines:
//   - The narrative summary of the case (matter_contexts.summary)
//   - The chat history (matter_chats)
//   - Available tools (Bloques 2 & 3 will add: generate_document, create_event)
//
// The system prompt is structured to maximize prompt caching: the LDP
// preamble + skills + matter context (all stable per case) go in the
// cached portion; only the user's latest message + recent history are
// uncached.
//
// Flow for a typical chat turn:
//   1. Load matter_context (refresh stats if stale)
//   2. Load last N chat messages
//   3. Append user's new message to history
//   4. Build system text: preamble + skills + matter context + tool docs
//   5. Run prompt with cache_control on system text
//   6. Persist assistant message back to matter_chats
//   7. Return the assistant text + any tool_use blocks for the route handler
//      to process (events, doc generation, etc.).

import "server-only";
import { runPrompt, type AiTool, type RunPromptResult } from "./claude";
import { resolveSkillsFor, renderSkillsBlock } from "./skills";
import { matterChatTools } from "./tools";
import {
  appendChatMessage,
  computeMatterStats,
  getOrCreateMatterContext,
  listChatMessages,
  saveMatterContext,
  truncateForContext,
  type MatterContextStats,
} from "@/lib/db/queries/matter-chats";
import { getCaseById } from "@/lib/db/queries/cases";
import type { MatterChat } from "@/lib/db/schema";

// How many recent messages to keep in active context. Older messages stay
// in matter_chats (for UI history) but get summarized into the system
// prompt when they fall off this window.
const ACTIVE_HISTORY_TURNS = 30;

export type ChatTurnInput = {
  firmId: string;
  userId: string;
  caseId: string;
  userMessage: string;
  // Caller-provided extra context for the system prompt (e.g. skills bundle).
  // Cached aggressively.
  systemExtra?: string;
  tools?: AiTool[];
  // Override default model — use Opus for doc-generation turns, Sonnet for
  // chat-only turns.
  model?: string;
};

export type ChatTurnOutput = {
  assistantMessage: MatterChat;
  toolUses: RunPromptResult["toolUses"];
  usage: RunPromptResult["usage"];
};

// Run one turn of the matter chat. Persists both the user message and the
// assistant response in matter_chats and returns whatever tool calls the
// assistant emitted so the route handler can resolve them.
export async function runMatterChatTurn(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const { firmId, userId, caseId } = input;

  // 1. Load context (lazy-create).
  const ctx = await getOrCreateMatterContext(firmId, userId, caseId);

  // 2. Always refresh stats — they're cheap COUNT queries; the narrative
  //    summary refresh is separate and triggered by the markContextStale
  //    queue. The chat works fine even with a stale summary.
  const stats = await computeMatterStats(firmId, userId, caseId);

  // 2b. Load the case to know matterType (drives which skills apply).
  const caso = await getCaseById(firmId, userId, caseId);
  const matterType = caso?.case.matterType;

  // 2c. Resolve skills broadly (no specific document type yet — that comes
  // when the user asks "redacta X"). We send ALL skills that match this
  // matter type plus the base. The model picks the right one when invoking
  // the tool. Cost-wise this is fine because the skills block is cached.
  const skills = await resolveSkillsFor({ matterType });
  const skillsBlock = renderSkillsBlock(skills);

  // 3. Load chat history (oldest first).
  const allHistory = await listChatMessages(firmId, userId, caseId);
  const recent = truncateForContext(allHistory, { keepLast: ACTIVE_HISTORY_TURNS });

  // 4. Persist the new user message BEFORE calling the LLM. If the LLM
  //    crashes we don't lose what the user wrote.
  const userMsg = await appendChatMessage(firmId, userId, {
    caseId,
    role: "user",
    content: input.userMessage,
    createdBy: userId,
  });

  // 5. Build system prompt with cacheable sections.
  const summaryBlock = ctx.summary
    ? `\n\n## Contexto del expediente (resumen)\n\n${ctx.summary}`
    : "\n\n## Contexto del expediente\n\n(El resumen narrativo del expediente aún no se ha generado. Trabaja solo con lo que el usuario te proporciona explícitamente.)";

  const statsBlock = `\n\n## Estado del expediente\n\n${formatStats(stats)}`;

  const systemAddendum = [
    "Tu rol: asistente de chat para un expediente específico de la firma LDP Legal Advisors.",
    "El usuario está mirando este expediente en la pantalla y puede pedirte (a) consultas sobre el caso, (b) que generes documentos legales, o (c) que crees eventos / plazos en el calendario.",
    "Para consultas: responde directamente con texto claro y conciso.",
    "Para generar documentos: usa la herramienta `generate_document` con el cuerpo del documento en Markdown LDP. No respondas con el documento como texto plano — el usuario espera un .docx.",
    "Para crear eventos: usa la herramienta `create_event` y SIEMPRE pide confirmación al usuario antes de invocarla (el usuario debe responder 'sí' o equivalente).",
    "NUNCA actúes en nombre del usuario sin su confirmación explícita. NUNCA mandes correos, anules facturas, ni modifiques nada destructivo automáticamente.",
    "Cuando generes documentos, sigue ESTRICTAMENTE las reglas de formato y estilo LDP del bloque de Skills más abajo. Si te falta un dato del expediente, márcalo como `[DATO PENDIENTE: descripción específica]` y lista los pendientes en el mensaje del chat.",
    input.systemExtra ?? "",
    skillsBlock,
    summaryBlock,
    statsBlock,
  ]
    .filter(Boolean)
    .join("\n");

  // 6. Build the messages array for the API. We send recent history as
  //    user/assistant turns, ignoring system messages (those are
  //    summarized into the chat metadata).
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of recent) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: "user", content: input.userMessage });

  // 7. Run the LLM. Cache the system prompt (skills + matter context) since
  //    every turn within a 5-min window reuses it. Tools enabled by default
  //    are matterChatTools (generate_document + create_event); callers may
  //    override with input.tools when they need a different surface.
  const result = await runPrompt(messages, {
    systemAddendum,
    cacheSystem: true,
    tools: input.tools ?? matterChatTools,
    model: input.model,
    maxTokens: 2500,
    temperature: 0.4,
    tracking: { firmId, userId, feature: "matter_chat" },
  });

  // 8. Persist the assistant response.
  const assistantMessage = await appendChatMessage(firmId, userId, {
    caseId,
    role: "assistant",
    content: result.text || "",
    toolCalls: result.toolUses.length > 0 ? result.toolUses : undefined,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    cacheCreationTokens: result.usage.cacheCreationTokens,
    createdBy: userId,
  });

  // 9. Side effect: update stats on the context row so the header reflects
  //    activity even before the narrative refresh runs.
  await saveMatterContext(firmId, userId, caseId, {
    summary: ctx.summary,
    stats,
    tokenCount: ctx.tokenCount,
  });

  void userMsg;
  return { assistantMessage, toolUses: result.toolUses, usage: result.usage };
}

function formatStats(stats: MatterContextStats): string {
  const parts: string[] = [];
  parts.push(`- Documentos: ${stats.docCount}`);
  parts.push(`- Eventos registrados: ${stats.eventCount}`);
  parts.push(`- Notas internas: ${stats.noteCount}`);
  parts.push(`- Entradas de tiempo: ${stats.timeEntryCount}`);
  if (stats.lastActivityAt) {
    parts.push(`- Última actividad: ${new Date(stats.lastActivityAt).toLocaleString("es-DO")}`);
  }
  return parts.join("\n");
}
