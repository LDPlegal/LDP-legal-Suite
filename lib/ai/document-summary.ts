// Document summary via Claude (Fase 5 extension).
//
// Takes a document's OCR text (or name if no OCR) and asks Claude for an
// executive summary. For legal docs this is very useful — a 40-page PDF
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
        "El usuario te pasa el contenido de un documento legal extraído por OCR.",
        "Genera un resumen ejecutivo en español, en formato Markdown, con las siguientes secciones cuando aplique:",
        "- **Tipo de documento** (contrato, demanda, sentencia, poder, acta, carta, etc.)",
        "- **Partes involucradas**",
        "- **Puntos clave / Cláusulas relevantes**",
        "- **Fechas importantes**",
        "- **Obligaciones / Compromisos**",
        "- **Observaciones o riesgos**",
        "Sé conciso — máximo 400 palabras.",
        "Solo usa información del texto provisto; si una sección no tiene datos, omítela.",
        "Si el texto OCR es ilegible o no tiene sentido, indícalo claramente.",
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
