"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteFolder } from "@/lib/db/queries/folders";

const Schema = z.object({ folderId: z.string().uuid() });

// Firma compatible con `ConfirmButton` (form action fire-and-forget).
// Wrappeada con try/catch: en Next.js si una form action tira, fires el
// error boundary del root → user ve "Application error" sin contexto.
// Logueando + revalidando igual mantenemos el estado consistente.
export async function eliminarCarpetaAction(formData: FormData): Promise<void> {
  try {
    const user = await requireUser();
    const parsed = Schema.safeParse({ folderId: formData.get("folderId") });
    if (!parsed.success) {
      console.error("[eliminarCarpetaAction] folderId inválido:", parsed.error.message);
      return;
    }

    const ok = await softDeleteFolder(user.firmId, user.userId, parsed.data.folderId);
    if (!ok) {
      console.error("[eliminarCarpetaAction] softDeleteFolder devolvió false");
    }

    // Revalidamos los paths donde la carpeta podría haber estado visible.
    revalidatePath("/documentos");
    // No sabemos a qué caso/cliente pertenecía sin otra query, pero el
    // listado global se refresca.
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[eliminarCarpetaAction] uncaught:", msg);
    // Volvemos sin tirar — la form action devuelve void OK aunque haya
    // habido error. El user verá la carpeta seguir ahí, no un crash de
    // toda la página.
    revalidatePath("/documentos");
  }
}
