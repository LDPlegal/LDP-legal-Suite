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

// Anthropic pricing per million tokens. Source: https://www.anthropic.com/pricing
// Updated when models change. Used to compute cost_usd per call.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

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
    feature: "case_summary" | "refine_note" | "doc_search" | "doc_summary" | "chat";
  };
};

export type RunPromptResult = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
};

// Single entry point. Callers pass a list of messages (typically one user
// message with all the context) and get back a string + usage stats so the
// admin can monitor cost from /reportes if we ever surface it.
export async function runPrompt(
  messages: AiMessage[],
  opts: RunPromptOptions = {},
): Promise<RunPromptResult> {
  const client = getClient();
  const system =
    LEGAL_SYSTEM_PREAMBLE +
    (opts.systemAddendum ? `\n\n${opts.systemAddendum}` : "");

  const model = opts.model ?? DEFAULT_MODEL;
  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1500,
    temperature: opts.temperature ?? 0.4,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  // Concatenate text parts (the API may emit multiple content blocks for
  // tool use etc.; we don't use tools yet but the shape requires the loop).
  const text = response.content
    .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  // Persist usage if caller asked for tracking. We use adminDb because the
  // table has RLS firm-isolation but the row is from a controlled call site
  // (server-only); piping through withFirm would only add overhead. The
  // firm_id we write is the one the caller already validated via requireUser.
  if (opts.tracking) {
    try {
      await adminDb.insert(aiUsage).values({
        firmId: opts.tracking.firmId,
        userId: opts.tracking.userId,
        feature: opts.tracking.feature,
        model,
        inputTokens,
        outputTokens,
        costUsd: computeCostUsd(model, inputTokens, outputTokens),
      });
    } catch {
      // Don't fail the user-facing prompt over a tracking write. We log to
      // server logs in dev mode below.
    }
  }

  return {
    text,
    usage: { inputTokens, outputTokens },
  };
}
