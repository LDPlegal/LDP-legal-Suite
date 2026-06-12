"use server";

// Actions de la papelera: restaurar y eliminar definitivamente carpetas
// y documentos soft-deleted.
//
// Diseño:
//   - Restaurar = pone deleted_at = NULL (reversible 100%).
//   - Eliminar definitivamente = DELETE de la fila + (para docs) remove
//     del storage. Irreversible. Requiere confirmación.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  hardDeleteFolder,
  restoreFolder,
} from "@/lib/db/queries/folders";
import {
  hardDeleteDocument,
  restoreDocument,
} from "@/lib/db/queries/documents";
import { getStorage } from "@/lib/storage";

const IdSchema = z.object({ id: z.string().uuid() });

// — Carpetas —

export async function restaurarCarpetaAction(formData: FormData): Promise<void> {
  try {
    const user = await requireUser();
    const parsed = IdSchema.safeParse({ id: formData.get("id") });
    if (!parsed.success) return;
    await restoreFolder(user.firmId, user.userId, parsed.data.id);
    revalidatePath("/documentos/papelera");
    revalidatePath("/documentos");
  } catch (err) {
    console.error("[restaurarCarpetaAction] uncaught:", err);
  }
}

export async function eliminarDefinitivoCarpetaAction(formData: FormData): Promise<void> {
  try {
    const user = await requireUser();
    const parsed = IdSchema.safeParse({ id: formData.get("id") });
    if (!parsed.success) return;
    await hardDeleteFolder(user.firmId, user.userId, parsed.data.id);
    revalidatePath("/documentos/papelera");
  } catch (err) {
    console.error("[eliminarDefinitivoCarpetaAction] uncaught:", err);
  }
}

// — Documentos —

export async function restaurarDocumentoAction(formData: FormData): Promise<void> {
  try {
    const user = await requireUser();
    const parsed = IdSchema.safeParse({ id: formData.get("id") });
    if (!parsed.success) return;
    await restoreDocument(user.firmId, user.userId, parsed.data.id);
    revalidatePath("/documentos/papelera");
    revalidatePath("/documentos");
  } catch (err) {
    console.error("[restaurarDocumentoAction] uncaught:", err);
  }
}

export async function eliminarDefinitivoDocumentoAction(formData: FormData): Promise<void> {
  try {
    const user = await requireUser();
    const parsed = IdSchema.safeParse({ id: formData.get("id") });
    if (!parsed.success) return;
    const result = await hardDeleteDocument(user.firmId, user.userId, parsed.data.id);
    if (result.ok && result.storageKey) {
      // Best-effort cleanup del storage. Si falla, el record ya está borrado;
      // el archivo queda huérfano pero no pasa nada crítico.
      try {
        await getStorage().remove(result.storageKey);
      } catch (e) {
        console.error("[eliminarDefinitivoDocumentoAction] storage.remove falló:", e);
      }
    }
    revalidatePath("/documentos/papelera");
  } catch (err) {
    console.error("[eliminarDefinitivoDocumentoAction] uncaught:", err);
  }
}
