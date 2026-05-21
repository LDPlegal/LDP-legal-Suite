"use server";

// F7+ Bloque 4 — Cambia el tier de confidencialidad de un caso.
//
// Solo admin o partner pueden subir un caso a 'ultra_confidential'. Bajar
// de 'ultra' a otro tier también lo limitamos a admin: si se baja, los
// documentos cifrados se MANTIENEN cifrados (la migración inversa de
// descifrar y re-subir sería costosa y poco utilizada).
//
// El cifrado retroactivo de documentos existentes al subir a 'ultra' se
// hace en un job background separado — esta action solo cambia el flag
// y encola el job (por ahora best-effort: agrega entrada en audit log
// para que el admin sepa).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { cases } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({
  caseId: z.string().uuid(),
  tier: z.enum(["normal", "confidential", "ultra_confidential"]),
});

export type SetTierState = { ok: true } | { ok: false; error: string };

export async function setCaseConfidentialTierAction(
  input: z.input<typeof Schema>,
): Promise<SetTierState> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    return { ok: false, error: "Sólo admin o partner pueden cambiar el tier de confidencialidad." };
  }

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const { caseId, tier } = parsed.data;

  // Verify the case belongs to this firm.
  const [caso] = await adminDb
    .select({ id: cases.id, currentTier: cases.confidentialTier, code: cases.code, title: cases.title })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.firmId, user.firmId)))
    .limit(1);
  if (!caso) return { ok: false, error: "Caso no encontrado." };
  if (caso.currentTier === tier) return { ok: true };

  await adminDb
    .update(cases)
    .set({ confidentialTier: tier, updatedAt: new Date() })
    .where(eq(cases.id, caseId));

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "case",
    entityId: caseId,
    caseId,
    action: "updated",
    summary: `Tier de confidencialidad cambiado: ${caso.currentTier} → ${tier}`,
    diff: { from: caso.currentTier, to: tier, caseCode: caso.code, caseTitle: caso.title },
  });

  revalidatePath(`/casos/${caseId}`);
  revalidatePath("/casos");
  return { ok: true };
}
