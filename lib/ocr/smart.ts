// Smart OCR provider — detecta tipo por magic bytes y rutea al pipeline
// más apropiado, con fallback a Claude Vision para casos difíciles.

import "server-only";
import os from "os";
import { detectFileType } from "@/lib/files/detect-type";
import {
  OCR_MAX_BYTES_CLAUDE,
  OCR_MAX_BYTES_LOCAL,
  type OcrProvider,
  type OcrResult,
} from "./index";
import { extractDocxText } from "./docx";
import { extractDocLegacyText } from "./doc-legacy";
import { ocrWithClaude } from "./claude-vision";

const TESSERACT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
]);

type TesseractWorker = {
  recognize: (
    input: Uint8Array | Buffer,
  ) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<void>;
};

export class SmartOcr implements OcrProvider {
  private workerPromise: Promise<TesseractWorker> | null = null;

  private async getTesseract(): Promise<TesseractWorker> {
    if (this.workerPromise) return this.workerPromise;
    this.workerPromise = (async () => {
      const tesseract = await import("tesseract.js");
      const w = await tesseract.createWorker(["spa", "eng"], 1, {
        cachePath: os.tmpdir(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: (m: any) =>
          console.log("[Tesseract]", m.status, Math.round(m.progress * 100) + "%"),
      });
      return w as unknown as TesseractWorker;
    })();
    return this.workerPromise;
  }

  async recognize(input: {
    mimeType: string;
    bytes: Uint8Array;
    sizeBytes: number;
    filename?: string;
    firmId?: string;
    userId?: string;
  }): Promise<OcrResult> {
    // ─── Paso 1: detectar tipo REAL ───
    const detected = await detectFileType(
      input.bytes,
      input.mimeType,
      input.filename ?? null,
    );
    const realMime = detected.mimeType;

    console.log(
      `[OCR] file detected as ${realMime} (browser said: ${input.mimeType}, magic bytes: ${detected.detected ? "yes" : "no"}, ext from name: ${detected.extension || "n/a"})`,
    );

    // ─── Paso 2: rutear por tipo real ───

    // ── PDFs ──
    if (realMime === "application/pdf") {
      // 2a. Intentar extracción de texto digital (free, instant para PDFs
      //     con capa de texto).
      if (input.sizeBytes <= OCR_MAX_BYTES_LOCAL) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfExtraction = require("pdf-extraction");
          const data = await pdfExtraction(Buffer.from(input.bytes));
          const text = (data.text ?? "").trim();
          // Si extrajo texto sustancial (>50 chars) lo damos por bueno.
          if (text.length > 50) {
            return {
              status: "done",
              text,
              method: "pdf-extraction (text layer)",
            };
          }
          console.log(
            `[OCR] PDF text layer empty/tiny (${text.length} chars). Falling back to Claude Vision.`,
          );
        } catch (e) {
          console.log(
            `[OCR] pdf-extraction failed: ${e instanceof Error ? e.message : String(e)}. Trying Claude Vision.`,
          );
        }
      }

      // 2b. Fallback: Claude Vision (procesa PDFs escaneados/manuscritos).
      if (!input.firmId || !input.userId) {
        return {
          status: "skipped",
          reason:
            "PDF escaneado: no podemos hacer OCR con Claude sin firmId/userId para tracking de costo. Verificá que el upload action pase user.",
        };
      }
      if (input.sizeBytes > OCR_MAX_BYTES_CLAUDE) {
        return {
          status: "skipped",
          reason: `PDF > ${Math.round(OCR_MAX_BYTES_CLAUDE / 1024 / 1024)}MB; demasiado grande para OCR con Claude.`,
        };
      }
      const claudeResult = await ocrWithClaude({
        bytes: input.bytes,
        mimeType: "application/pdf",
        firmId: input.firmId,
        userId: input.userId,
      });
      if (claudeResult.status === "done") {
        return { status: "done", text: claudeResult.text, method: "claude-vision (pdf)" };
      }
      return claudeResult;
    }

    // ── Word DOCX ──
    if (
      realMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const r = await extractDocxText(input.bytes);
      if (r.status === "done") {
        return { status: "done", text: r.text, method: "mammoth (docx)" };
      }
      return r;
    }

