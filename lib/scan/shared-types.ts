import { z } from "zod";

export const scanIngestSchema = z.object({
  userEmail: z.string().email(),
  fileName: z.string().min(1).max(255),
  storageKey: z.string().min(1),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive(),
  ocrText: z.string(),
  classification: z.object({
    documentType: z.string(),
    parties: z.array(z.string()),
    documentDate: z.string().nullable(),
  }),
  sourcePrinter: z.enum(["hp_m428fdw", "canon_mf452dw", "unknown"]),
  aiUsage: z.object({
    model: z.string(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  }),
});

export type ScanIngestPayload = z.infer<typeof scanIngestSchema>;

export const resolveUserSchema = z.object({
  userEmail: z.string().email(),
});

export type ResolveUserPayload = z.infer<typeof resolveUserSchema>;
