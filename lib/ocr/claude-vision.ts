// OCR via Claude API multi-modal. Soporta:
//   - PDFs (incluso escaneados, Claude los procesa con su propio vision)
//   - Imágenes (JPG, PNG, WebP, GIF)
//
// Costo aproximado: ~$0.01-0.02 por documento de 1-3 páginas (Sonnet 4.6).
// Para una firma legal con ~100 docs/mes ≈ $1-2/mes. Bajo y vale la pena.
//
// Es la opción más confiable porque:
//   - No depende de calidad del scan (Tesseract falla con scans malos)
//   - Soporta manuscritos legibles (firmas, notas al margen)
//   - Soporta tablas y layouts complejos
//   - Soporta español + acentos sin tunear
//
// Uso: solo se invoca como fallback cuando la extracción local falla
// (PDF sin texto digital, Tesseract baja confidence), no se llama
// gratis a Claude para todo upload.

import "server-only";
import { runPrompt } from "@/lib/ai/claude";

const OCR_INSTRUCTION =
  "Extraé TODO el texto legible de este documento. Devolvé únicamente el texto en " +
  "orden de lectura natural (de arriba a abajo, izquierda a derecha), preservando " +
  "saltos de línea para separar párrafos y secciones. NO agregues comentarios, NO " +
  "analices el contenido, NO traduzcas, solo el texto literal. Si hay tablas, " +
  "formatealas de manera legible con separadores. Si una parte es ilegible, marcala " +
  "como [ILEGIBLE]. Si no hay texto visible, respondé exactamente: SIN_TEXTO.";

/** Tipos de contenido que Claude API acepta como multimodal. */
type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
    }
  | {
      type: "document";
      source: {
        type: "base64";
        media_type: "application/pdf";
        data: string;
      };
    };

/** Tope de tamaño para que Claude API acepte el PDF/imagen como input.
 *  La API permite hasta 32MB de entrada total pero conviene quedarse
 *  conservador para evitar timeouts. */
export const CLAUDE_OCR_MAX_BYTES = 10 * 1024 * 1024; // 10MB

export type ClaudeOcrInput = {
  bytes: Uint8Array;
  mimeType: string;
  firmId: string;
  userId: string;
};

export type ClaudeOcrResult =
  | { status: "done"; text: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export async function ocrWithClaude(input: ClaudeOcrInput): Promise<ClaudeOcrResult> {
  if (input.bytes.byteLength > CLAUDE_OCR_MAX_BYTES) {
    return {
      status: "skipped",
      reason: `Archivo > ${Math.round(CLAUDE_OCR_MAX_BYTES / 1024 / 1024)}MB; demasiado grande para OCR con Claude.`,
    };
  }

  // Construir el bloque de contenido según el tipo.
  const base64 = Buffer.from(input.bytes).toString("base64");
  let mediaBlock: ContentBlock | null = null;

  if (input.mimeType === "application/pdf") {
    mediaBlock = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  } else if (
    input.mimeType === "image/jpeg" ||
    input.mimeType === "image/png" ||
    input.mimeType === "image/gif" ||
    input.mimeType === "image/webp"
  ) {
    mediaBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: input.mimeType,
        data: base64,
      },
    };
  }

  if (!mediaBlock) {
    return {
      status: "skipped",
      reason: `Tipo ${input.mimeType} no soportado por Claude Vision OCR (solo PDF/JPG/PNG/GIF/WebP).`,
    };
  }

  try {
    const result = await runPrompt(
      // messages convencional vacío, usamos messagesRaw para los blocks
      [{ role: "user", content: "" }],
      {
        // Modelo cheap para OCR puro, Haiku es mucho más barato que Sonnet
        // y para extraer texto literal sirve perfecto.
        model: "claude-haiku-4-5-20251001",
        maxTokens: 8000, // Documentos legales pueden ser largos
        temperature: 0, // Extracción literal, sin creatividad
        systemAddendum: OCR_INSTRUCTION,
        messagesRaw: [
          {
            role: "user",
            content: [
              mediaBlock,
              {
                type: "text",
                text: "Extraé el texto del documento adjunto siguiendo las reglas.",
              },
            ],
          },
        ],
        tracking: {
          firmId: input.firmId,
          userId: input.userId,
          feature: "ocr_extract",
        },
      },
    );

    const text = result.text.trim();
    if (text === "SIN_TEXTO" || text.length < 5) {
      return { status: "skipped", reason: "Claude no detectó texto legible en el documento." };
    }
    return { status: "done", text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "failed", reason: `Claude OCR falló: ${msg.slice(0, 200)}` };
  }
}
