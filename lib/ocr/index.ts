// OCR provider — pipeline unificado con detección por magic bytes y
// fallback inteligente.
//
// Flujo:
//   1. Detectar tipo REAL del archivo por magic bytes (no confiar en
//      file.type del browser ni en la extensión, ambos mienten cuando
//      el archivo no tiene extensión o vino de OneDrive/Drive).
//   2. Rutear por tipo detectado:
//      - PDF: pdf-extraction primero (gratis, instant para PDFs con
//        capa de texto digital). Si no hay texto → Claude Vision
//        (procesa PDF escaneado, manuscrito, etc).
//      - DOCX: mammoth.js (gratis, extrae texto literal).
//      - DOC legacy: skipped con mensaje (no podemos extraer .doc viejo
//        sin antiword/textutil — el user puede re-exportar a docx).
//      - Imágenes: Tesseract.js primero (gratis, local). Si confidence
//        baja o falla → Claude Vision.
//      - Otros: skipped con mensaje claro.
//   3. La función devuelve `OcrResult` con status + text + reason.
//      El upload action persiste según el status.

export type OcrResult =
  | { status: "done"; text: string; confidence?: number; method?: string }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

export interface OcrProvider {
  /** Procesa un archivo y devuelve su texto. El provider hace su propia
   *  detección de tipo por magic bytes — el `mimeType` recibido es solo
   *  un hint y puede ser "application/octet-stream". */
  recognize(input: {
    mimeType: string;
    bytes: Uint8Array;
    sizeBytes: number;
    filename?: string;
    firmId?: string;
    userId?: string;
  }): Promise<OcrResult>;
}

let providerSingleton: OcrProvider | null = null;

// Topes:
//   - 5MB para extracción local (tesseract / pdf-extraction / mammoth) — keep
//     request latency under Vercel limits
//   - 10MB para Claude Vision fallback (más generoso porque el procesamiento
//     pasa a la API de Anthropic, no a nuestra lambda)
export const OCR_MAX_BYTES_LOCAL = 5 * 1024 * 1024;
export const OCR_MAX_BYTES_CLAUDE = 10 * 1024 * 1024;

export async function getOcr(): Promise<OcrProvider> {
  if (providerSingleton) return providerSingleton;
  const driver = process.env.OCR_DRIVER ?? "smart";
  if (driver === "smart" || driver === "tesseract") {
    // El driver "tesseract" legacy ahora apunta al smart pipeline —
    // tesseract sigue siendo parte del flujo pero no es el único.
    const { SmartOcr } = await import("./smart");
    providerSingleton = new SmartOcr();
  } else if (driver === "off") {
    providerSingleton = {
      async recognize() {
        return { status: "skipped", reason: "OCR_DRIVER=off" };
      },
    };
  } else {
    throw new Error(
      `Unknown OCR_DRIVER='${driver}'. Use 'smart' (default), 'tesseract' (alias), o 'off'.`,
    );
  }
  return providerSingleton;
}
