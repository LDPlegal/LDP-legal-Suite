import { runPrompt, type AiMessage } from "./claude";

export async function chatWithContext(
  contextText: string,
  history: AiMessage[],
  tracking?: { firmId: string; userId: string; feature: "chat" }
) {
  const systemAddendum = [
    "Eres un asistente interactivo respondiendo preguntas sobre un documento o caso específico.",
    "Basa tus respuestas ÚNICAMENTE en el siguiente contexto extraído del sistema.",
    "Si la respuesta no está en el contexto, indica claramente que no tienes esa información.",
    "No inventes datos.",
    "--- INICIO DEL CONTEXTO ---",
    contextText,
    "--- FIN DEL CONTEXTO ---"
  ].join("\n");

  const result = await runPrompt(history, {
    systemAddendum,
    tracking,
  });

  return result;
}
