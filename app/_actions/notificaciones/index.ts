"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/db/queries/notifications";

export async function fetchNotifications(opts: { onlyUnread?: boolean } = {}) {
  const user = await requireUser();
  const [items, unreadCount] = await Promise.all([
    listNotifications(user.firmId, user.userId, { limit: 30, ...opts }),
    countUnreadNotifications(user.firmId, user.userId),
  ]);
  return { items, unreadCount };
}

export async function marcarLeidaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("notificationId"));
  await markNotificationRead(user.firmId, user.userId, id);
  revalidatePath("/dashboard");
}

export async function marcarTodasLeidasAction(): Promise<void> {
  const user = await requireUser();
  await markAllNotificationsRead(user.firmId, user.userId);
  revalidatePath("/dashboard");
}
