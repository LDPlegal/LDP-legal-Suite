"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setDocumentSharedWithClient } from "@/lib/db/queries/documents";
import { logAuditStandalone } from "@/lib/audit/log";
import { adminDb } from "@/lib/db/admin";
import { caseAssignments, documents } from "@/lib/db/schema";
import { notify } from "@/lib/db/queries/notifications";

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

    // Notificar al resto del equipo asignado al caso (no al que ejecuta la
    // acción). Compartir/ocultar un doc del cliente es un evento visible
    // hacia afuera, los demás abogados necesitan enterarse.
    try {
      const [docRow] = await adminDb
        .select({ name: documents.name })
        .from(documents)
        .where(eq(documents.id, parsed.documentId))
        .limit(1);
      const docName = docRow?.name ?? "documento";

      const teammates = await adminDb
        .select({ userId: caseAssignments.userId })
        .from(caseAssignments)
        .where(
          and(
            eq(caseAssignments.caseId, parsed.caseId),
            ne(caseAssignments.userId, user.userId),
          ),
        );

      await Promise.all(
        teammates.map((t) =>
          notify({
            firmId: user.firmId,
            userId: t.userId,
            type: next ? "document_shared_with_client" : "document_unshared_with_client",
            title: next
              ? `Documento ahora visible al cliente: ${docName}`
              : `Documento ocultado del cliente: ${docName}`,
            body: null,
            href: `/casos/${parsed.caseId}?tab=documentos`,
          }),
        ),
      );
    } catch {
      // best-effort
    }
  }
  revalidatePath(`/casos/${parsed.caseId}`);
}
