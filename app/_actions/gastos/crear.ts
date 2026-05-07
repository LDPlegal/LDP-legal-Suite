"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createExpense } from "@/lib/db/queries/expenses";
import { GastoSchema } from "@/lib/schemas/fase1";

export type GastoFormState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function crearGastoAction(
  _prev: GastoFormState | undefined,
  formData: FormData,
): Promise<GastoFormState> {
  const user = await requireUser();
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
      error: "Revisa los datos del gasto.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  await createExpense(user.firmId, user.userId, {
    caseId: data.caseId,
    description: data.description,
    amount: data.amount,
    currency: data.currency,
    incurredOn: new Date(data.incurredOn),
    billable: data.billable,
    receiptUrl: data.receiptUrl ?? null,
  });
  revalidatePath(`/casos/${data.caseId}`);
  return { ok: true };
}
