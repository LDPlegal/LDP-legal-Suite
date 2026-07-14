// GET /api/ai/diag
//
// Diagnóstico de la integración con Anthropic EN el servidor de producción.
// La ANTHROPIC_API_KEY de Vercel es "sensitive" (no se puede leer desde la
// CLI), así que la única forma de saber por qué falla la IA es hacer una
// llamada mínima desde el propio runtime y devolver el error exacto.
//
// Auth: Bearer AI_DIAG_SECRET (env var propia; si no está definida, el
// endpoint responde 404 y queda inerte). No expone la API key ni datos de
// la firma — solo el resultado/error de una llamada de prueba de ~10 tokens.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { friendlyAiError } from "@/lib/ai/claude";

function isAuthorized(req: Request): boolean {
  const secret = process.env.AI_DIAG_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!process.env.AI_DIAG_SECRET) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const keyPresent = Boolean(process.env.ANTHROPIC_API_KEY);
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  if (!keyPresent) {
    return NextResponse.json({
      ok: false,
      keyPresent,
      model,
      friendly: "ANTHROPIC_API_KEY no está definida en el runtime del servidor.",
    });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "Responde únicamente: ok" }],
    });
    const text = res.content
      .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();
    return NextResponse.json({
      ok: true,
      keyPresent,
      model: res.model,
      text,
      usage: res.usage,
    });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    const raw = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      keyPresent,
      model,
      status,
      friendly: friendlyAiError(err).message,
      raw: raw.replace(/\s+/g, " ").slice(0, 500),
    });
  }
}
