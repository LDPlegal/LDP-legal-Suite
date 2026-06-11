"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { moveDocumentToFolder } from "@/lib/db/queries/folders";

const Schema = z.object({
  documentId: z.string().uuid(),
  // string vacío o "null" para mover a raíz.
  folderId: z.string().uuid().nullable(),
});

export type MoverDocumentoState =
  | { ok: true }
  | { ok: false; error: string };

export async function moverDocumentoAction(input: {
  documentId: string;
  folderId: string | null;
}): Promise<MoverDocumentoState> {
  const user = await requireUser();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const ok = await moveDocumentToFolder(
    user.firmId,
    user.userId,
    parsed.data.documentId,
    parsed.data.folderId,
  );
  if (!ok) return { ok: false, error: "Documento no encontrado." };

  revalidatePath("/documentos");
  return { ok: true };
}
