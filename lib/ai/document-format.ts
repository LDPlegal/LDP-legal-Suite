// Reformateo de documentos con Claude (Fase 13/UX).
//
// El texto que sale del OCR / extracción de DOCX viene "plano": sin títulos,
// sin negritas, con saltos de línea raros. Esto pide a Claude que lo
// re-estructure en Markdown legible (títulos, negritas en los temas,
// párrafos, listas) SIN inventar ni resumir, es un reformateo fiel, no un
// resumen. Útil para leer un contrato o escrito directamente en la app.

import "server-only";
import { runPrompt } from "./claude";

const MAX_OCR_CHARS = 60_000;

export type DocumentFormatResult = {
  markdown: string;
  truncated: boolean;
  usage: { inputTokens: number; outputTokens: number };
};

export async function formatDocument(
  firmId: string,
  userId: string,
  doc: { name: string; ocrText: string | null },
): Promise<DocumentFormatResult> {
  if (!doc.ocrText || doc.ocrText.trim().length === 0) {
    throw new Error(
      "Este documento no tiene texto extraído. Solo se puede dar formato a documentos con OCR completado.",
    );
  }

  const truncated = doc.ocrText.length > MAX_OCR_CHARS;
  const text = doc.ocrText.slice(0, MAX_OCR_CHARS);

  const result = await runPrompt(
    [
      {
        role: "user",
        content: [
          `# Documento: ${doc.name}`,
          "",
          "## Texto extraído (sin formato)",
          "",
          text,
        ].join("\n"),
      },
    ],
    {
      systemAddendum: [
        "El usuario te da el texto plano extraído de un documento (OCR o DOCX).",
        "Tu tarea es RE-FORMATEARLO en Markdown legible, NO resumirlo ni cambiar su contenido.",
        "Reglas estrictas:",
        "- NO inventes, agregues ni omitas contenido. Conservá TODO el texto original.",
        "- NO resumas. El resultado debe tener aproximadamente la misma extensión que el original.",
        "- Corregí solo saltos de línea rotos, espacios dobles y guiones de corte de palabra por OCR.",
        "- Identificá y marcá los títulos/encabezados de sección con ## o ###.",
        "- Poné en **negrita** los temas o etiquetas clave (ej. nombres de partes, 'PRIMERO:', 'CONSIDERANDO', montos, fechas clave, cláusulas).",
        "- Usá listas con viñetas o numeradas donde el texto claramente enumera puntos.",
        "- Respetá el idioma original del documento.",
        "- Devolvé SOLO el Markdown del documento reformateado, sin comentarios tuyos ni encabezado extra.",
      ].join("\n"),
      maxTokens: 8000,
      temperature: 0.1,
      tracking: { firmId, userId, feature: "doc_format" },
    },
  );

  return { markdown: result.text, truncated, usage: result.usage };
}
