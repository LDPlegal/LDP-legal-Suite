// Detección de tipo de archivo por MAGIC BYTES (los primeros bytes que
// identifican el formato), NO por extensión ni por file.type del browser.
//
// Motivación: archivos sin extensión llegan al server con
// file.type = "application/octet-stream", lo que rompe el ruteo de OCR.
// Los magic bytes son el ÚNICO source of truth confiable.
//
// Ejemplos:
//   - PDF: comienza con "%PDF-" (25 50 44 46 2D)
//   - JPEG: FF D8 FF
//   - PNG: 89 50 4E 47
//   - DOCX (ZIP wrapper): 50 4B 03 04 con manifest interno específico
//
// La librería `file-type` maneja estos chequeos por nosotros.

import { fileTypeFromBuffer } from "file-type";

export type DetectedFileType = {
  /** MIME type confiable, ej. "application/pdf" / "image/jpeg" /
   *  "application/vnd.openxmlformats-officedocument.wordprocessingml.document". */
  mimeType: string;
  /** Extensión sin punto, ej. "pdf", "jpg", "docx". */
  extension: string;
  /** True si pudimos detectar el tipo por magic bytes. Si false, los demás
   *  campos son un fallback (browser-reported o "application/octet-stream"). */
  detected: boolean;
};

/** MIME types que sabemos cómo procesar para OCR / extracción de texto. */
export const PROCESSABLE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc legacy — extraído con word-extractor
  "application/x-cfb", // contenedor CFB/OLE2 (a menudo .doc viejo)
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/gif",
  "image/tiff",
]);

/** Detecta el tipo real de un archivo a partir de sus bytes.
 *  Si los magic bytes no son reconocidos, cae al hint que tenemos del
 *  browser (puede ser "application/octet-stream" si el browser tampoco supo). */
export async function detectFileType(
  bytes: Uint8Array,
  browserHint?: string | null,
  filenameHint?: string | null,
): Promise<DetectedFileType> {
  // Magic byte detection — el caso ideal.
  const ft = await fileTypeFromBuffer(bytes);
  if (ft) {
    return {
      mimeType: ft.mime,
      extension: ft.ext,
      detected: true,
    };
  }

  // Fallback 1: extensión del archivo. Si llegó con extensión real
  // (poco común dada nuestra realidad, pero por las dudas), inferir.
  if (filenameHint) {
    const ext = filenameHint.split(".").pop()?.toLowerCase() ?? "";
    const byExt = EXT_TO_MIME[ext];
    if (byExt) {
      return { mimeType: byExt, extension: ext, detected: false };
    }
  }

  // Fallback 2: lo que dijo el browser. Si dijo "application/octet-stream",
  // se queda así — claramente no sabemos qué es.
  const browserMime = browserHint && browserHint !== "application/octet-stream"
    ? browserHint
    : "application/octet-stream";
  return {
    mimeType: browserMime,
    extension: MIME_TO_EXT[browserMime] ?? "",
    detected: false,
  };
}

/** Mapeo extension → MIME para fallback cuando los magic bytes fallan
 *  pero sabemos la extensión. Solo formatos comunes. */
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  cfb: "application/x-cfb",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
};

const MIME_TO_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_TO_MIME).map(([ext, mime]) => [mime, ext]),
);

/** Si tenemos un archivo cuyo `name` carece de extensión, le agregamos
 *  la correcta basada en el tipo detectado. Útil para que el download
 *  sea usable: el SO sabe con qué abrirlo. */
export function ensureFilenameExtension(
  filename: string,
  detected: DetectedFileType,
): string {
  if (!detected.detected || !detected.extension) return filename;
  // Si ya tiene una extensión coherente, no la tocamos.
  const lower = filename.toLowerCase();
  if (lower.endsWith(`.${detected.extension}`)) return filename;
  // Edge: jpg/jpeg son intercambiables — no agregamos otra extensión.
  if (
    detected.extension === "jpg" &&
    (lower.endsWith(".jpeg") || lower.endsWith(".jpg"))
  ) {
    return filename;
  }
  return `${filename}.${detected.extension}`;
}
