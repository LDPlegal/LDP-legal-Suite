"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteTimeEntry } from "@/lib/db/queries/time-entries";

const Schema = z.object({
  entryId: z.string().uuid(),
  caseId: z.string().uuid(),
});

export async function eliminarTiempoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({
    entryId: formData.get("entryId"),
    caseId: formData.get("caseId"),
  });
  await softDeleteTimeEntry(user.firmId, user.userId, parsed.entryId);
  revalidatePath("/tiempos");
  revalidatePath(`/casos/${parsed.caseId}`);
}
