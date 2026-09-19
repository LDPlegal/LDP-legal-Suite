"use server";

// Devuelve el texto OCR de un documento para mostrarlo en el preview drawer.
// No incluimos el texto en el listado de docs porque puede ser pesado (un
// PDF largo extraído puede ser ~50KB de texto), lo cargamos on-demand
// cuando el user abre el preview.

import { requireUser } from "@/lib/auth/session";
import { getDocumentById } from "@/lib/db/queries/documents";

export type GetTextState =
  | {
      ok: true;
      text: string | null;
      ocrStatus: string;
      mimeType: string;
      name: string;
      /** Markdown formateado por IA en caché (si ya se generó). */
      formattedMarkdown: string | null;
    }
  | { ok: false; error: string };

export async function getDocumentTextAction(docId: string): Promise<GetTextState> {
  const user = await requireUser();
  const doc = await getDocumentById(user.firmId, user.userId, docId);
  if (!doc) return { ok: false, error: "Documento no encontrado." };

  return {
    ok: true,
    text: doc.ocrText,
    ocrStatus: doc.ocrStatus,
    mimeType: doc.mimeType,
    name: doc.name,
    formattedMarkdown: doc.formattedMarkdown ?? null,
  };
}
