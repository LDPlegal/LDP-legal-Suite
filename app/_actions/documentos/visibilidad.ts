"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setDocumentVisibility } from "@/lib/db/queries/documents";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({
  documentId: z.string().uuid(),
  visibility: z.enum(["case", "private"]),
});

// Mueve un documento entre "Documentos del caso" (equipo) y "Mi carpeta"
// (privado). Solo el dueño puede hacerlo (validado en la query).
export async function cambiarVisibilidadDocumentoAction(input: {
  documentId: string;
  visibility: "case" | "private";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const res = await setDocumentVisibility(
    user.firmId,
    user.userId,
    parsed.data.documentId,
    parsed.data.visibility,
  );
  if (!res.ok) {
    return {
      ok: false,
      error: "No se pudo mover, solo podés mover documentos que vos subiste.",
    };
  }

  try {
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "document",
      entityId: parsed.data.documentId,
      caseId: res.caseId ?? undefined,
      action: "updated",
      summary:
        parsed.data.visibility === "private"
          ? "Movió documento a su carpeta privada"
          : "Movió documento a documentos del caso (equipo)",
      diff: { visibility: parsed.data.visibility },
    });
  } catch {
    // best-effort
  }

  if (res.caseId) revalidatePath(`/casos/${res.caseId}`);
  revalidatePath("/documentos");
  return { ok: true };
}
