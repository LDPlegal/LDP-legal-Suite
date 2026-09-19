// Extracción de texto de archivos Word (.docx).
//
// mammoth.js es el approach standard, devuelve el texto plano del
// documento sin formato (mejor para OCR/búsqueda). Si necesitamos HTML
// formateado en el futuro, mammoth también soporta extractRawText vs
// convertToHtml.

import "server-only";
import mammoth from "mammoth";

export type DocxResult =
  | { status: "done"; text: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export async function extractDocxText(bytes: Uint8Array): Promise<DocxResult> {
  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    const text = result.value.trim();
    if (text.length < 5) {
      return { status: "skipped", reason: "El documento Word no contiene texto extraíble." };
    }
    // mammoth puede emitir warnings (ej. estilos no soportados), los
    // logueamos pero no fallan la extracción.
    if (result.messages && result.messages.length > 0) {
      console.log(
        `[docx] extraction warnings:`,
        result.messages.map((m) => m.message).join("; "),
      );
    }
    return { status: "done", text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "failed", reason: `mammoth falló: ${msg.slice(0, 200)}` };
  }
}
