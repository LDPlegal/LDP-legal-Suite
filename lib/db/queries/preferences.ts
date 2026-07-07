// Preferencias de UI por usuario (users.preferences jsonb).
// Hoy: config del dashboard personalizable.

import { and, eq, isNull, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { users } from "../schema";

export type DashboardWidgetPref = { id: string; visible: boolean };

/** Lee las preferencias del usuario actual (o {} si no hay fila). */
export async function getUserPreferences(
  firmId: string,
  userId: string,
): Promise<{ dashboardWidgets?: DashboardWidgetPref[] }> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select({ preferences: users.preferences })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    return row?.preferences ?? {};
  });
}

/**
 * Guarda el layout del dashboard, preservando el resto de las preferencias
 * (merge jsonb con `||`). El layout ya viene normalizado por
 * normalizeDashboardLayout en la server action.
 */
export async function saveDashboardWidgets(
  firmId: string,
  userId: string,
  layout: DashboardWidgetPref[],
): Promise<void> {
  // El valor va como parámetro bindeado (seguro) y se castea a jsonb; el `||`
  // hace merge preservando otras claves de preferences.
  const patch = JSON.stringify({ dashboardWidgets: layout });
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(users)
      .set({
        preferences: sql`COALESCE(${users.preferences}, '{}'::jsonb) || ${patch}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  });
}
