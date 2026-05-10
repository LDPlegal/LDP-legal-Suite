// CRUD + apply-to-case for matter templates (Fase 6).

import { and, asc, eq, isNull } from "drizzle-orm";
import { withFirm } from "../with-firm";
import {
  events as eventsTable,
  matterTemplates,
  tasks,
  type MatterTemplate,
} from "../schema";
import { randomUUID } from "node:crypto";

export type TemplateTask = {
  title: string;
  description?: string;
  priority?: "low" | "med" | "high" | "urgent";
  offsetDays?: number;
};

export type TemplateEvent = {
  title: string;
  description?: string;
  location?: string;
  offsetDays: number;
  durationMinutes?: number;
};

export async function listMatterTemplates(
  firmId: string,
  userId: string,
): Promise<MatterTemplate[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(matterTemplates)
      .where(isNull(matterTemplates.deletedAt))
      .orderBy(asc(matterTemplates.name));
  });
}

export async function getMatterTemplate(
  firmId: string,
  userId: string,
  templateId: string,
): Promise<MatterTemplate | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(matterTemplates)
      .where(
        and(
          eq(matterTemplates.id, templateId),
          isNull(matterTemplates.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

export async function createMatterTemplate(
  firmId: string,
  userId: string,
  data: {
    name: string;
    matterType: MatterTemplate["matterType"];
    description: string | null;
    defaultTasks: TemplateTask[];
    defaultEvents: TemplateEvent[];
  },
): Promise<MatterTemplate> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(matterTemplates)
      .values({
        firmId,
        name: data.name,
        matterType: data.matterType,
        description: data.description,
        defaultTasks: data.defaultTasks,
        defaultEvents: data.defaultEvents,
      })
      .returning();
    if (!row) throw new Error("createMatterTemplate: insert returned no row");
    return row;
  });
}

export async function updateMatterTemplate(
  firmId: string,
  userId: string,
  templateId: string,
  patch: {
    name?: string;
    matterType?: MatterTemplate["matterType"];
    description?: string | null;
    defaultTasks?: TemplateTask[];
    defaultEvents?: TemplateEvent[];
  },
): Promise<MatterTemplate | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(matterTemplates)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(matterTemplates.id, templateId),
          isNull(matterTemplates.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  });
}

export async function softDeleteMatterTemplate(
  firmId: string,
  userId: string,
  templateId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(matterTemplates)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(matterTemplates.id, templateId),
          isNull(matterTemplates.deletedAt),
        ),
      )
      .returning({ id: matterTemplates.id });
    return !!row;
  });
}

// Apply a template's tasks and events to a freshly-created case. Returns
// counts so the UI can confirm "creó 4 tareas y 2 eventos".
export async function applyTemplateToCase(
  firmId: string,
  userId: string,
  templateId: string,
  caseId: string,
): Promise<{ taskCount: number; eventCount: number }> {
  const template = await getMatterTemplate(firmId, userId, templateId);
  if (!template) return { taskCount: 0, eventCount: 0 };

  const now = new Date();
  return withFirm(firmId, userId, async (tx) => {
    let taskCount = 0;
    let eventCount = 0;

    for (const t of template.defaultTasks) {
      const dueAt = t.offsetDays != null ? addDays(now, t.offsetDays) : null;
      await tx.insert(tasks).values({
        firmId,
        caseId,
        title: t.title,
        description: t.description ?? null,
        priority: t.priority ?? "med",
        status: "todo",
        dueAt,
        createdBy: userId,
      });
      taskCount += 1;
    }

    for (const e of template.defaultEvents) {
      const startAt = addDays(now, e.offsetDays);
      const endAt = new Date(
        startAt.getTime() + (e.durationMinutes ?? 60) * 60_000,
      );
      await tx.insert(eventsTable).values({
        firmId,
        caseId,
        title: e.title,
        description: e.description ?? null,
        location: e.location ?? null,
        startAt,
        endAt,
        allDay: false,
        // Required by the schema; stays unique per event row.
        icalUid: `${randomUUID()}@ldp-legal-suite`,
        createdBy: userId,
      });
      eventCount += 1;
    }

    return { taskCount, eventCount };
  });
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}
