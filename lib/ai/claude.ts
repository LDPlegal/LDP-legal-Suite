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

  const response = await client.messages.create({
    model: opts.model ?? DEFAULT_MODEL,
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

  return {
    text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
