"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { setEmailPref } from "@/lib/db/queries/email-prefs";
import { isEmailableKind } from "@/lib/notifications/catalog";

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
