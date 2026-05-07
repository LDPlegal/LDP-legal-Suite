"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createTimeEntry } from "@/lib/db/queries/time-entries";
import { ManualTimeEntrySchema } from "@/lib/schemas/fase1";

export type TiempoManualFormState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function crearTiempoManualAction(
  _prev: TiempoManualFormState | undefined,
  formData: FormData,
): Promise<TiempoManualFormState> {
  const user = await requireUser();
  const parsed = ManualTimeEntrySchema.safeParse({
    caseId: formData.get("caseId"),
    description: formData.get("description"),
    startedAt: formData.get("startedAt"),
    endedAt: formData.get("endedAt"),
    billable: formData.get("billable") === "on" || formData.get("billable") === "true",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los datos del tiempo manual.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  await createTimeEntry(user.firmId, user.userId, {
    caseId: data.caseId,
    userId: user.userId,
    description: data.description ?? null,
    startedAt: new Date(data.startedAt),
    endedAt: new Date(data.endedAt),
    billable: data.billable,
  });
  revalidatePath("/tiempos");
  revalidatePath(`/casos/${data.caseId}`);
  return { ok: true };
}
