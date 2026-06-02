// Extracción de texto de Word LEGACY (.doc — formato Compound File Binary,
// CFB/OLE2, usado por Word 97–2003).
//
// word-extractor es pure JS, funciona en Vercel sin dependencias nativas.
// Lee el stream "WordDocument" del contenedor CFB y devuelve el texto plano.

import "server-only";
import WordExtractor from "word-extractor";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type DocLegacyResult =
  | { status: "done"; text: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export async function extractDocLegacyText(
  bytes: Uint8Array,
): Promise<DocLegacyResult> {
  // word-extractor lee desde path en disco, no desde buffer. Lo escribimos
  // a /tmp (escribible en Vercel serverless), procesamos, y lo borramos.
  // Nombre random para evitar colisión entre lambdas concurrentes.
  const tmpPath = join(
    tmpdir(),
    `wordx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.doc`,
  );

  try {
    await writeFile(tmpPath, Buffer.from(bytes));
    const extractor = new WordExtractor();
    const document = await extractor.extract(tmpPath);
    // El método getBody() devuelve el texto principal (sin headers/footers).
    // Si necesitamos headers/footers tenemos getHeaders()/getFooters() también.
    const body = document.getBody().trim();
    const headers = document.getHeaders().trim();
    const footers = document.getFooters().trim();
    const annotations = document.getAnnotations().trim();
    const endnotes = document.getEndnotes().trim();
    const footnotes = document.getFootnotes().trim();

    // Concatenamos todo en orden lógico — para OCR/búsqueda nos interesa
    // tener TODO el texto disponible. Headers/footers van al final con
    // separadores para no contaminar el body.
    const parts: string[] = [];
    if (body) parts.push(body);
    if (headers) parts.push(`\n\n[ENCABEZADOS]\n${headers}`);
    if (footers) parts.push(`\n\n[PIES DE PÁGINA]\n${footers}`);
    if (annotations) parts.push(`\n\n[NOTAS]\n${annotations}`);
    if (footnotes) parts.push(`\n\n[NOTAS AL PIE]\n${footnotes}`);
    if (endnotes) parts.push(`\n\n[NOTAS FINALES]\n${endnotes}`);
    const text = parts.join("").trim();

    if (text.length < 5) {
      return {
        status: "skipped",
        reason: "Documento Word legacy sin texto extraíble.",
      };
    }
    return { status: "done", text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "failed", reason: `word-extractor falló: ${msg.slice(0, 200)}` };
  } finally {
    // Borrar el temp file siempre — no nos importa si falla (Vercel
    // limpia /tmp entre invocations de todos modos).
    await unlink(tmpPath).catch(() => {});
  }
}
