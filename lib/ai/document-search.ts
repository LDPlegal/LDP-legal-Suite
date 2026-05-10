// Semantic-style document search via Claude (Fase 5.4).
//
// Strategy without embeddings/pgvector: pull a candidate set with the
// existing ILIKE search, then ask Claude to rank by relevance to the
// natural-language question and emit a short relevance reason. We don't
// pay the embedding-DB-rebuild cost at the price of one Claude call per
// query, which is fine for a per-firm internal tool.
//
// Failure mode if the candidate set is empty: skip the LLM call and
// return [] — Claude can't rank what isn't there.

import "server-only";
import { runPrompt } from "./claude";

export type RankedDocument = {
  id: string;
  name: string;
  caseId: string | null;
  caseCode: string | null;
  caseTitle: string | null;
  createdAt: Date;
  // Claude's score 0–10. Higher = more relevant.
  score: number;
  // Short explanation in Spanish: why this doc is relevant.
  reason: string;
};

export type DocumentCandidate = {
  id: string;
  name: string;
  caseId: string | null;
  caseCode: string | null;
  caseTitle: string | null;
  createdAt: Date;
  ocrText: string | null;
};

const MAX_OCR_PER_DOC = 1500;
const MAX_CANDIDATES = 30;

export type SemanticSearchResult = {
  ranked: RankedDocument[];
  usage: { inputTokens: number; outputTokens: number };
};

export async function rankDocumentsByQuery(
  query: string,
  candidates: DocumentCandidate[],
): Promise<SemanticSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ranked: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }
  const slice = candidates.slice(0, MAX_CANDIDATES);
  if (slice.length === 0) {
    return { ranked: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const docList = slice
    .map((d, i) => {
      const ocr = d.ocrText
        ? d.ocrText.slice(0, MAX_OCR_PER_DOC).replace(/\n+/g, " ")
        : "(sin OCR)";
      return `[${i}] ${d.name} (${d.caseCode ?? "sin caso"}) — ${ocr}`;
    })
    .join("\n\n");

  const userMessage = [
    `Pregunta del usuario: ${trimmed}`,
    "",
    "Lista de documentos candidatos (índice + nombre + caso + extracto OCR):",
    docList,
    "",
    "Devuelve un JSON estricto, sin texto adicional, con esta forma:",
    `{"ranked":[{"index": <número>, "score": <0-10>, "reason": "<frase corta en español>"}, ...]}`,
    "",
    "Reglas:",
    "- Incluye solo documentos con score >= 4. Ignora los irrelevantes.",
    "- Ordena de mayor a menor score.",
    "- 'reason' debe explicar en una frase por qué es relevante para la pregunta.",
    "- Máximo 10 entradas.",
    "- Solo el JSON, sin Markdown, sin comentarios.",
  ].join("\n");

  const result = await runPrompt(
    [{ role: "user", content: userMessage }],
    {
      systemAddendum:
        "Eres un buscador de documentos legales. Tu única salida es un objeto JSON válido. Ningún texto fuera del JSON.",
      maxTokens: 1500,
      temperature: 0.1,
    },
  );

  let parsed: { ranked: Array<{ index: number; score: number; reason: string }> };
  try {
    // Strip markdown code fences if Claude added them despite the instruction.
    const cleaned = result.text
      .trim()
      .replace(/^```(?:json)?\s*/u, "")
      .replace(/\s*```$/u, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      ranked: [],
      usage: result.usage,
    };
  }

  const ranked: RankedDocument[] = [];
  for (const r of parsed.ranked ?? []) {
    const doc = slice[r.index];
    if (!doc) continue;
    if (typeof r.score !== "number" || r.score < 4) continue;
    ranked.push({
      id: doc.id,
      name: doc.name,
      caseId: doc.caseId,
      caseCode: doc.caseCode,
      caseTitle: doc.caseTitle,
      createdAt: doc.createdAt,
      score: Math.min(10, Math.max(0, r.score)),
      reason: typeof r.reason === "string" ? r.reason.slice(0, 240) : "",
    });
  }
  ranked.sort((a, b) => b.score - a.score);

  return { ranked, usage: result.usage };
}
