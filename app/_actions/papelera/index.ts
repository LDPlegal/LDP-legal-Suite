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
  listDeletedFolders,
  restoreFolder,
} from "@/lib/db/queries/folders";
import {
  hardDeleteDocument,
  listDeletedDocuments,
  restoreDocument,
} from "@/lib/db/queries/documents";
import { getStorage } from "@/lib/storage";

const IdSchema = z.object({ id: z.string().uuid() });

// Carpetas

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

// Documentos

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

// Vaciar papelera (bulk)
// Elimina definitivamente TODOS los items soft-deleted del firm: primero
// los docs (borrando del storage), después las carpetas. Irreversible.
export async function vaciarPapeleraAction(): Promise<{
  ok: boolean;
  deletedDocs: number;
  deletedFolders: number;
}> {
  try {
    const user = await requireUser();

    const [docs, folders] = await Promise.all([
      listDeletedDocuments(user.firmId, user.userId),
      listDeletedFolders(user.firmId, user.userId),
    ]);

    let deletedDocs = 0;
    for (const d of docs) {
      const result = await hardDeleteDocument(user.firmId, user.userId, d.id);
      if (result.ok) {
        deletedDocs += 1;
        if (result.storageKey) {
          try {
            await getStorage().remove(result.storageKey);
          } catch {
            // best-effort
          }
        }
      }
    }

    let deletedFolders = 0;
    for (const f of folders) {
      const ok = await hardDeleteFolder(user.firmId, user.userId, f.id);
      if (ok) deletedFolders += 1;
    }

    revalidatePath("/documentos/papelera");
    revalidatePath("/documentos");
    return { ok: true, deletedDocs, deletedFolders };
  } catch (err) {
    console.error("[vaciarPapeleraAction] uncaught:", err);
    return { ok: false, deletedDocs: 0, deletedFolders: 0 };
  }
}
