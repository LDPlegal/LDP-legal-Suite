"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteExpense } from "@/lib/db/queries/expenses";

const Schema = z.object({
  expenseId: z.string().uuid(),
  caseId: z.string().uuid(),
});

export async function eliminarGastoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({
    expenseId: formData.get("expenseId"),
    caseId: formData.get("caseId"),
  });
  await softDeleteExpense(user.firmId, user.userId, parsed.expenseId);
  revalidatePath(`/casos/${parsed.caseId}`);
}
