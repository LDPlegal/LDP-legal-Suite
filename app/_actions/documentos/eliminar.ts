"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteDocument } from "@/lib/db/queries/documents";

const Schema = z.object({
  documentId: z.string().uuid(),
  caseId: z.string().uuid(),
});

export async function eliminarDocumentoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({
    documentId: formData.get("documentId"),
    caseId: formData.get("caseId"),
  });
  await softDeleteDocument(user.firmId, user.userId, parsed.documentId);
  revalidatePath(`/casos/${parsed.caseId}`);
}
