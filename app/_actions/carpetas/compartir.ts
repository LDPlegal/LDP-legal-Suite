"use server";

// Cascada: comparte/desactiva el shared_with_client de TODOS los docs en
// una carpeta y sus subcarpetas. Solo aplica a docs con case_id (porque
// el portal cliente filtra por caso).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setFolderSharedWithClient } from "@/lib/db/queries/folders";

const Schema = z.object({
  folderId: z.string().uuid(),
  shared: z.boolean(),
});

export type CompartirCarpetaState =
  | { ok: true; updated: number }
  | { ok: false; error: string };

export async function compartirCarpetaAction(input: {
  folderId: string;
  shared: boolean;
}): Promise<CompartirCarpetaState> {
  try {
    const user = await requireUser();
    const parsed = Schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Datos inválidos." };

    const { updated } = await setFolderSharedWithClient(
      user.firmId,
      user.userId,
      parsed.data.folderId,
      parsed.data.shared,
    );

    revalidatePath("/documentos");
    revalidatePath("/casos", "layout");
    return { ok: true, updated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[compartirCarpetaAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}
