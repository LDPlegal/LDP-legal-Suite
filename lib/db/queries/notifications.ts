// Notifications queries (Fase 6). Insert is best-effort: a notification
// failing should never block the action that triggered it (assigning a
// task, paying an invoice). Read goes through withFirm with the user's
// own identity; the unique partial index speeds up the unread count badge.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { adminDb } from "../admin";
import { withFirm } from "../with-firm";
import { notifications, type Notification } from "../schema";

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
