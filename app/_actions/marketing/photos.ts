"use server";

// CRUD de fotos custom del firm para el editor de publicaciones.
//
//   uploadMarketingPhotoAction: recibe FormData con un File y un label,
//     valida (mime/size), guarda en storage, inserta fila.
//   deleteMarketingPhotoAction: soft-delete + remueve del storage.
//   listMarketingPhotosAction: lista activas del firm (server-only helper).
//
// Las fotos se sirven via /api/marketing/photos/[id]/file (route nueva).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { marketingPhotos, type MarketingPhoto } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";
import { logAuditStandalone } from "@/lib/audit/log";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB es ample para fotos de IG (1080×1350 jpg = ~300-700 KB)

export type UploadPhotoState =
  | { ok: true; photo: { id: string; url: string; label: string } }
  | { ok: false; error: string };

export async function uploadMarketingPhotoAction(
  formData: FormData,
): Promise<UploadPhotoState> {
  const user = await requireUser();
  const file = formData.get("file");
  const labelRaw = formData.get("label");

  if (!(file instanceof File)) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      error: "Formato no permitido. Usá JPG, PNG, WebP o GIF.",
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `Archivo muy grande (máx. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`,
    };
  }
  const label = typeof labelRaw === "string" && labelRaw.trim()
    ? labelRaw.trim().slice(0, 120)
    : file.name.replace(/\.[^.]+$/, "").slice(0, 120);

  // Pre-asignamos un id para usarlo como entityId del storage key (así
  // borrar la fila → borrar el objeto del storage es trivial).
  const id = crypto.randomUUID();

  const storage = getStorage();
  const storageKey = storage.buildKey({
    firmId: user.firmId,
    scope: "marketing",
    entityId: id,
    filename: file.name,
  });

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await storage.put(storageKey, buf, file.type);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al guardar el archivo.",
    };
  }

  const url = `/api/marketing/photos/${id}/file`;

  await adminDb.insert(marketingPhotos).values({
    id,
    firmId: user.firmId,
    label,
    url,
    storageKey,
    mimeType: file.type,
    sizeBytes: file.size,
    uploadedBy: user.userId,
  });

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: id,
    action: "uploaded",
    summary: `Subió foto de marketing: ${label}`,
  });

  revalidatePath("/publicaciones");
  return { ok: true, photo: { id, url, label } };
}

const DeleteSchema = z.object({ id: z.string().uuid() });

export type DeletePhotoState = { ok: true } | { ok: false; error: string };

export async function deleteMarketingPhotoAction(
  formData: FormData,
): Promise<DeletePhotoState> {
  const user = await requireUser();
  const parsed = DeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "ID inválido." };

  const [row] = await adminDb
    .select()
    .from(marketingPhotos)
    .where(
      and(
        eq(marketingPhotos.id, parsed.data.id),
        eq(marketingPhotos.firmId, user.firmId),
        isNull(marketingPhotos.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "Foto no encontrada." };

  // Best-effort: borrar del storage. Si falla, igual marcamos soft-delete
  // el archivo huérfano no se sirve más porque la query lo filtra.
  try {
    const storage = getStorage();
    await storage.remove(row.storageKey);
  } catch {
    // ignore
  }

  await adminDb
    .update(marketingPhotos)
    .set({ deletedAt: new Date() })
    .where(eq(marketingPhotos.id, parsed.data.id));

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: parsed.data.id,
    action: "deleted",
    summary: `Borró foto de marketing: ${row.label}`,
  });

  revalidatePath("/publicaciones");
  return { ok: true };
}

/** Server-only, devuelve las fotos activas del firm actual. */
export async function listMarketingPhotosForFirm(
  firmId: string,
): Promise<MarketingPhoto[]> {
  return adminDb
    .select()
    .from(marketingPhotos)
    .where(
      and(
        eq(marketingPhotos.firmId, firmId),
        isNull(marketingPhotos.deletedAt),
      ),
    )
    .orderBy(desc(marketingPhotos.createdAt));
}
