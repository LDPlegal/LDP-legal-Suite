"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  getDocumentById,
  cacheDocumentFormattedMarkdown,
} from "@/lib/db/queries/documents";
import { isAiEnabled } from "@/lib/ai";
import { formatDocument } from "@/lib/ai/document-format";

const Schema = z.object({ documentId: z.string().uuid() });

export type FormatearDocumentoState =
  | { ok: true; markdown: string; cached: boolean }
  | { ok: false; error: string };

// Reformatea el texto extraído de un documento (OCR/DOCX) en Markdown
// legible con títulos y negritas — sin resumir. Cachea el resultado en el
// documento: la primera vez llama a la IA, las siguientes lo devuelve al
// instante sin costo.
export async function formatearDocumentoAction(
  documentId: string,
): Promise<FormatearDocumentoState> {
  const user = await requireUser();
  const parsed = Schema.safeParse({ documentId });
  if (!parsed.success) return { ok: false, error: "Documento inválido." };

  try {
    const doc = await getDocumentById(user.firmId, user.userId, parsed.data.documentId);
    if (!doc) return { ok: false, error: "Documento no encontrado." };

    // Caché: si ya se formateó antes, devolverlo sin llamar a la IA.
    if (doc.formattedMarkdown && doc.formattedMarkdown.trim().length > 0) {
      return { ok: true, markdown: doc.formattedMarkdown, cached: true };
    }

    if (!isAiEnabled()) {
      return { ok: false, error: "La IA no está configurada." };
    }

    const result = await formatDocument(user.firmId, user.userId, {
      name: doc.name,
      ocrText: doc.ocrText,
    });
    // Guardar en caché best-effort (no romper si falla el update).
    try {
      await cacheDocumentFormattedMarkdown(
        user.firmId,
        user.userId,
        parsed.data.documentId,
        result.markdown,
      );
    } catch {
      // ignore
    }
    return { ok: true, markdown: result.markdown, cached: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al dar formato.",
    };
  }
}
