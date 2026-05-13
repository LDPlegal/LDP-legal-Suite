"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteDocument } from "@/lib/db/queries/documents";

const Schema = z.object({
  documentId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
});

export async function eliminarDocumentoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const rawCaseId = formData.get("caseId");
  const parsed = Schema.parse({
    documentId: formData.get("documentId"),
    caseId: typeof rawCaseId === "string" && rawCaseId.trim() ? rawCaseId.trim() : undefined,
  });
  await softDeleteDocument(user.firmId, user.userId, parsed.documentId);
  if (parsed.caseId) {
    revalidatePath(`/casos/${parsed.caseId}`);
  }
  revalidatePath("/documentos");
}
