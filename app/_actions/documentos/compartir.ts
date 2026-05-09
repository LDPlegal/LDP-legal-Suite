"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setDocumentSharedWithClient } from "@/lib/db/queries/documents";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({
  documentId: z.string().uuid(),
  caseId: z.string().uuid(),
  shared: z.union([z.literal("true"), z.literal("false")]),
});

// Toggle a document's visibility in the Portal Cliente. Any non-client role
// can flip this; the audit log records the change so the client never sees
// "what was that doc that briefly appeared?" without explanation.
export async function compartirDocumentoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({
    documentId: formData.get("documentId"),
    caseId: formData.get("caseId"),
    shared: formData.get("shared"),
  });
  const next = parsed.shared === "true";
  const ok = await setDocumentSharedWithClient(
    user.firmId,
    user.userId,
    parsed.documentId,
    next,
  );
  if (ok) {
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "document",
      entityId: parsed.documentId,
      caseId: parsed.caseId,
      action: "updated",
      summary: next
        ? "Compartió documento con el cliente"
        : "Dejó de compartir documento con el cliente",
      diff: { sharedWithClient: next },
    });
  }
  revalidatePath(`/casos/${parsed.caseId}`);
}
