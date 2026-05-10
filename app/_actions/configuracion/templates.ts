"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { MatterTypeEnum } from "@/lib/schemas/caso";
import {
  createMatterTemplate,
  softDeleteMatterTemplate,
  updateMatterTemplate,
} from "@/lib/db/queries/matter-templates";
import { logAuditStandalone } from "@/lib/audit/log";

const TaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  priority: z.enum(["low", "med", "high", "urgent"]).optional(),
  offsetDays: z.coerce.number().int().min(-365).max(365).optional(),
});

const EventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  location: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  offsetDays: z.coerce.number().int().min(-365).max(365),
  durationMinutes: z.coerce.number().int().min(15).max(8 * 60).optional(),
});

const Schema = z.object({
  templateId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  matterType: MatterTypeEnum,
  description: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  defaultTasks: z.string(),
  defaultEvents: z.string(),
});

export type GuardarTemplateState =
  | { ok: true; id: string }
  | { ok: false; error: string };

function requireAdmin(role: string): role is "admin" | "partner" {
  return role === "admin" || role === "partner";
}

export async function guardarTemplateAction(
  _prev: GuardarTemplateState | undefined,
  formData: FormData,
): Promise<GuardarTemplateState> {
  const user = await requireUser();
  if (!requireAdmin(user.role)) {
    return { ok: false, error: "Solo admin y socios pueden editar plantillas." };
  }

  const parsed = Schema.safeParse({
    templateId: formData.get("templateId") || undefined,
    name: formData.get("name"),
    matterType: formData.get("matterType"),
    description: formData.get("description"),
    defaultTasks: formData.get("defaultTasks") ?? "[]",
    defaultEvents: formData.get("defaultEvents") ?? "[]",
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  let tasks: z.infer<typeof TaskSchema>[];
  let events: z.infer<typeof EventSchema>[];
  try {
    tasks = z.array(TaskSchema).parse(JSON.parse(parsed.data.defaultTasks));
    events = z.array(EventSchema).parse(JSON.parse(parsed.data.defaultEvents));
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Tareas/eventos inválidos: ${err.message}`
          : "Tareas/eventos inválidos.",
    };
  }

  if (parsed.data.templateId) {
    const updated = await updateMatterTemplate(
      user.firmId,
      user.userId,
      parsed.data.templateId,
      {
        name: parsed.data.name,
        matterType: parsed.data.matterType,
        description: parsed.data.description ?? null,
        defaultTasks: tasks,
        defaultEvents: events,
      },
    );
    if (!updated) return { ok: false, error: "Plantilla no encontrada." };
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "user",
      entityId: updated.id,
      action: "updated",
      summary: `Actualizó plantilla de matter: ${parsed.data.name}`,
    });
    revalidatePath("/configuracion");
    return { ok: true, id: updated.id };
  }

  const created = await createMatterTemplate(user.firmId, user.userId, {
    name: parsed.data.name,
    matterType: parsed.data.matterType,
    description: parsed.data.description ?? null,
    defaultTasks: tasks,
    defaultEvents: events,
  });
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: created.id,
    action: "created",
    summary: `Creó plantilla de matter: ${parsed.data.name}`,
  });
  revalidatePath("/configuracion");
  return { ok: true, id: created.id };
}

export async function eliminarTemplateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!requireAdmin(user.role)) {
    throw new Error("Solo admin y socios pueden eliminar plantillas.");
  }
  const id = z.string().uuid().parse(formData.get("templateId"));
  await softDeleteMatterTemplate(user.firmId, user.userId, id);
  revalidatePath("/configuracion");
}
