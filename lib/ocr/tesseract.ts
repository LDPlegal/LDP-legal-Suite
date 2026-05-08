// lib/ocr/tesseract.ts
//
// tesseract.js driver. First call downloads ~30 MB of language data (Spanish
// + English) into ./node_modules/tesseract.js/.cache. Subsequent calls reuse
// the cached worker. We instantiate the worker lazily and keep it warm for
// the lifetime of the process.
//
// Limitations explicitly accepted in Fase 2 (DECISIONS.md F2.4):
//   * Image MIME types (image/jpeg, image/png, image/webp) only.
//   * PDFs are NOT OCR'd here — they're marked "skipped" with reason
//     "pdf-ocr-fase-2-5". A future Fase 2.5 adds pdfjs-dist + per-page OCR.
//   * Synchronous: caller waits ~3-10s per image. Files > OCR_MAX_BYTES are
//     also skipped to keep the upload action under the request timeout.

import { OCR_MAX_BYTES, type OcrProvider, type OcrResult } from "./index";

const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);

type Worker = {
  recognize: (input: Uint8Array | Buffer) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<void>;
};

export class TesseractOcr implements OcrProvider {
  private workerPromise: Promise<Worker> | null = null;

  private async getWorker(): Promise<Worker> {
    if (this.workerPromise) return this.workerPromise;
    this.workerPromise = (async () => {
      const tesseract = await import("tesseract.js");
      // createWorker(['spa', 'eng']) loads both language data files. Spanish
      // is the primary; English helps with mixed legal text.
      const w = await tesseract.createWorker(["spa", "eng"]);
      return w as unknown as Worker;
    })();
    return this.workerPromise;
  }

  async recognize(input: {
    mimeType: string;
    bytes: Uint8Array;
    sizeBytes: number;
  }): Promise<OcrResult> {
    if (input.sizeBytes > OCR_MAX_BYTES) {
      return {
        status: "skipped",
        reason: `Archivo > ${Math.round(OCR_MAX_BYTES / 1024 / 1024)}MB; OCR async llega en Fase 2.5.`,
      };
    }
    if (input.mimeType === "application/pdf") {
      return {
        status: "skipped",
        reason: "PDF OCR (rendering por página) llega en Fase 2.5.",
      };
    }
    if (!SUPPORTED_MIME.has(input.mimeType)) {
      return { status: "skipped", reason: `MIME ${input.mimeType} no soportado para OCR.` };
    }

    try {
      const worker = await this.getWorker();
      const result = await worker.recognize(input.bytes);
      return {
        status: "done",
        text: result.data.text.trim(),
        confidence: result.data.confidence,
      };
    } catch (e: unknown) {
      return {
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
