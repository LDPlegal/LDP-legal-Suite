"use server";

// Mover carpeta a otro padre dentro del mismo scope (firm/case/client).
// Recalcula path materializado de todo el subárbol y valida no-cycle.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { moveFolder } from "@/lib/db/queries/folders";

const Schema = z.object({
  folderId: z.string().uuid(),
  newParentFolderId: z.string().uuid().nullable(),
});

export type MoverCarpetaState =
  | { ok: true }
  | { ok: false; error: string };

export async function moverCarpetaAction(input: {
  folderId: string;
  newParentFolderId: string | null;
}): Promise<MoverCarpetaState> {
  try {
    const user = await requireUser();
    const parsed = Schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Datos inválidos." };

    const result = await moveFolder(
      user.firmId,
      user.userId,
      parsed.data.folderId,
      parsed.data.newParentFolderId,
    );
    if (!result.ok) return { ok: false, error: result.error ?? "No se pudo mover." };

    revalidatePath("/documentos");
    // Para case/client lo revalidamos también, fuel for the SSR cache.
    revalidatePath("/casos", "layout");
    revalidatePath("/clientes", "layout");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[moverCarpetaAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}
