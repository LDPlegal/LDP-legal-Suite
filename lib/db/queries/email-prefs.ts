// Queries para las preferencias de email por usuario (opt-in). Cada fila en
// user_email_prefs = ese usuario quiere recibir por correo ese `kind`.
// Pasa por withFirm: la RLS policy `user_email_prefs_self` ya restringe a
// las filas del propio user_id.

import { and, eq } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { userEmailPrefs } from "../schema";

export async function listEnabledEmailKinds(
  firmId: string,
  userId: string,
): Promise<string[]> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select({ kind: userEmailPrefs.kind })
      .from(userEmailPrefs)
      .where(eq(userEmailPrefs.userId, userId));
    return rows.map((r) => r.kind);
  });
}

export async function setEmailPref(
  firmId: string,
  userId: string,
  kind: string,
  enabled: boolean,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    if (enabled) {
      await tx
        .insert(userEmailPrefs)
        .values({ userId, kind })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(userEmailPrefs)
        .where(
          and(eq(userEmailPrefs.userId, userId), eq(userEmailPrefs.kind, kind)),
        );
    }
  });
}
