"use server";

// Renombra una carpeta. Recalcula el path materializado del subárbol.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { renameFolder } from "@/lib/db/queries/folders";

const Schema = z.object({
  folderId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(120, "Máximo 120 caracteres")
    .refine((s) => !/[\/\\:*?"<>|]/u.test(s), "Caracteres inválidos en el nombre"),
});

export type RenombrarCarpetaState =
  | { ok: true; name: string }
  | { ok: false; error: string };

export async function renombrarCarpetaAction(input: {
  folderId: string;
  name: string;
}): Promise<RenombrarCarpetaState> {
  try {
    const user = await requireUser();
    const parsed = Schema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Nombre inválido.",
      };
    }

    const result = await renameFolder(
      user.firmId,
      user.userId,
      parsed.data.folderId,
      parsed.data.name,
    );
    if (!result.ok) return { ok: false, error: result.error ?? "No se pudo renombrar." };

    revalidatePath("/documentos");
    revalidatePath("/casos", "layout");
    revalidatePath("/clientes", "layout");
    return { ok: true, name: parsed.data.name };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[renombrarCarpetaAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}
