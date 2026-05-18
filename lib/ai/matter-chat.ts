// lib/ai/matter-chat.ts
//
// Per-case chat orchestration. Combines:
//   - The narrative summary of the case (matter_contexts.summary)
//   - The chat history (matter_chats)
//   - Available tools (generate_document, create_event, read_document,
//     update_event, cancel_event).
//
// The system prompt is structured to maximize prompt caching: the LDP
// preamble + skills + matter context + document list (all stable per case
// within a 5-min window) go in the cached portion; only the user's latest
// message + recent history are uncached.
//
// Multi-step loop:
//   Some tools (read_document) are resolved server-side WITHIN the same
//   turn — the model emits a tool_use, we run it, feed the tool_result
//   back, and the model continues. Other tools (generate_document,
//   create_event, update_event, cancel_event) require explicit user
//   confirmation in the UI ("button click"), so we return them up to the
//   caller without auto-resolving.
//
// Flow for a typical chat turn:
//   1. Load matter_context (refresh stats if stale).
//   2. Load case + skills + document list.
//   3. Persist user message.
//   4. Build messages array (history + new user message).
//   5. Loop:
//      a. Run prompt with cache_control on system text.
//      b. If response contains read_document tool_use → resolve server-side,
//         append tool_use + tool_result to messages, loop again.
//      c. Else: persist assistant message, return UI-tools to caller.

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
import {
  getDocumentById,
  listDocumentsForCase,
} from "@/lib/db/queries/documents";
import { logAuditStandalone } from "@/lib/audit/log";
import type { MatterChat } from "@/lib/db/schema";

// How many recent messages to keep in active context. Older messages stay
// in matter_chats (for UI history) but get summarized into the system
// prompt when they fall off this window.
const ACTIVE_HISTORY_TURNS = 30;

// Tools the SERVER resolves automatically inside the same turn — no UI
// confirmation needed because they don't mutate state ("read_document"
// only reads). Everything else (generate_document, create_event, update_event,
// cancel_event) needs an explicit human click in the UI.
const AUTO_RESOLVE_TOOLS = new Set<string>(["read_document"]);

// Hard cap so a misbehaving model can't loop forever consuming budget.
const MAX_TOOL_LOOPS = 4;
// Max OCR characters we feed back per read_document call. Beyond this we
// truncate and tell the model.
const MAX_OCR_CHARS = 12_000;

export type ChatTurnInput = {
  firmId: string;
  userId: string;
  caseId: string;
  userMessage: string;
  systemExtra?: string;
  tools?: AiTool[];
  model?: string;
};

export type ChatTurnOutput = {
  assistantMessage: MatterChat;
  toolUses: RunPromptResult["toolUses"];
  usage: RunPromptResult["usage"];
};

type RawMessage = { role: "user" | "assistant"; content: unknown };

