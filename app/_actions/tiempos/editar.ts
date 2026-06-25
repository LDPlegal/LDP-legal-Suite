"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateTimeEntry } from "@/lib/db/queries/time-entries";

export type EditarTiempoState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const Schema = z
  .object({
    entryId: z.string().uuid(),
    caseId: z.string().uuid(),
    description: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    billable: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (new Date(val.endedAt) <= new Date(val.startedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endedAt"],
        message: "La hora de fin debe ser posterior a la de inicio",
      });
    }
  });

export async function editarTiempoAction(
  _prev: EditarTiempoState | undefined,
  formData: FormData,
): Promise<EditarTiempoState> {
  const user = await requireUser();
  const parsed = Schema.safeParse({
    entryId: formData.get("entryId"),
    caseId: formData.get("caseId"),
    description: formData.get("description"),
    startedAt: formData.get("startedAt"),
    endedAt: formData.get("endedAt"),
    billable: formData.get("billable") === "on" || formData.get("billable") === "true",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisá los datos.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const updated = await updateTimeEntry(user.firmId, user.userId, data.entryId, {
    description: data.description ?? null,
    startedAt: new Date(data.startedAt),
    endedAt: new Date(data.endedAt),
    billable: data.billable,
  });
  if (!updated) {
    return {
      ok: false,
      error: "No se pudo actualizar (puede que ya esté facturado o haya sido eliminado).",
    };
  }
  revalidatePath("/tiempos");
  revalidatePath(`/casos/${data.caseId}`);
  return { ok: true };
}
