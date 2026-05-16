"use server";

// F7 bloque 4 — Server actions para configurar el presupuesto IA del firm.
//
// Solo admin/partner pueden cambiar el presupuesto. Cualquier usuario del
// firm puede leer el estado (porque la UI de chat muestra el % consumido
// como información de contexto).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getBudgetStatus, setFirmBudget } from "@/lib/ai/budget";
import { logAuditStandalone } from "@/lib/audit/log";

export async function getBudgetAction() {
  const user = await requireUser();
  return getBudgetStatus(user.firmId);
}

const Schema = z.object({
  monthlyUsd: z
    .number()
    .nonnegative()
    .max(100_000)
    .nullable()
    .or(z.literal("").transform(() => null)),
  hardCap: z.boolean().optional(),
});

export type SetBudgetState =
  | { ok: true }
  | { ok: false; error: string };

export async function setBudgetAction(input: {
  monthlyUsd: number | null;
  hardCap?: boolean;
}): Promise<SetBudgetState> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    return { ok: false, error: "Solo admin/partner pueden ajustar el presupuesto." };
  }
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Monto inválido." };
  }
  const next = await setFirmBudget(user.firmId, {
    monthlyUsd: parsed.data.monthlyUsd,
    hardCap: parsed.data.hardCap,
  });
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "firm",
    entityId: user.firmId,
    action: "updated",
    summary: `Ajustó presupuesto IA: ${next.monthlyUsd ? `US$${next.monthlyUsd.toFixed(2)}/mes` : "sin tope"}${next.hardCap ? " (hard cap activado)" : ""}`,
    diff: { aiBudget: next },
  });
  revalidatePath("/configuracion");
  return { ok: true };
}
