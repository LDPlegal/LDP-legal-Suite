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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");
import os from "os";

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
      // createWorker(['spa', 'eng']) loads both language data files.
      const w = await tesseract.createWorker(["spa", "eng"], 1, {
        cachePath: os.tmpdir(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: (m: any) => console.log("[Tesseract]", m.status, Math.round(m.progress * 100) + "%"),
      });
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
      try {
        const data = await pdfParse(Buffer.from(input.bytes));
        if (data.text && data.text.trim().length > 10) {
          return {
            status: "done",
            text: data.text.trim(),
            confidence: 1, // Texto digital extraído directamente
          };
        } else {
          return {
            status: "skipped",
            reason: "El PDF parece ser un documento escaneado (solo imágenes). El OCR completo de PDFs escaneados llegará en Fase 2.5.",
          };
        }
      } catch (e: unknown) {
        return {
          status: "failed",
          reason: e instanceof Error ? e.message : String(e),
        };
      }
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
