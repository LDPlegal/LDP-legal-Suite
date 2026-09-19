"use server";

// CRUD de honorarios del caso DESPUÉS de creado (antes solo se podían definir
// al crear el caso y quedaban congelados, Gabriel necesita editarlos).
// Solo admin/partner/tester (hasAdminPowers): los honorarios son facturación.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { addCaseFee, updateCaseFee, deleteCaseFee } from "@/lib/db/queries/cases";

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Monto inválido (ej: 1500 o 1500.50)")
  .optional()
  .or(z.literal("").transform(() => undefined));

const BaseSchema = z
  .object({
    caseId: z.string().uuid(),
    feeType: z.enum(["flat_fee", "retainer", "success_fee", "other"]),
    description: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    amountUsd: money,
    amountDop: money,
  })
  .refine((d) => d.amountUsd || d.amountDop, {
    message: "Ingresá al menos un monto (USD o DOP).",
    path: ["amountDop"],
  });

export type HonorarioState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function parseForm(formData: FormData) {
  return BaseSchema.safeParse({
    caseId: formData.get("caseId"),
    feeType: formData.get("feeType"),
    description: formData.get("description"),
    amountUsd: formData.get("amountUsd"),
    amountDop: formData.get("amountDop"),
  });
}

export async function agregarHonorarioAction(
  _prev: HonorarioState | undefined,
  formData: FormData,
): Promise<HonorarioState> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    return { ok: false, error: "Solo admins y socios pueden modificar honorarios." };
  }
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisá los datos del honorario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  const row = await addCaseFee(user.firmId, user.userId, d.caseId, {
    feeType: d.feeType,
    description: d.description ?? null,
    amountUsd: d.amountUsd ?? null,
    amountDop: d.amountDop ?? null,
  });
  if (!row) return { ok: false, error: "No se pudo agregar el honorario." };
  revalidatePath(`/casos/${d.caseId}`);
  return { ok: true };
}

export async function editarHonorarioAction(
  _prev: HonorarioState | undefined,
  formData: FormData,
): Promise<HonorarioState> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    return { ok: false, error: "Solo admins y socios pueden modificar honorarios." };
  }
  const feeId = z.string().uuid().safeParse(formData.get("feeId"));
  if (!feeId.success) return { ok: false, error: "Honorario no encontrado." };
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisá los datos del honorario.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  const row = await updateCaseFee(user.firmId, user.userId, feeId.data, {
    feeType: d.feeType,
    description: d.description ?? null,
    amountUsd: d.amountUsd ?? null,
    amountDop: d.amountDop ?? null,
  });
  if (!row) return { ok: false, error: "Honorario no encontrado." };
  revalidatePath(`/casos/${d.caseId}`);
  return { ok: true };
}

// ConfirmButton manda FormData directo (sin useActionState), firma simple.
export async function eliminarHonorarioAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) return;
  const feeId = z.string().uuid().safeParse(formData.get("feeId"));
  const caseId = z.string().uuid().safeParse(formData.get("caseId"));
  if (!feeId.success || !caseId.success) return;
  await deleteCaseFee(user.firmId, user.userId, feeId.data);
  revalidatePath(`/casos/${caseId.data}`);
}
