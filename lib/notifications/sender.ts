// Resuelve QUÉ cuenta del firm envía los correos de notificación vía
// Microsoft 365 (Graph delegated /me/sendMail manda desde la casilla de ese
// usuario). Corre con adminDb porque notify() vive fuera de la sesión del
// destinatario.
//
// Orden de resolución:
//   1. firm.settings.notificationSenderUserId, si ese user tiene M365 activo.
//   2. Cualquier usuario del firm con M365 conectado (prefiere admin/partner).
//   3. null → el caller cae al fallback (Resend/console).

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { calendarIntegrations, firms, users } from "@/lib/db/schema";

async function hasActiveMicrosoft(userId: string): Promise<boolean> {
  const [row] = await adminDb
    .select({ id: calendarIntegrations.id })
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, userId),
        eq(calendarIntegrations.provider, "microsoft"),
        isNull(calendarIntegrations.disconnectedAt),
      ),
    )
    .limit(1);
  return !!row;
}

export async function resolveFirmGraphSenderUserId(
  firmId: string,
): Promise<string | null> {
  // 1. Emisor configurado explícitamente.
  const [firm] = await adminDb
    .select({ settings: firms.settings })
    .from(firms)
    .where(eq(firms.id, firmId))
    .limit(1);
  const configured = (firm?.settings as Record<string, unknown> | undefined)
    ?.notificationSenderUserId;
  if (typeof configured === "string" && configured) {
    if (await hasActiveMicrosoft(configured)) return configured;
  }

  // 2. Cualquier usuario del firm con M365 conectado (admin/partner primero).
  const candidates = await adminDb
    .select({ userId: users.id, role: users.role })
    .from(calendarIntegrations)
    .innerJoin(users, eq(users.id, calendarIntegrations.userId))
    .where(
      and(
        eq(users.firmId, firmId),
        eq(calendarIntegrations.provider, "microsoft"),
        isNull(calendarIntegrations.disconnectedAt),
        isNull(users.deletedAt),
      ),
    );
  if (candidates.length === 0) return null;
  const admin = candidates.find(
    (c) => c.role === "admin" || c.role === "partner",
  );
  return (admin ?? candidates[0]!).userId;
}

/** Lista los usuarios del firm con M365 conectado — para el selector de
 *  "casilla emisora" en Configuración. Pasa por adminDb pero filtra por firm. */
export async function listGraphCapableUsers(
  firmId: string,
): Promise<Array<{ id: string; name: string; email: string }>> {
  const rows = await adminDb
    .select({ id: users.id, name: users.name, email: users.email })
    .from(calendarIntegrations)
    .innerJoin(users, eq(users.id, calendarIntegrations.userId))
    .where(
      and(
        eq(users.firmId, firmId),
        eq(calendarIntegrations.provider, "microsoft"),
        isNull(calendarIntegrations.disconnectedAt),
        isNull(users.deletedAt),
      ),
    );
  // Dedup por si un user tuviera más de una integración.
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}
