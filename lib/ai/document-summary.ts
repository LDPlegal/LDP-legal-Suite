// Document summary via Claude (Fase 5 extension).
//
// Takes a document's OCR text (or name if no OCR) and asks Claude for an
// executive summary. For legal docs this is very useful, a 40-page PDF
// becomes a 200-word summary that a partner can skim.

import "server-only";
import { runPrompt } from "./claude";

const MAX_OCR_CHARS = 60_000; // ~15k tokens, well within Sonnet's 200k window

export type DocumentSummaryResult = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
};

export async function summarizeDocument(
  firmId: string,
  userId: string,
  doc: {
    name: string;
    mimeType: string;
    ocrText: string | null;
    sizeBytes: number;
  },
): Promise<DocumentSummaryResult> {
  if (!doc.ocrText || doc.ocrText.trim().length === 0) {
    throw new Error(
      "Este documento no tiene texto OCR disponible. Solo se pueden resumir documentos con OCR completado (PDFs escaneados o imágenes).",
    );
  }

  const truncatedText = doc.ocrText.slice(0, MAX_OCR_CHARS);
  const wasTruncated = doc.ocrText.length > MAX_OCR_CHARS;

  const prompt = [
    `# Documento: ${doc.name}`,
    `**Tipo:** ${doc.mimeType} · **Tamaño:** ${(doc.sizeBytes / 1024).toFixed(0)} KB`,
    wasTruncated
      ? `⚠️ El texto fue truncado a ${MAX_OCR_CHARS} caracteres de ${doc.ocrText.length} totales.`
      : "",
    "",
    "## Texto del documento (extraído por OCR)",
    "",
    truncatedText,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runPrompt(
    [{ role: "user", content: prompt }],
    {
      systemAddendum: [
        "El usuario te proporciona el texto extraído de un documento.",
        "IMPORTANTE: DEBES generar el resumen sin importar si el documento es legal, contable, médico, académico, técnico, o general. NO rechaces la tarea diciendo que no es un documento legal.",
        "El texto puede estar muy desordenado, tener saltos de línea extraños o errores tipográficos debido a la extracción. Haz tu mejor esfuerzo para entender el sentido general.",
        "Genera un resumen ejecutivo en español, en formato Markdown, estructurando los puntos principales.",
        "Si el documento es legal o formal, incluye secciones como: Tipo de documento, Partes, Fechas clave, y Obligaciones.",
        "Si es otro tipo de documento (ej. un examen, artículo, receta, manual), simplemente extrae el tema principal, los conceptos clave y cualquier conclusión relevante.",
        "Sé conciso, máximo 400 palabras.",
        "Solo usa información del texto provisto."
      ].join(" "),
      maxTokens: 1500,
      temperature: 0.3,
      tracking: { firmId, userId, feature: "doc_summary" },
    },
  );

  return {
    text: result.text,
    usage: result.usage,
  };
}
