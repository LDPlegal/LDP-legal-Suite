"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateFirm } from "@/lib/db/queries/firms";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({
  name: z.string().trim().min(1).max(160),
  rnc: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  address: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  timezone: z.string().trim().min(1).max(80),
  defaultCurrency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/u, "ISO 4217 (3 letras mayúsculas)"),
});

export type FirmFormState =
  | { ok: true }
  | { ok: false; error: string };

export async function actualizarFirmAction(
  _prev: FirmFormState | undefined,
  formData: FormData,
): Promise<FirmFormState> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    return { ok: false, error: "Solo admin y socios pueden editar el firm." };
  }

  const parsed = Schema.safeParse({
    name: formData.get("name"),
    rnc: formData.get("rnc"),
    address: formData.get("address"),
    timezone: formData.get("timezone"),
    defaultCurrency: (formData.get("defaultCurrency") ?? "").toString().toUpperCase(),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  const updated = await updateFirm(user.firmId, user.userId, {
    name: parsed.data.name,
    rnc: parsed.data.rnc ?? null,
    address: parsed.data.address ?? null,
    timezone: parsed.data.timezone,
    defaultCurrency: parsed.data.defaultCurrency,
  });
  if (!updated) return { ok: false, error: "No se pudo actualizar el firm." };

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: user.firmId,
    action: "updated",
    summary: `Actualizó datos del firm`,
    diff: {
      name: parsed.data.name,
      rnc: parsed.data.rnc ?? null,
      timezone: parsed.data.timezone,
      defaultCurrency: parsed.data.defaultCurrency,
    },
  });

  revalidatePath("/configuracion");
  return { ok: true };
}
