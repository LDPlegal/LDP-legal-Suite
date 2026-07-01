"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled, AiNotConfiguredError } from "@/lib/ai";
import { rankDocumentsByQuery } from "@/lib/ai/document-search";
import { withFirm } from "@/lib/db/with-firm";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { cases, documents } from "@/lib/db/schema";

const Schema = z.object({
  query: z.string().trim().min(2).max(500),
});

export type BuscarDocsState =
  | {
      ok: true;
      results: Array<{
        id: string;
        name: string;
        caseId: string | null;
        caseCode: string | null;
        caseTitle: string | null;
        createdAt: Date;
        score: number;
        reason: string;
      }>;
      candidateCount: number;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { ok: false; error: string };

export async function buscarDocumentosAction(
  query: string,
): Promise<BuscarDocsState> {
  const user = await requireUser();
  if (!isAiEnabled()) {
    return {
      ok: false,
      error: "La integración con Claude no está configurada. Ve a Configuración → IA.",
    };
  }
  const parsed = Schema.safeParse({ query });
  if (!parsed.success) {
    return { ok: false, error: "Escribe una pregunta más larga." };
  }

  // Build a candidate set. We do a permissive ILIKE first to narrow before
  // sending to Claude. If the query is so abstract that nothing matches,
  // fall back to "most recent N docs with OCR" so semantic search still
  // has something to rank.
  const term = `%${parsed.data.query}%`;
  const candidates = await withFirm(user.firmId, user.userId, async (tx) => {
    const rows = await tx
      .select({
        id: documents.id,
        name: documents.name,
        ocrText: documents.ocrText,
        createdAt: documents.createdAt,
        caseId: documents.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
      })
      .from(documents)
      .leftJoin(cases, eq(cases.id, documents.caseId))
      .where(
        and(
          isNull(documents.deletedAt),
          or(
            eq(documents.visibility, "case"),
            eq(documents.uploadedBy, user.userId),
          ),
          or(
            sql`${documents.name} ILIKE ${term}`,
            sql`${documents.ocrText} ILIKE ${term}`,
            sql`array_to_string(${documents.tags}, ',') ILIKE ${term}`,
          ),
        ),
      )
      .limit(30);
    if (rows.length > 0) return rows;
    // Fallback: latest 30 docs that have OCR text
    return tx
      .select({
        id: documents.id,
        name: documents.name,
        ocrText: documents.ocrText,
        createdAt: documents.createdAt,
        caseId: documents.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
      })
      .from(documents)
      .leftJoin(cases, eq(cases.id, documents.caseId))
      .where(
        and(
          isNull(documents.deletedAt),
          or(
            eq(documents.visibility, "case"),
            eq(documents.uploadedBy, user.userId),
          ),
          sql`${documents.ocrText} IS NOT NULL`,
        ),
      )
      .orderBy(sql`${documents.createdAt} DESC`)
      .limit(30);
  });

  if (candidates.length === 0) {
    return {
      ok: true,
      results: [],
      candidateCount: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  try {
    const result = await rankDocumentsByQuery(parsed.data.query, candidates, {
      firmId: user.firmId,
      userId: user.userId,
    });
    return {
      ok: true,
      results: result.ranked,
      candidateCount: candidates.length,
      usage: result.usage,
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo ejecutar la búsqueda IA.",
    };
  }
}

