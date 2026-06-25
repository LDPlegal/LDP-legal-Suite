"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateExpense } from "@/lib/db/queries/expenses";
import { GastoSchema } from "@/lib/schemas/fase1";

export type EditarGastoState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const IdSchema = z.string().uuid();

export async function editarGastoAction(
  expenseId: string,
  _prev: EditarGastoState | undefined,
  formData: FormData,
): Promise<EditarGastoState> {
  const user = await requireUser();
  const idCheck = IdSchema.safeParse(expenseId);
  if (!idCheck.success) return { ok: false, error: "ID de gasto inválido." };

  const parsed = GastoSchema.safeParse({
    caseId: formData.get("caseId"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "DOP",
    incurredOn: formData.get("incurredOn"),
    billable: formData.get("billable") === "on" || formData.get("billable") === "true",
    receiptUrl: formData.get("receiptUrl"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisá los datos del gasto.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  const updated = await updateExpense(user.firmId, user.userId, idCheck.data, {
    caseId: data.caseId,
    description: data.description,
    amount: data.amount,
    currency: data.currency,
    incurredOn: new Date(data.incurredOn),
    billable: data.billable,
    receiptUrl: data.receiptUrl ?? null,
  });
  if (!updated) {
    return {
      ok: false,
      error: "No se pudo actualizar (puede que ya esté facturado o haya sido eliminado).",
    };
  }
  revalidatePath(`/casos/${data.caseId}`);
  return { ok: true };
}
