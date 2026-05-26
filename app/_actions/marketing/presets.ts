"use server";

// CRUD de presets de templates de publicaciones.
//
//   savePresetAction: crea un preset nuevo a partir de los values actuales.
//   updatePresetAction: sobrescribe un preset existente (nombre + values).
//   deletePresetAction: soft-delete.
//   listPresetsForTemplate: server-only helper.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { marketingPresets, type MarketingPreset } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { logAuditStandalone } from "@/lib/audit/log";

// `values` puede tener números o strings (size, color, copy, etc.).
const ValuesSchema = z.record(z.string(), z.union([z.string(), z.number()]));

const SaveSchema = z.object({
  templateId: z.string().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  values: ValuesSchema,
});

export type SavePresetState =
  | { ok: true; preset: { id: string; name: string } }
  | { ok: false; error: string };

export async function savePresetAction(input: {
  templateId: string;
  name: string;
  values: Record<string, string | number>;
}): Promise<SavePresetState> {
  const user = await requireUser();
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  const [row] = await adminDb
    .insert(marketingPresets)
    .values({
      firmId: user.firmId,
      templateId: parsed.data.templateId,
      name: parsed.data.name,
      values: parsed.data.values,
      createdBy: user.userId,
    })
    .returning({ id: marketingPresets.id, name: marketingPresets.name });
  if (!row) return { ok: false, error: "No se pudo guardar." };

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: row.id,
    action: "created",
    summary: `Guardó preset de publicación: ${row.name}`,
  });

  revalidatePath("/publicaciones");
  return { ok: true, preset: { id: row.id, name: row.name } };
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  values: ValuesSchema.optional(),
});

export type UpdatePresetState = { ok: true } | { ok: false; error: string };

export async function updatePresetAction(input: {
  id: string;
  name?: string;
  values?: Record<string, string | number>;
}): Promise<UpdatePresetState> {
  const user = await requireUser();
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const [existing] = await adminDb
    .select({ id: marketingPresets.id, name: marketingPresets.name })
    .from(marketingPresets)
    .where(
      and(
        eq(marketingPresets.id, parsed.data.id),
        eq(marketingPresets.firmId, user.firmId),
        isNull(marketingPresets.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false, error: "Preset no encontrado." };

  const patch: Partial<typeof marketingPresets.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.name) patch.name = parsed.data.name;
  if (parsed.data.values) patch.values = parsed.data.values;

  await adminDb
    .update(marketingPresets)
    .set(patch)
    .where(eq(marketingPresets.id, parsed.data.id));

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: parsed.data.id,
    action: "updated",
    summary: `Actualizó preset: ${parsed.data.name ?? existing.name}`,
  });

  revalidatePath("/publicaciones");
  return { ok: true };
}

const DeleteSchema = z.object({ id: z.string().uuid() });

export type DeletePresetState = { ok: true } | { ok: false; error: string };

export async function deletePresetAction(input: {
  id: string;
}): Promise<DeletePresetState> {
  const user = await requireUser();
  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ID inválido." };

  const [existing] = await adminDb
    .select({ name: marketingPresets.name })
    .from(marketingPresets)
    .where(
      and(
        eq(marketingPresets.id, parsed.data.id),
        eq(marketingPresets.firmId, user.firmId),
        isNull(marketingPresets.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false, error: "Preset no encontrado." };

  await adminDb
    .update(marketingPresets)
    .set({ deletedAt: new Date() })
    .where(eq(marketingPresets.id, parsed.data.id));

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: parsed.data.id,
    action: "deleted",
    summary: `Borró preset: ${existing.name}`,
  });

  revalidatePath("/publicaciones");
  return { ok: true };
}

/** Server-only — devuelve presets activos del firm. */
export async function listPresetsForFirm(
  firmId: string,
): Promise<MarketingPreset[]> {
  return adminDb
    .select()
    .from(marketingPresets)
    .where(
      and(
        eq(marketingPresets.firmId, firmId),
        isNull(marketingPresets.deletedAt),
      ),
    )
    .orderBy(desc(marketingPresets.updatedAt));
}
