// Server-safe public surface of the AI layer. Do not export anything that
// transitively imports the Anthropic SDK from here without "server-only",
// keep that confined to lib/ai/claude.ts.

export { isAiEnabled, AiNotConfiguredError } from "./claude";
export type { AiMessage, RunPromptOptions, RunPromptResult } from "./claude";
