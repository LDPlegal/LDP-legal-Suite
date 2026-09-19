// Notifications queries (Fase 6). Insert is best-effort: a notification
// failing should never block the action that triggered it (assigning a
// task, paying an invoice). Read goes through withFirm with the user's
// own identity; the unique partial index speeds up the unread count badge.

import { after } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { adminDb } from "../admin";
import { withFirm } from "../with-firm";
import { notifications, userEmailPrefs, users, type Notification } from "../schema";
import { isEmailableKind, getKindMeta } from "@/lib/notifications/catalog";
import { sendEmail } from "@/lib/email";
import { buildNotificationEmail } from "@/lib/email/templates";
import { resolveFirmGraphSenderUserId } from "@/lib/notifications/sender";
import { sendMail } from "@/lib/oauth/microsoft-graph";
import { logSystemEvent } from "./system-events";

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
    // Swallow, notifications are best-effort.
  }

  // Email opt-in: si el kind es "emailable" y el usuario lo activó, mandamos
  // correo. Lo corremos en after() para que el envío COMPLETE después de la
  // respuesta, un floating promise (void) se mata cuando la lambda de Vercel
  // termina, así que el fetch a Graph nunca llegaba a completarse.
  try {
    after(async () => {
      try {
        await maybeSendNotificationEmail(input);
      } catch (e) {
        console.error("[notify] email send failed:", e);
        await logSystemEvent({
          firmId: input.firmId,
          kind: "notification_email_failed",
          severity: "error",
          message: `No se pudo enviar la notificación por email "${input.title}": ${e instanceof Error ? e.message : String(e)}`,
          context: { type: input.type, userId: input.userId },
          userId: input.userId,
        });
      }
    });
  } catch {
    // after() fuera de un request context (ej. corriendo desde un script):
    // hacemos el envío inline como fallback.
    void maybeSendNotificationEmail(input).catch(async (e) => {
      console.error("[notify] email send failed (inline):", e);
      await logSystemEvent({
        firmId: input.firmId,
        kind: "notification_email_failed",
        severity: "error",
        message: `No se pudo enviar la notificación por email "${input.title}": ${e instanceof Error ? e.message : String(e)}`,
        context: { type: input.type, userId: input.userId },
        userId: input.userId,
      });
    });
  }
}

async function maybeSendNotificationEmail(input: NotificationInput): Promise<void> {
  if (!isEmailableKind(input.type)) {
    console.log(`[notify] kind '${input.type}' no es emailable, sin correo.`);
    return;
  }

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
  if (pref.length === 0) {
    console.log(
      `[notify] user ${input.userId} no activó email para '${input.type}', sin correo.`,
    );
    return;
  }

  const [u] = await adminDb
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!u?.email) {
    console.log(`[notify] user ${input.userId} sin email, sin correo.`);
    return;
  }

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
        // No guardamos cada notificación en "Enviados" del emisor, sería
        // ruido en su Outlook.
        saveToSentItems: false,
      });
      console.log(`[notify] email '${input.type}' enviado a ${u.email} vía M365.`);
      return;
    } catch (e) {
      // Graph falló (token revocado, throttle, scope Mail.Send faltante…).
      // Logueamos el detalle para poder diagnosticar en los logs de Vercel,
      // y caemos al proveedor genérico abajo.
      console.error(
        `[notify] Graph sendMail falló (sender ${senderUserId} → ${u.email}):`,
        e,
      );
    }
  } else {
    console.log(
      `[notify] firm ${input.firmId} sin cuenta M365 emisora, uso fallback.`,
    );
  }

  await sendEmail({ to: u.email, subject, html });
  console.log(`[notify] email '${input.type}' enviado a ${u.email} vía fallback.`);
}

// Envía un correo de PRUEBA al propio usuario, ejercitando el mismo camino
// que las notificaciones reales (resolver emisor M365 → Graph sendMail, con
// fallback). A diferencia de notify(), NO chequea prefs ni el guard de
// auto-notificación, y PROPAGA el error para que la UI muestre exactamente
// qué falló (ej. scope Mail.Send faltante, token expirado).
export async function sendTestNotificationEmail(
  firmId: string,
  userId: string,
): Promise<{ ok: true; via: "m365" | "fallback"; to: string } | { ok: false; error: string }> {
  const [u] = await adminDb
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u?.email) return { ok: false, error: "Tu usuario no tiene un email configurado." };

  const { subject, html } = buildNotificationEmail({
    recipientName: u.name ?? undefined,
    title: "Correo de prueba de notificaciones",
    body: "Si recibís este mensaje, las notificaciones por email están funcionando. 🎉",
    categoryLabel: "Prueba",
  });

  const senderUserId = await resolveFirmGraphSenderUserId(firmId).catch(() => null);
  if (senderUserId) {
    try {
      await sendMail(senderUserId, {
        to: [{ email: u.email, name: u.name ?? undefined }],
        subject,
        bodyHtml: html,
        saveToSentItems: false,
      });
      return { ok: true, via: "m365", to: u.email };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: `Microsoft Graph rechazó el envío: ${msg}. Reconectá Microsoft en Seguridad → Integraciones (puede faltar el permiso Mail.Send).`,
      };
    }
  }

  // Sin emisor M365, intentamos el proveedor genérico (Resend/console).
  try {
    await sendEmail({ to: u.email, subject, html });
    return { ok: true, via: "fallback", to: u.email };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `No hay cuenta M365 conectada y el proveedor genérico falló: ${msg}` };
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
