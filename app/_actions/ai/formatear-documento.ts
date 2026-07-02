"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDocumentById } from "@/lib/db/queries/documents";
import { isAiEnabled } from "@/lib/ai";
import { formatDocument } from "@/lib/ai/document-format";

const Schema = z.object({ documentId: z.string().uuid() });

export type FormatearDocumentoState =
  | { ok: true; markdown: string; truncated: boolean }
  | { ok: false; error: string };

// Reformatea el texto extraído de un documento (OCR/DOCX) en Markdown
// legible con títulos y negritas — sin resumir. Para leer contratos y
// escritos directo en la app en vez de texto plano corrido.
export async function formatearDocumentoAction(
  documentId: string,
): Promise<FormatearDocumentoState> {
  const user = await requireUser();
  if (!isAiEnabled()) {
    return { ok: false, error: "La IA no está configurada." };
  }
  const parsed = Schema.safeParse({ documentId });
  if (!parsed.success) return { ok: false, error: "Documento inválido." };

  try {
    const doc = await getDocumentById(user.firmId, user.userId, parsed.data.documentId);
    if (!doc) return { ok: false, error: "Documento no encontrado." };

    const result = await formatDocument(user.firmId, user.userId, {
      name: doc.name,
      ocrText: doc.ocrText,
    });
    return { ok: true, markdown: result.markdown, truncated: result.truncated };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al dar formato.",
    };
  }
}
