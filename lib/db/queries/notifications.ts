// Notifications queries (Fase 6). Insert is best-effort: a notification
// failing should never block the action that triggered it (assigning a
// task, paying an invoice). Read goes through withFirm with the user's
// own identity; the unique partial index speeds up the unread count badge.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { adminDb } from "../admin";
import { withFirm } from "../with-firm";
import { notifications, userEmailPrefs, users, type Notification } from "../schema";
import { isEmailableKind, getKindMeta } from "@/lib/notifications/catalog";
import { sendEmail } from "@/lib/email";
import { buildNotificationEmail } from "@/lib/email/templates";
import { resolveFirmGraphSenderUserId } from "@/lib/notifications/sender";
import { sendMail } from "@/lib/oauth/microsoft-graph";

export type NotificationInput = {
  firmId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
};

// Use adminDb because callers may not be in the recipient's session context
// (e.g. user A assigns task to user B → A's withFirm is active, but we want
// the notification owned by B). adminDb bypasses RLS; we set firmId
// explicitly. Safe because this function is server-only and we control the
// payload.
export async function notify(input: NotificationInput): Promise<void> {
  try {
    await adminDb.insert(notifications).values({
      firmId: input.firmId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    });
  } catch {
    // Swallow — notifications are best-effort.
  }

  // Email opt-in: si el kind es "emailable" y el usuario lo activó, mandamos
  // correo. Fire-and-forget — un fallo de email nunca debe romper el flujo
  // que disparó la notificación.
  void maybeSendNotificationEmail(input).catch(() => {});
}

async function maybeSendNotificationEmail(input: NotificationInput): Promise<void> {
  if (!isEmailableKind(input.type)) return;

  // ¿El usuario activó email para este kind?
  const pref = await adminDb
    .select({ kind: userEmailPrefs.kind })
    .from(userEmailPrefs)
    .where(
      and(
        eq(userEmailPrefs.userId, input.userId),
        eq(userEmailPrefs.kind, input.type),
      ),
    )
    .limit(1);
  if (pref.length === 0) return;

  const [u] = await adminDb
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!u?.email) return;

  const meta = getKindMeta(input.type);
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const actionUrl = input.href
    ? input.href.startsWith("http")
      ? input.href
      : `${baseUrl}${input.href}`
    : null;

  const { subject, html } = buildNotificationEmail({
    recipientName: u.name ?? undefined,
    title: input.title,
    body: input.body ?? undefined,
    actionUrl,
    categoryLabel: meta?.label ?? "Notificación",
  });

  // Preferimos enviar desde el Microsoft 365 del firm (cero DNS, sale del
  // dominio real). Si no hay cuenta conectada o Graph falla, caemos al
  // proveedor genérico (Resend/console) sin romper nada.
  const senderUserId = await resolveFirmGraphSenderUserId(input.firmId).catch(
    () => null,
  );
  if (senderUserId) {
    try {
      await sendMail(senderUserId, {
        to: [{ email: u.email, name: u.name ?? undefined }],
        subject,
        bodyHtml: html,
        // No guardamos cada notificación en "Enviados" del emisor — sería
        // ruido en su Outlook.
        saveToSentItems: false,
      });
      return;
    } catch {
      // Graph falló (token revocado, throttle, etc.) → fallback abajo.
    }
  }

  await sendEmail({ to: u.email, subject, html });
}

export async function listNotifications(
  firmId: string,
  userId: string,
  opts: { limit?: number; onlyUnread?: boolean } = {},
): Promise<Notification[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  return withFirm(firmId, userId, async (tx) => {
    const conds = [eq(notifications.userId, userId)];
    if (opts.onlyUnread) conds.push(isNull(notifications.readAt));
    return tx
      .select()
      .from(notifications)
      .where(and(...conds))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  });
}

export async function countUnreadNotifications(
  firmId: string,
  userId: string,
): Promise<number> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.count ?? 0;
  });
}

export async function markNotificationRead(
  firmId: string,
  userId: string,
  notificationId: string,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
        ),
      );
  });
}

export async function markAllNotificationsRead(
  firmId: string,
  userId: string,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      );
  });
}
