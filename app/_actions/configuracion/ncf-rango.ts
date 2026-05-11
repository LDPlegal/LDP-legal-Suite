"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { upsertNcfRange, deleteNcfRange } from "@/lib/db/queries/ncf-ranges";

const Schema = z.object({
  ncfType: z.enum(["B01", "B02", "E31", "E32"]),
  rangeStart: z.coerce.number().int().min(1).max(99_999_999),
  rangeEnd: z.coerce.number().int().min(1).max(99_999_999),
  expiresOn: z.string().optional().or(z.literal("").transform(() => undefined)),
});

export type NcfRangoState =
  | { ok: true }
  | { ok: false; error: string };

export async function guardarNcfRangoAction(
  _prev: NcfRangoState | undefined,
  formData: FormData,
): Promise<NcfRangoState> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    return { ok: false, error: "Solo admins y socios pueden configurar rangos NCF." };
  }
  const parsed = Schema.safeParse({
    ncfType: formData.get("ncfType"),
    rangeStart: formData.get("rangeStart"),
    rangeEnd: formData.get("rangeEnd"),
    expiresOn: formData.get("expiresOn"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }
  if (parsed.data.rangeEnd < parsed.data.rangeStart) {
    return { ok: false, error: "El fin del rango debe ser >= al inicio." };
  }

  try {
    await upsertNcfRange(user.firmId, user.userId, {
      ncfType: parsed.data.ncfType,
      rangeStart: parsed.data.rangeStart,
      rangeEnd: parsed.data.rangeEnd,
      expiresOn: parsed.data.expiresOn ? new Date(parsed.data.expiresOn) : null,
    });
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar el rango.",
    };
  }
}

const DeleteSchema = z.object({
  ncfType: z.enum(["B01", "B02", "E31", "E32"]),
});

export async function eliminarNcfRangoAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    throw new Error("Solo admins y socios pueden eliminar rangos NCF.");
  }
  const parsed = DeleteSchema.parse({ ncfType: formData.get("ncfType") });
  await deleteNcfRange(user.firmId, user.userId, parsed.ncfType);
  revalidatePath("/configuracion");
}
