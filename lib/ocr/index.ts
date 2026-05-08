// lib/ocr/index.ts
//
// OCR provider abstraction. Maestro § 9.7 mandates "OCR real, no placeholder"
// in Fase 2 with an OCRProvider interface so the implementation (Tesseract
// local in dev / docker, AWS Textract / Google Document AI in cloud) is
// swappable via env.
//
// Fase 2 ships with a tesseract.js driver. The decision to do OCR
// synchronously on upload (no pg-boss queue) is documented in DECISIONS.md
// F2.4. A 5 MB / 50-page ceiling protects request latency.

export type OcrResult =
  | { status: "done"; text: string; confidence?: number }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

export interface OcrProvider {
  /** Run OCR on the given bytes. The driver decides what mime types it can handle. */
  recognize(input: { mimeType: string; bytes: Uint8Array; sizeBytes: number }): Promise<OcrResult>;
}

let providerSingleton: OcrProvider | null = null;

export const OCR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB sync ceiling — maestro F2.4

export async function getOcr(): Promise<OcrProvider> {
  if (providerSingleton) return providerSingleton;
  const driver = process.env.OCR_DRIVER ?? "tesseract";
  if (driver === "tesseract") {
    const { TesseractOcr } = await import("./tesseract");
    providerSingleton = new TesseractOcr();
  } else if (driver === "off") {
    // Explicit no-op — useful for tests / CI where downloading language data is undesirable.
    providerSingleton = {
      async recognize() {
        return { status: "skipped", reason: "OCR_DRIVER=off" };
      },
    };
  } else {
    throw new Error(`Unknown OCR_DRIVER='${driver}'. Only 'tesseract' and 'off' are implemented.`);
  }
  return providerSingleton;
}
