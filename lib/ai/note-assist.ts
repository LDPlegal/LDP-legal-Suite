// Note assistance prompts (Fase 5.3): refine an existing note's wording.

import "server-only";
import { runPrompt } from "./claude";
import { tiptapToPlainText } from "./tiptap-text";

export type NoteRefineResult = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
};

export async function refineNote(input: {
  caseTitle: string;
  noteTitle: string | null;
  content: unknown;
  tracking?: { firmId: string; userId: string };
}): Promise<NoteRefineResult> {
  const plain = tiptapToPlainText(input.content);
  if (!plain.trim()) {
    throw new Error("La nota está vacía. Escribe algo antes de pedir mejora.");
  }
  const userMessage = [
    `Caso: ${input.caseTitle}`,
    input.noteTitle ? `Título de la nota: ${input.noteTitle}` : "",
    "",
    "Nota actual:",
    "----",
    plain,
    "----",
    "",
    "Devuelve la nota reescrita en español formal jurídico, manteniendo TODOS los hechos, fechas, nombres y números exactos. Mejora claridad, gramática y estructura. NO agregues hechos nuevos, conclusiones legales, ni citas. Si la nota ya está bien redactada, devuélvela con cambios mínimos. Responde solo con el texto refinado, sin preámbulos ni encabezados.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runPrompt(
    [{ role: "user", content: userMessage }],
    {
      systemAddendum:
        "Eres un editor de notas legales. Tu trabajo es mejorar redacción sin alterar contenido. Nunca expandas con información que no esté en la nota original.",
      maxTokens: 2000,
      temperature: 0.3,
      tracking: input.tracking
        ? { ...input.tracking, feature: "refine_note" }
        : undefined,
    },
  );

  return result;
}
