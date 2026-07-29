"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { setCaseConfidentialTier } from "@/lib/db/queries/cases";
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

  const result = await setCaseConfidentialTier(user.firmId, user.userId, caseId, tier);
  if (!result) return { ok: false, error: "Caso no encontrado." };
  if (result.previousTier === tier) return { ok: true };

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "case",
    entityId: caseId,
    caseId,
    action: "updated",
    summary: `Tier de confidencialidad cambiado: ${result.previousTier} → ${tier}`,
    diff: { from: result.previousTier, to: tier, caseCode: result.code, caseTitle: result.title },
  });

  revalidatePath(`/casos/${caseId}`);
  revalidatePath("/casos");
  return { ok: true };
}
