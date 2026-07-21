"use server";

// Acciones bulk para selección múltiple en el browser de documentos.
//
// Cada action recibe arrays de IDs (docs y/o carpetas) y aplica la
// operación una por una, acumulando resultados. No usamos una sola query
// gigante porque:
//   - moveFolder valida no-cycle por carpeta (necesita lógica per-item).
//   - softDeleteFolder cascada subárbol (per-item).
//   - Los errores parciales no deben abortar el resto.
//
// Devolvemos { ok, moved/deleted/shared, failed } para que la UI muestre
// un resumen ("12 movidos, 1 falló").

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  moveDocumentToFolder,
  moveFolder,
  softDeleteFolder,
} from "@/lib/db/queries/folders";
import {
  setDocumentSharedWithClient,
  softDeleteDocument,
} from "@/lib/db/queries/documents";

const IdArray = z.array(z.string().uuid()).max(500);

// — Mover bulk —
const MoverSchema = z.object({
  documentIds: IdArray,
  folderIds: IdArray,
  targetFolderId: z.string().uuid().nullable(),
});

export type BulkMoverState =
  | { ok: true; moved: number; failed: number; errors: string[] }
  | { ok: false; error: string };

export async function moverItemsBulkAction(input: {
  documentIds: string[];
  folderIds: string[];
  targetFolderId: string | null;
}): Promise<BulkMoverState> {
  try {
    const user = await requireUser();
    const parsed = MoverSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Datos inválidos." };

    const { documentIds, folderIds, targetFolderId } = parsed.data;
    let moved = 0;
    let failed = 0;
    const errors: string[] = [];

    // Carpetas primero (la validación no-cycle puede rechazar algunas).
    for (const fid of folderIds) {
      const r = await moveFolder(user.firmId, user.userId, fid, targetFolderId);
      if (r.ok) moved += 1;
      else {
        failed += 1;
        if (r.error && !errors.includes(r.error)) errors.push(r.error);
      }
    }
    for (const did of documentIds) {
      const r = await moveDocumentToFolder(
        user.firmId,
        user.userId,
        did,
        targetFolderId,
      );
      if (r.ok) moved += 1;
      else {
        failed += 1;
        if (r.error && !errors.includes(r.error)) errors.push(r.error);
      }
    }

    revalidatePath("/documentos");
    revalidatePath("/casos", "layout");
    revalidatePath("/clientes", "layout");
    return { ok: true, moved, failed, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[moverItemsBulkAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}

// — Eliminar bulk —
const EliminarSchema = z.object({
  documentIds: IdArray,
  folderIds: IdArray,
  // Para las carpetas: si true, también soft-delete sus docs internos.
  deleteDocsInFolders: z.boolean().default(false),
});

export type BulkEliminarState =
  | { ok: true; deleted: number; failed: number }
  | { ok: false; error: string };

export async function eliminarItemsBulkAction(input: {
  documentIds: string[];
  folderIds: string[];
  deleteDocsInFolders: boolean;
}): Promise<BulkEliminarState> {
  try {
    const user = await requireUser();
    const parsed = EliminarSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Datos inválidos." };

    const { documentIds, folderIds, deleteDocsInFolders } = parsed.data;
    let deleted = 0;
    let failed = 0;

    for (const did of documentIds) {
      const ok = await softDeleteDocument(user.firmId, user.userId, did);
      if (ok) deleted += 1;
      else failed += 1;
    }
    for (const fid of folderIds) {
      const ok = await softDeleteFolder(user.firmId, user.userId, fid, {
        deleteDocuments: deleteDocsInFolders,
      });
      if (ok) deleted += 1;
      else failed += 1;
    }

    revalidatePath("/documentos");
    revalidatePath("/casos", "layout");
    revalidatePath("/clientes", "layout");
    return { ok: true, deleted, failed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[eliminarItemsBulkAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}

// — Compartir bulk (solo docs; las carpetas tienen su propia cascada) —
const CompartirSchema = z.object({
  documentIds: IdArray,
  shared: z.boolean(),
});

export type BulkCompartirState =
  | { ok: true; updated: number; skipped: number }
  | { ok: false; error: string };

export async function compartirDocsBulkAction(input: {
  documentIds: string[];
  shared: boolean;
}): Promise<BulkCompartirState> {
  try {
    const user = await requireUser();
    const parsed = CompartirSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Datos inválidos." };

    let updated = 0;
    let skipped = 0;
    for (const did of parsed.data.documentIds) {
      // setDocumentSharedWithClient devuelve false si el doc no existe o no
      // se pudo (ej. no tiene caso). Contamos como skipped.
      const ok = await setDocumentSharedWithClient(
        user.firmId,
        user.userId,
        did,
        parsed.data.shared,
      );
      if (ok) updated += 1;
      else skipped += 1;
    }

    revalidatePath("/documentos");
    revalidatePath("/casos", "layout");
    return { ok: true, updated, skipped };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[compartirDocsBulkAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}
