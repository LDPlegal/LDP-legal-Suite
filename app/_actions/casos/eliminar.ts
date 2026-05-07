"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteCase } from "@/lib/db/queries/cases";

const Schema = z.object({ caseId: z.string().uuid() });

export async function eliminarCasoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({ caseId: formData.get("caseId") });
  await softDeleteCase(user.firmId, user.userId, parsed.caseId);
  revalidatePath("/casos");
  redirect("/casos");
}
