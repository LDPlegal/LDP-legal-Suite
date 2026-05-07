"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { approveTimeEntry } from "@/lib/db/queries/time-entries";

const Schema = z.object({
  entryId: z.string().uuid(),
  caseId: z.string().uuid(),
});

export async function aprobarTiempoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    throw new Error("Solo admins y socios pueden aprobar tiempos.");
  }
  const parsed = Schema.parse({
    entryId: formData.get("entryId"),
    caseId: formData.get("caseId"),
  });
  await approveTimeEntry(user.firmId, user.userId, parsed.entryId);
  revalidatePath("/tiempos");
  revalidatePath(`/casos/${parsed.caseId}`);
}
