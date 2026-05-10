"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { MatterTypeEnum } from "@/lib/schemas/caso";
import { createRate, softDeleteRate } from "@/lib/db/queries/rates";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({
  userId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  matterType: MatterTypeEnum.optional().or(z.literal("").transform(() => undefined)),
  clientId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  hourlyRate: z.string().regex(/^\d+(\.\d{1,2})?$/u, "Monto inválido"),
  currency: z.string().regex(/^[A-Z]{3}$/u).default("DOP"),
  notes: z.string().trim().max(300).optional().or(z.literal("").transform(() => undefined)),
  validFrom: z.string().min(1),
  validTo: z.string().optional().or(z.literal("").transform(() => undefined)),
});

export type GuardarRateState =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function guardarRateAction(
  _prev: GuardarRateState | undefined,
  formData: FormData,
): Promise<GuardarRateState> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    return { ok: false, error: "Solo admin y socios pueden manejar tarifas." };
  }
  const parsed = Schema.safeParse({
    userId: formData.get("userId") || undefined,
    matterType: formData.get("matterType") || undefined,
    clientId: formData.get("clientId") || undefined,
    hourlyRate: formData.get("hourlyRate"),
    currency: (formData.get("currency") ?? "DOP").toString().toUpperCase(),
    notes: formData.get("notes"),
    validFrom: formData.get("validFrom"),
    validTo: formData.get("validTo"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  const row = await createRate(user.firmId, user.userId, {
    userId: parsed.data.userId ?? null,
    matterType: parsed.data.matterType ?? null,
    clientId: parsed.data.clientId ?? null,
    hourlyRate: parsed.data.hourlyRate,
    currency: parsed.data.currency,
    notes: parsed.data.notes ?? null,
    validFrom: new Date(parsed.data.validFrom),
    validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
  });
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: row.id,
    action: "created",
    summary: `Creó tarifa ${parsed.data.currency} ${parsed.data.hourlyRate}/hora`,
  });
  revalidatePath("/configuracion");
  return { ok: true, id: row.id };
}

export async function eliminarRateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    throw new Error("Solo admin y socios pueden eliminar tarifas.");
  }
  const id = z.string().uuid().parse(formData.get("rateId"));
  await softDeleteRate(user.firmId, user.userId, id);
  revalidatePath("/configuracion");
}
