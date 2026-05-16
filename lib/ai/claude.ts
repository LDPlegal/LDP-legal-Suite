// Thin wrapper around the Anthropic SDK (Fase 5).
//
// Why a wrapper:
//   - Single place to consult ANTHROPIC_API_KEY presence (so the rest of
//     the app can ask `isAiEnabled()` without re-reading env every call).
//   - Forces every prompt through this module so we can inject system-level
//     guardrails ("you are a legal assistant for a Dominican Republic firm,
//     never invent statute citations…") in one place if/when we tighten
//     them.
//   - Lets us swap providers later without touching feature code; the
//     callers depend on `runPrompt(messages, opts)`, not on the SDK shape.
//
// All Claude calls happen server-side. The API key never ships to the
// browser; do not export anything from this module that a "use client"
// component could import directly.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/db/admin";
import { aiUsage } from "@/lib/db/schema";
import { preflightBudget, recordSpendAndMaybeWarn } from "./budget";

// Thrown when preflightBudget says the firm has hit a hard-cap. Callers
// (matter chat, doc generate, etc.) deben capturar y mostrar el reason
// al usuario en lugar de mostrarlo como error genérico.
export class AiBudgetExceededError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "AiBudgetExceededError";
  }
}

// Anthropic pricing per million tokens. Source: https://www.anthropic.com/pricing
// Updated when models change. Used to compute cost_usd per call.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

// Legacy helper kept for backward compat (other modules import this name
// indirectly via re-export). New code uses computeCostUsdWithCache below.
function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): string | null {
  const p = PRICING[model];
  if (!p) return null;
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return cost.toFixed(6);
}
void computeCostUsd; // keep symbol alive for future use; lint-friendly

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

let cachedClient: Anthropic | null = null;

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!isAiEnabled()) {
    throw new AiNotConfiguredError();
  }
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  return cachedClient;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("La integración con Claude no está configurada. Define ANTHROPIC_API_KEY en .env.");
    this.name = "AiNotConfiguredError";
  }
}

// Shared system preamble for every legal AI call. Specific tasks add their
// own task-specific lines on top.
const LEGAL_SYSTEM_PREAMBLE = [
  "Eres un asistente legal interno para una firma de abogados en República Dominicana (LDP Legal Advisors).",
  "Hablas español formal y profesional, salvo que el usuario te hable en otro idioma.",
  "NUNCA inventes citas a leyes, artículos del Código Civil, jurisprudencia, números de RNC, NCF o nombres de tribunales: si no aparecen explícitamente en el contexto del usuario, no las menciones.",
  "Si el usuario te pide algo fuera de la información provista, dilo claramente en lugar de fabricar datos.",
  "Tus respuestas son directamente vistas por abogados; sé conciso y útil, no didáctico.",
].join(" ");

export type AiMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export type RunPromptOptions = {
  // Task-specific addition appended to the legal preamble.
  systemAddendum?: string;
  // Override default model. Use "claude-haiku-4-5-20251001" for fast/cheap
  // tasks (e.g., short summaries) and Sonnet for high-quality drafting.
  model?: string;
  maxTokens?: number;
  temperature?: number;
  // Cost-tracking metadata. When set, runPrompt persists a row in ai_usage
  // with the firm_id + user_id + feature so /reportes -> IA shows consumption.
  tracking?: {
    firmId: string;
    userId: string;
    feature:
      | "case_summary"
      | "refine_note"
      | "doc_search"
      | "doc_summary"
      | "chat"
      | "scan_classify"
      | "matter_chat"
      | "matter_context"
      | "doc_generate"
      | "event_parse";
  };
  // Prompt caching: when set, the systemAddendum and any messages flagged
  // with cache:true get a cache_control marker. Anthropic charges 1.25x the
  // input rate on the cached chunks for the FIRST call, then 0.1x for
  // subsequent calls within 5 min. Saves 50-90% on chat conversations where
  // the matter context is reused across messages.
  cacheSystem?: boolean;
};

export type RunPromptResult = {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  toolUses: Array<{ id: string; name: string; input: unknown }>;
};

// Tool definition compatible con la API de Anthropic. Los callers de Bloque
// 3 (eventos desde chat) y Bloque 2 (generar docs) pasan tools.
export type AiTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type RunPromptAdvanced = RunPromptOptions & {
  tools?: AiTool[];
  // Anthropic message format raw: permite blocks (text + tool_use + tool_result).
  // Cuando se pasa messagesRaw, ignora `messages` simple.
  messagesRaw?: Array<{ role: "user" | "assistant"; content: unknown }>;
};