    // ── Word DOC legacy (.doc — CFB/OLE2 format) ──
    // file-type devuelve "application/msword" para .doc o "application/x-cfb"
    // para el contenedor CFB cuando no detecta el sub-tipo Word. Manejamos
    // ambos — word-extractor sabe parsear ambos casos.
    if (
      realMime === "application/msword" ||
      realMime === "application/x-cfb" ||
      realMime === "application/vnd.ms-office"
    ) {
      const r = await extractDocLegacyText(input.bytes);
      if (r.status === "done") {
        return { status: "done", text: r.text, method: "word-extractor (doc legacy)" };
      }
      // Si word-extractor falló (puede ser un .xls/.ppt legacy disfrazado de
      // CFB), devolver el resultado tal cual con el motivo claro.
      return r;
    }

    // ── Imágenes ──
    if (realMime.startsWith("image/")) {
      // 3a. Tesseract local primero (cheap & fast para imágenes claras).
      if (TESSERACT_MIMES.has(realMime) && input.sizeBytes <= OCR_MAX_BYTES_LOCAL) {
        try {
          const worker = await this.getTesseract();
          const result = await Promise.race([
            worker.recognize(input.bytes),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Tesseract timeout 20s")),
                20000,
              ),
            ),
          ]);
          const text = result.data.text.trim();
          // Si Tesseract devolvió texto razonable con confidence decente,
          // lo damos por bueno. Si no, fallback a Claude.
          if (text.length >= 20 && result.data.confidence >= 50) {
            return {
              status: "done",
              text,
              confidence: result.data.confidence,
              method: "tesseract",
            };
          }
          console.log(
            `[OCR] Tesseract low quality (${text.length} chars, ${result.data.confidence}% conf). Falling back to Claude.`,
          );
        } catch (e) {
          console.log(
            `[OCR] Tesseract failed: ${e instanceof Error ? e.message : String(e)}. Trying Claude.`,
          );
        }
      }

      // 3b. Fallback: Claude Vision.
      if (!input.firmId || !input.userId) {
        return {
          status: "skipped",
          reason: "Imagen: Tesseract no pudo extraer y no hay firmId/userId para Claude.",
        };
      }
      if (input.sizeBytes > OCR_MAX_BYTES_CLAUDE) {
        return {
          status: "skipped",
          reason: `Imagen > ${Math.round(OCR_MAX_BYTES_CLAUDE / 1024 / 1024)}MB; demasiado grande para Claude.`,
        };
      }
      // Claude solo acepta jpeg/png/gif/webp — convertir bmp/tiff falla acá.
      const claudeCompatible =
        realMime === "image/jpeg" ||
        realMime === "image/png" ||
        realMime === "image/gif" ||
        realMime === "image/webp";
      if (!claudeCompatible) {
        return {
          status: "skipped",
          reason: `Tipo ${realMime} no soportado por Claude (solo JPEG/PNG/GIF/WebP). Convertí la imagen a PNG y subila otra vez.`,
        };
      }
      const claudeResult = await ocrWithClaude({
        bytes: input.bytes,
        mimeType: realMime,
        firmId: input.firmId,
        userId: input.userId,
      });
      if (claudeResult.status === "done") {
        return { status: "done", text: claudeResult.text, method: "claude-vision (image)" };
      }
      return claudeResult;
    }

    // ── Texto plano / CSV ──
    if (realMime === "text/plain" || realMime === "text/csv") {
      try {
        const text = new TextDecoder("utf-8").decode(input.bytes).trim();
        if (text.length < 5) {
          return { status: "skipped", reason: "Archivo de texto vacío." };
        }
        return { status: "done", text, method: "utf8-decode" };
      } catch (e) {
        return {
          status: "failed",
          reason: `Decodificación falló: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    // ── Otros tipos no soportados ──
    return {
      status: "skipped",
      reason: `Tipo ${realMime} no soportado para OCR. Soportados: PDF, Word (.docx), JPG/PNG/GIF/WebP, texto plano.`,
    };
  }
}
