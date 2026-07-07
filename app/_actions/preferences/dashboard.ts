"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { saveDashboardWidgets } from "@/lib/db/queries/preferences";
import { normalizeDashboardLayout } from "@/lib/dashboard/widgets";

export type GuardarDashboardState = { ok: boolean; error?: string };

/**
 * Guarda el layout del dashboard del usuario (orden + visibilidad de widgets).
 * Recibe el arreglo crudo del cliente y lo normaliza contra el registry
 * (descarta ids desconocidos, dedup, castea visible a boolean).
 */
export async function guardarDashboardAction(
  layout: Array<{ id: string; visible: boolean }>,
): Promise<GuardarDashboardState> {
  const user = await requireUser();
  const normalized = normalizeDashboardLayout(layout);
  if (normalized.length === 0) {
    return { ok: false, error: "Layout vacío o inválido." };
  }
  try {
    await saveDashboardWidgets(user.firmId, user.userId, normalized);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo guardar.",
    };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