// Single entry point. Callers pass a list of messages (typically one user
// message with all the context) and get back a string + usage stats so the
// admin can monitor cost from /reportes if we ever surface it.
export async function runPrompt(
  messages: AiMessage[],
  opts: RunPromptAdvanced = {},
): Promise<RunPromptResult> {
  const client = getClient();

  // Budget preflight: if the firm hit the hard-cap, refuse before paying
  // for the API call. We only enforce when tracking is set (every chat /
  // doc-gen / event-parse call sets it); untracked ad-hoc calls bypass.
  if (opts.tracking?.firmId) {
    const pre = await preflightBudget(opts.tracking.firmId);
    if (!pre.allowed) {
      throw new AiBudgetExceededError(pre.reason);
    }
  }

  const systemText =
    LEGAL_SYSTEM_PREAMBLE +
    (opts.systemAddendum ? `\n\n${opts.systemAddendum}` : "");

  // Prompt caching: enviamos system como array de bloques con cache_control
  // en el bloque grande para que Anthropic lo cachee. Solo aplica cuando el
  // caller lo pidió y el texto es lo suficientemente grande (>1024 tokens
  // aproximadamente = ~4kb chars). El primer call paga 1.25x; siguientes
  // dentro de 5 min pagan 0.1x.
  const useCache = opts.cacheSystem === true && systemText.length > 4096;
  const system = useCache
    ? [
        {
          type: "text" as const,
          text: systemText,
          cache_control: { type: "ephemeral" as const },
        },
      ]
    : systemText;

  const model = opts.model ?? DEFAULT_MODEL;
  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1500,
    temperature: opts.temperature ?? 0.4,
    system,
    messages: opts.messagesRaw
      ? (opts.messagesRaw as Parameters<typeof client.messages.create>[0]["messages"])
      : messages.map((m) => ({ role: m.role, content: m.content })),
    ...(opts.tools && opts.tools.length > 0
      ? { tools: opts.tools as Parameters<typeof client.messages.create>[0]["tools"] }
      : {}),
  });

  // Concatenate text parts (the API may emit multiple content blocks for
  // tool use etc.).
  const text = response.content
    .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  // Extraer tool_use blocks para que el caller pueda procesarlos.
  const toolUses = response.content
    .filter((c): c is Extract<typeof c, { type: "tool_use" }> => c.type === "tool_use")
    .map((c) => ({ id: c.id, name: c.name, input: c.input as unknown }));

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  // El SDK tipa cache_*_input_tokens como opcional — pueden no venir si el
  // cache no aplicó. Aceptamos 0 como default.
  const usageAny = response.usage as unknown as {
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  const cacheReadTokens = usageAny.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = usageAny.cache_creation_input_tokens ?? 0;

  // Persist usage if caller asked for tracking. We use adminDb because the
  // table has RLS firm-isolation but the row is from a controlled call site
  // (server-only); piping through withFirm would only add overhead. The
  // firm_id we write is the one the caller already validated via requireUser.
  if (opts.tracking) {
    try {
      // Cost incluye cache discount: tokens read del cache se cobran a 0.1x.
      const cost = computeCostUsdWithCache(
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      );
      await adminDb.insert(aiUsage).values({
        firmId: opts.tracking.firmId,
        userId: opts.tracking.userId,
        feature: opts.tracking.feature,
        model,
        inputTokens,
        outputTokens,
        costUsd: cost,
      });
      // Después de registrar el gasto, evalúa si cruzamos algún umbral
      // (70/90/100%) por primera vez este mes y dispara la sugerencia
      // hacia admins. Idempotente, no bloquea.
      await recordSpendAndMaybeWarn(opts.tracking.firmId);
    } catch {
      // Don't fail the user-facing prompt over a tracking write.
    }
  }

  return {
    text,
    usage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens },
    toolUses,
  };
}

// Cache pricing: read = 0.1x input, creation = 1.25x input. Compute the
// effective cost so /reportes refleje el ahorro real.
function computeCostUsdWithCache(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
): string | null {
  const p = PRICING[model];
  if (!p) return null;
  // inputTokens already excludes cache_read / cache_creation in Anthropic's
  // billing (those are separate buckets). To compute the bill:
  const inputCost = (inputTokens * p.input) / 1_000_000;
  const cacheReadCost = (cacheReadTokens * p.input * 0.1) / 1_000_000;
  const cacheCreationCost = (cacheCreationTokens * p.input * 1.25) / 1_000_000;
  const outputCost = (outputTokens * p.output) / 1_000_000;
  const total = inputCost + cacheReadCost + cacheCreationCost + outputCost;
  return total.toFixed(6);
}
