"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteFolder } from "@/lib/db/queries/folders";

const Schema = z.object({ folderId: z.string().uuid() });

// Firma compatible con `ConfirmButton` (form action fire-and-forget).
export async function eliminarCarpetaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({ folderId: formData.get("folderId") });

  await softDeleteFolder(user.firmId, user.userId, parsed.folderId);

  // No sabemos el scope acá — revalidamos los paths globales.
  revalidatePath("/documentos");
}
