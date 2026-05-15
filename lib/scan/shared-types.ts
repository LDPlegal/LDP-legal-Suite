import { z } from "zod";

// Limits chosen conservatively. fileName matches typical OS limits;
// ocrText capped at ~2 MB to avoid blowing the row size on very long
// scanned books (worker should chunk if it exceeds). 50 MB binary file
// cap matches the regular upload path.
const MAX_FILENAME = 255;
const MAX_OCR_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const scanIngestSchema = z.object({
  userEmail: z.string().email().max(200),
  fileName: z.string().min(1).max(MAX_FILENAME),
  storageKey: z.string().min(1).max(500),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
  ocrText: z.string().max(MAX_OCR_BYTES),
  classification: z.object({
    documentType: z.string().max(120),
    parties: z.array(z.string().max(200)).max(20),
    documentDate: z.string().nullable(),
  }),
  sourcePrinter: z.enum(["hp_m428fdw", "canon_mf452dw", "unknown"]),
  // Idempotency key (Fase 6 hardening). When set, a retry with the same
  // scanId returns the existing document instead of creating a duplicate.
  // Strongly recommended — workers SHOULD always send this. Optional for
  // backward compatibility with the original worker that doesn't send it
  // (those calls aren't idempotent and a retry creates a duplicate row).
  scanId: z.string().min(1).max(120).optional(),
  aiUsage: z.object({
    model: z.string().max(80),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    // Worker-reported cost — the server re-computes using its own pricing
    // table so this field is informational only. Keeps `costUsd` honest
    // even if the worker miscomputes or is compromised.
    costUsd: z.number().nonnegative(),
  }),
});

export type ScanIngestPayload = z.infer<typeof scanIngestSchema>;

export const resolveUserSchema = z.object({
  userEmail: z.string().email().max(200),
});

export type ResolveUserPayload = z.infer<typeof resolveUserSchema>;