export async function runMatterChatTurn(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const { firmId, userId, caseId } = input;

  // 1. Load context (lazy-create).
  const ctx = await getOrCreateMatterContext(firmId, userId, caseId);

  // 2. Refresh stats — cheap COUNT queries.
  const stats = await computeMatterStats(firmId, userId, caseId);

  // 2b. Load case + skills + documents (for the "tabla de documentos" block).
  const caso = await getCaseById(firmId, userId, caseId);
  const matterType = caso?.case.matterType;
  const skills = await resolveSkillsFor({ matterType });
  const skillsBlock = renderSkillsBlock(skills);
  const docs = await listDocumentsForCase(firmId, userId, caseId);

  // 3. Persist the new user message BEFORE calling the LLM.
  const userMsg = await appendChatMessage(firmId, userId, {
    caseId,
    role: "user",
    content: input.userMessage,
    createdBy: userId,
  });

  // 4. Build cacheable system prompt with all the stable per-case context.
  const summaryBlock = ctx.summary
    ? `\n\n## Contexto del expediente (resumen)\n\n${ctx.summary}`
    : "\n\n## Contexto del expediente\n\n(El resumen narrativo del expediente aún no se ha generado. Trabaja sólo con lo que el usuario te proporciona explícitamente y con los documentos que puedas leer.)";

  const statsBlock = `\n\n## Estado del expediente\n\n${formatStats(stats)}`;

  const caseHeaderBlock = caso?.case
    ? `\n\n## Expediente\n\n- Código: ${caso.case.code}\n- Título: ${caso.case.title}\n- Tipo: ${matterType ?? "desconocido"}\n- Estado: ${caso.case.status}\n- Confidencialidad: ${caso.case.confidentialTier ?? "normal"}\n- Cliente: ${caso.client?.displayName ?? "(sin cliente)"}\n- Contraparte: ${caso.case.counterpartyName ?? "(sin contraparte)"}`
    : "";

  const documentsBlock = formatDocumentsBlock(docs);

  const systemAddendum = [
    "Tu rol: asistente de chat para un expediente específico de la firma LDP Legal Advisors.",
    "El usuario está mirando este expediente en la pantalla y puede pedirte (a) consultas sobre el caso, (b) que generes documentos legales, o (c) que crees / modifiques / canceles eventos en el calendario.",
    "Para consultas: responde directamente con texto claro y conciso.",
    "Para leer un documento cargado: usa la herramienta `read_document` con el UUID que aparece en el listado de documentos más abajo. Es la única forma de acceder al contenido OCR. NUNCA inventes datos de un documento que no leíste — si no podés leerlo (sin OCR, error, etc.), avisás al usuario.",
    "Para generar documentos: usa la herramienta `generate_document` con el cuerpo en Markdown LDP. No respondas con el documento como texto plano — el usuario espera un .docx.",
    "Para crear / mover / cancelar eventos: usa `create_event`, `update_event` o `cancel_event` SOLO después de confirmar verbalmente con el usuario en el chat. La acción real ocurre cuando el usuario hace clic en el botón de la tarjeta.",
    "NUNCA actúes en nombre del usuario sin su confirmación explícita. NUNCA mandes correos, anules facturas ni modifiques nada destructivo automáticamente.",
    "Cuando generes documentos, sigue ESTRICTAMENTE las reglas del bloque de Skills. Si te falta un dato del expediente, intentá primero leerlo con `read_document` desde un documento del listado. Si aún así no aparece, marcalo como `[DATO PENDIENTE: descripción específica]`.",
    input.systemExtra ?? "",
    skillsBlock,
    caseHeaderBlock,
    summaryBlock,
    statsBlock,
    documentsBlock,
  ]
    .filter(Boolean)
    .join("\n");

  // 5. Build messages from history + new user message.
  const allHistory = await listChatMessages(firmId, userId, caseId);
  // Don't include the message we just inserted (it's the same as input.userMessage).
  const recent = truncateForContext(
    allHistory.filter((m) => m.id !== userMsg.id),
    { keepLast: ACTIVE_HISTORY_TURNS },
  );
  const messages: RawMessage[] = [];
  for (const m of recent) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({ role: "user", content: input.userMessage });

  // 6. Multi-step loop. We keep looping while the model emits a tool_use we
  // can resolve server-side (read_document). When the model returns plain
  // text OR a tool_use that requires user confirmation, we exit.
  const tools = input.tools ?? matterChatTools;
  let aggregatedUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  let finalText = "";
  let finalToolUses: RunPromptResult["toolUses"] = [];

  for (let step = 0; step < MAX_TOOL_LOOPS; step++) {
    const result = await runPrompt(
      // After the first iteration we already pass content blocks (not strings),
      // so we use messagesRaw mode. For the first iteration, plain messages
      // would work too, but uniform handling is simpler.
      [],
      {
        messagesRaw: messages,
        systemAddendum,
        cacheSystem: true,
        tools,
        model: input.model,
        maxTokens: 2500,
        temperature: 0.4,
        tracking: { firmId, userId, feature: "matter_chat" },
      },
    );
    aggregatedUsage = {
      inputTokens: aggregatedUsage.inputTokens + result.usage.inputTokens,
      outputTokens: aggregatedUsage.outputTokens + result.usage.outputTokens,
      cacheReadTokens: aggregatedUsage.cacheReadTokens + result.usage.cacheReadTokens,
      cacheCreationTokens:
        aggregatedUsage.cacheCreationTokens + result.usage.cacheCreationTokens,
    };

    const autoResolvable = result.toolUses.filter((tu) => AUTO_RESOLVE_TOOLS.has(tu.name));
    const requiresHumanConfirm = result.toolUses.filter(
      (tu) => !AUTO_RESOLVE_TOOLS.has(tu.name),
    );

    // If no auto-resolvable tools, we're done with the loop.
    if (autoResolvable.length === 0) {
      finalText = result.text;
      finalToolUses = result.toolUses;
      break;
    }

    // Echo the assistant's tool_use block back into the conversation.
    // Anthropic requires we send the FULL assistant content (text + tool_use)
    // when continuing a tool-use turn, not just the tool_use parts.
    const assistantContent: Array<Record<string, unknown>> = [];
    if (result.text) {
      assistantContent.push({ type: "text", text: result.text });
    }
    for (const tu of result.toolUses) {
      assistantContent.push({
        type: "tool_use",
        id: tu.id,
        name: tu.name,
        input: tu.input ?? {},
      });
    }
    messages.push({ role: "assistant", content: assistantContent });

    // Resolve each auto-resolvable tool and feed results back.
    const toolResults: Array<Record<string, unknown>> = [];
    for (const tu of result.toolUses) {
      if (!AUTO_RESOLVE_TOOLS.has(tu.name)) {
        // Synthesize an empty tool_result so Anthropic doesn't complain
        // about unanswered tool_use blocks in the next turn — even though
        // we'll exit the loop after this iteration.
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "(pendiente de confirmación humana — el botón aparece en la UI del chat)",
        });
        continue;
      }
      const resultContent = await resolveAutoTool(firmId, userId, caseId, tu);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: resultContent,
      });
    }
    messages.push({ role: "user", content: toolResults });

    // If only human-confirm tools remained AND we already resolved the
    // auto ones, we exit so the UI can render the confirmation cards.
    if (requiresHumanConfirm.length > 0 && autoResolvable.length === 0) {
      finalText = result.text;
      finalToolUses = requiresHumanConfirm;
      break;
    }

    // Otherwise continue the loop — the model now has the read_document
    // result and can either continue reading more docs or produce its
    // final answer / human-confirm tool.
  }

  // 7. Persist the assistant response.
  const assistantMessage = await appendChatMessage(firmId, userId, {
    caseId,
    role: "assistant",
    content: finalText || "",
    toolCalls: finalToolUses.length > 0 ? finalToolUses : undefined,
    inputTokens: aggregatedUsage.inputTokens,
    outputTokens: aggregatedUsage.outputTokens,
    cacheReadTokens: aggregatedUsage.cacheReadTokens,
    cacheCreationTokens: aggregatedUsage.cacheCreationTokens,
    createdBy: userId,
  });

  // 8. Update stats on the context row.
  await saveMatterContext(firmId, userId, caseId, {
    summary: ctx.summary,
    stats,
    tokenCount: ctx.tokenCount,
  });

  return { assistantMessage, toolUses: finalToolUses, usage: aggregatedUsage };
}

