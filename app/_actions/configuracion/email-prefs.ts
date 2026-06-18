"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { setEmailPref } from "@/lib/db/queries/email-prefs";
import { isEmailableKind } from "@/lib/notifications/catalog";
import { getCurrentFirm, updateFirm } from "@/lib/db/queries/firms";

const Schema = z.object({
  kind: z.string().min(1).max(60),
  enabled: z.boolean(),
});

export type ToggleEmailPrefState =
  | { ok: true; kind: string; enabled: boolean }
  | { ok: false; error: string };

export async function toggleEmailPrefAction(input: {
  kind: string;
  enabled: boolean;
}): Promise<ToggleEmailPrefState> {
  try {
    const user = await requireUser();
    const parsed = Schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Datos inválidos." };
    if (!isEmailableKind(parsed.data.kind)) {
      return { ok: false, error: "Tipo de notificación desconocido." };
    }
    await setEmailPref(
      user.firmId,
      user.userId,
      parsed.data.kind,
      parsed.data.enabled,
    );
    revalidatePath("/configuracion");
    return { ok: true, kind: parsed.data.kind, enabled: parsed.data.enabled };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[toggleEmailPrefAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}

// Fija la casilla emisora (Microsoft 365) de las notificaciones del firm.
// Admin/partner only. Guarda el userId en firm.settings.notificationSenderUserId.
// null = limpiar (vuelve a la resolución automática).
export type SetSenderState = { ok: true } | { ok: false; error: string };

export async function setNotificationSenderAction(input: {
  userId: string | null;
}): Promise<SetSenderState> {
  try {
    const user = await requireUser();
    if (!hasAdminPowers(user.role)) {
      return { ok: false, error: "Solo admins y socios pueden cambiar la casilla emisora." };
    }
    const parsed = z
      .object({ userId: z.string().uuid().nullable() })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: "Dato inválido." };

    const firm = await getCurrentFirm(user.firmId, user.userId);
    const settings = (firm?.settings ?? {}) as Record<string, unknown>;
    const next = { ...settings };
    if (parsed.data.userId) next.notificationSenderUserId = parsed.data.userId;
    else delete next.notificationSenderUserId;

    await updateFirm(user.firmId, user.userId, { settings: next });
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[setNotificationSenderAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}
