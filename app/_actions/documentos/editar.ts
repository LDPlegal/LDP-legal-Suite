"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { renameDocument } from "@/lib/db/queries/documents";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({
  documentId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(240),
  tags: z.string().optional(),
});

export type EditarDocumentoState =
  | { ok: true }
  | { ok: false; error: string };

export async function editarDocumentoAction(
  _prev: EditarDocumentoState | undefined,
  formData: FormData,
): Promise<EditarDocumentoState> {
  const user = await requireUser();
  const rawCaseId = formData.get("caseId");
  const parsed = Schema.safeParse({
    documentId: formData.get("documentId"),
    caseId: typeof rawCaseId === "string" && rawCaseId.trim() ? rawCaseId.trim() : undefined,
    name: formData.get("name"),
    tags: formData.get("tags"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }
  const tags = (parsed.data.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 20);

  const ok = await renameDocument(user.firmId, user.userId, parsed.data.documentId, {
    name: parsed.data.name,
    tags,
  });
  if (!ok) return { ok: false, error: "Documento no encontrado." };

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "document",
    entityId: parsed.data.documentId,
    caseId: parsed.data.caseId ?? undefined,
    action: "updated",
    summary: `Renombró documento a "${parsed.data.name}"`,
  });

  if (parsed.data.caseId) {
    revalidatePath(`/casos/${parsed.data.caseId}`);
  }
  revalidatePath("/documentos");
  return { ok: true };
}

