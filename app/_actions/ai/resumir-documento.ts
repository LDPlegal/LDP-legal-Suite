"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDocumentById } from "@/lib/db/queries/documents";
import { summarizeDocument } from "@/lib/ai/document-summary";

const Schema = z.object({
  documentId: z.string().uuid(),
});

export type ResumirDocumentoState =
  | { ok: true; text: string; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; error: string };

export async function resumirDocumentoAction(
  _prev: ResumirDocumentoState | undefined,
  formData: FormData,
): Promise<ResumirDocumentoState> {
  const user = await requireUser();
  const parsed = Schema.safeParse({
    documentId: formData.get("documentId"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos." };
  }

  try {
    const doc = await getDocumentById(user.firmId, user.userId, parsed.data.documentId);
    if (!doc) {
      return { ok: false, error: "Documento no encontrado." };
    }

    const result = await summarizeDocument(user.firmId, user.userId, {
      name: doc.name,
      mimeType: doc.mimeType,
      ocrText: doc.ocrText,
      sizeBytes: doc.sizeBytes,
    });

    return {
      ok: true,
      text: result.text,
      usage: result.usage,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return { ok: false, error: message };
  }
}
