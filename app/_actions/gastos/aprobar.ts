"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { approveExpense } from "@/lib/db/queries/expenses";

const Schema = z.object({
  expenseId: z.string().uuid(),
  caseId: z.string().uuid(),
});

export async function aprobarGastoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    throw new Error("Solo admins y socios pueden aprobar gastos.");
  }
  const parsed = Schema.parse({
    expenseId: formData.get("expenseId"),
    caseId: formData.get("caseId"),
  });
  await approveExpense(user.firmId, user.userId, parsed.expenseId);
  revalidatePath(`/casos/${parsed.caseId}`);
}