// Resolve a server-side tool call. Right now only `read_document`.
async function resolveAutoTool(
  firmId: string,
  userId: string,
  caseId: string,
  tu: { id: string; name: string; input: unknown },
): Promise<string> {
  if (tu.name !== "read_document") {
    return `(unknown tool: ${tu.name})`;
  }
  const inp = tu.input as { documentId?: string; reason?: string } | null;
  const docId = inp?.documentId;
  if (!docId || typeof docId !== "string") {
    return "ERROR: documentId requerido.";
  }
  const doc = await getDocumentById(firmId, userId, docId);
  if (!doc) {
    return `ERROR: documento ${docId} no encontrado o sin acceso.`;
  }
  if (doc.caseId !== caseId) {
    return `ERROR: el documento ${docId} pertenece a otro expediente. La IA sólo puede leer documentos del expediente activo.`;
  }
  // Audit log: which user pidió leer qué documento.
  try {
    await logAuditStandalone({
      firmId,
      userId,
      entityType: "document",
      entityId: doc.id,
      caseId,
      action: "viewed",
      summary: `IA leyó documento "${doc.name}"${inp?.reason ? ` (motivo: ${inp.reason})` : ""}`,
    });
  } catch {
    // best-effort
  }
  if (!doc.ocrText || doc.ocrText.trim() === "") {
    return `El documento "${doc.name}" no tiene OCR aún (status: ${doc.ocrStatus}). No puedo leer su contenido. Marcá los datos como [DATO PENDIENTE] o pedile al usuario que comparta el contenido a mano.`;
  }
  let text = doc.ocrText;
  let truncated = false;
  if (text.length > MAX_OCR_CHARS) {
    text = text.slice(0, MAX_OCR_CHARS);
    truncated = true;
  }
  return [
    `Documento: ${doc.name}`,
    `Tipo MIME: ${doc.mimeType}`,
    `Tamaño: ${doc.sizeBytes} bytes`,
    `Subido: ${doc.createdAt.toISOString()}`,
    "---",
    text,
    truncated ? `\n\n[Truncado a ${MAX_OCR_CHARS} caracteres — el documento es más largo]` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatDocumentsBlock(
  docs: Awaited<ReturnType<typeof listDocumentsForCase>>,
): string {
  if (docs.length === 0) {
    return "\n\n## Documentos cargados en el expediente\n\n(Ninguno todavía.)";
  }
  const lines = docs.slice(0, 100).map((d) => {
    const status =
      d.ocrStatus === "done"
        ? "OCR disponible"
        : d.ocrStatus === "pending" || d.ocrStatus === "processing"
          ? "OCR pendiente"
          : d.ocrStatus === "skipped"
            ? "Sin OCR (omitido)"
            : "OCR falló";
    return `- \`${d.id}\` · ${d.name} · ${status}`;
  });
  return [
    "\n\n## Documentos cargados en el expediente",
    "Para leer el contenido completo de cualquiera, usa `read_document(documentId)`.",
    "",
    ...lines,
    docs.length > 100 ? `\n... (${docs.length - 100} más; mostrando los 100 más recientes)` : "",
  ]
    .filter((s) => s !== "")
    .join("\n");
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
