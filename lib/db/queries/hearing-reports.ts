// Queries de reportes de audiencias (Fase 11).
//
// Listo / leo audiencias del caso (events con event_type='audiencia') con
// su reporte asociado si existe. Upsert del reporte por event_id. Audit
// de envíos por email.

import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { adminDb } from "../admin";
import { withFirm } from "../with-firm";
import {
  events,
  hearingReports,
  hearingReportSends,
  users,
  type HearingReport,
} from "../schema";
import { tiptapJsonToHtml } from "@/lib/editor/tiptap-to-html";

export type HearingListRow = {
  eventId: string;
  eventTitle: string;
  eventDescription: string | null;
  eventStartAt: Date;
  eventEndAt: Date;
  eventLocation: string | null;
  eventAllDay: boolean;
  eventAttendees: string[];
  eventReminderMinutes: number | null;
  eventType: string | null;
  eventCaseId: string | null;
  reportId: string | null;
  reportTitle: string | null;
  reportUpdatedAt: Date | null;
  lastSentAt: Date | null;
  lastSentToCount: number;
};

// Audiencias del caso (events con event_type='audiencia') + datos del
// reporte si existe + datos del último envío. Una sola consulta sería
// más eficiente pero esto se llama una vez por render — claridad gana.
export async function listHearingsForCase(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<HearingListRow[]> {
  return withFirm(firmId, userId, async (tx) => {
    const audiencias = await tx
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        startAt: events.startAt,
        endAt: events.endAt,
        location: events.location,
        allDay: events.allDay,
        attendees: events.attendees,
        reminderMinutes: events.reminderMinutes,
        eventType: events.eventType,
        caseId: events.caseId,
      })
      .from(events)
      .where(
        and(
          eq(events.caseId, caseId),
          eq(events.eventType, "audiencia"),
          isNull(events.deletedAt),
        ),
      )
      .orderBy(desc(events.startAt));

    if (audiencias.length === 0) return [];

    const eventIds = audiencias.map((a) => a.id);
    const reports = await tx
      .select({
        id: hearingReports.id,
        eventId: hearingReports.eventId,
        title: hearingReports.title,
        updatedAt: hearingReports.updatedAt,
      })
      .from(hearingReports)
      .where(
        and(
          inArray(hearingReports.eventId, eventIds),
          isNull(hearingReports.deletedAt),
        ),
      );
    const reportByEventId = new Map(reports.map((r) => [r.eventId, r]));

    const reportIds = reports.map((r) => r.id);
    const sends = reportIds.length
      ? await tx
          .select({
            reportId: hearingReportSends.reportId,
            sentAt: hearingReportSends.sentAt,
            recipientUserIds: hearingReportSends.recipientUserIds,
          })
          .from(hearingReportSends)
          .where(inArray(hearingReportSends.reportId, reportIds))
          .orderBy(desc(hearingReportSends.sentAt))
      : [];
    // Quedamos con el último envío por reporte (sends viene ordenado desc).
    const lastSendByReportId = new Map<
      string,
      { sentAt: Date; recipientCount: number }
    >();
    for (const s of sends) {
      if (!lastSendByReportId.has(s.reportId)) {
        lastSendByReportId.set(s.reportId, {
          sentAt: s.sentAt,
          recipientCount: s.recipientUserIds.length,
        });
      }
    }

    return audiencias.map((a) => {
      const r = reportByEventId.get(a.id);
      const send = r ? lastSendByReportId.get(r.id) : undefined;
      return {
        eventId: a.id,
        eventTitle: a.title,
        eventDescription: a.description,
        eventStartAt: a.startAt,
        eventEndAt: a.endAt,
        eventLocation: a.location,
        eventAllDay: a.allDay,
        eventAttendees: a.attendees,
        eventReminderMinutes: a.reminderMinutes,
        eventType: a.eventType,
        eventCaseId: a.caseId,
        reportId: r?.id ?? null,
        reportTitle: r?.title ?? null,
        reportUpdatedAt: r?.updatedAt ?? null,
        lastSentAt: send?.sentAt ?? null,
        lastSentToCount: send?.recipientCount ?? 0,
      };
    });
  });
}

// Carga el reporte completo de un evento (para abrir el editor).
export async function getHearingReportByEvent(
  firmId: string,
  userId: string,
  eventId: string,
): Promise<HearingReport | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(hearingReports)
      .where(
        and(
          eq(hearingReports.eventId, eventId),
          isNull(hearingReports.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

// Upsert: si ya existe reporte para ese evento, lo actualiza; si no, crea uno.
// content_html se calcula server-side a partir del JSON para no confiar en
// HTML que vendría del cliente (XSS).
export async function upsertHearingReport(
  firmId: string,
  userId: string,
  input: {
    caseId: string;
    eventId: string;
    title: string;
    contentJson: Record<string, unknown>;
  },
): Promise<HearingReport> {
  const contentHtml = tiptapJsonToHtml(input.contentJson);

  return withFirm(firmId, userId, async (tx) => {
    const existing = await tx
      .select({ id: hearingReports.id })
      .from(hearingReports)
      .where(
        and(
          eq(hearingReports.eventId, input.eventId),
          isNull(hearingReports.deletedAt),
        ),
      )
      .limit(1);

    const existingRow = existing[0];
    if (existingRow) {
      const [updated] = await tx
        .update(hearingReports)
        .set({
          title: input.title,
          contentJson: input.contentJson,
          contentHtml,
          updatedAt: new Date(),
        })
        .where(eq(hearingReports.id, existingRow.id))
        .returning();
      if (!updated) throw new Error("upsertHearingReport: update returned no row");
      return updated;
    }

    const [inserted] = await tx
      .insert(hearingReports)
      .values({
        firmId,
        caseId: input.caseId,
        eventId: input.eventId,
        title: input.title,
        contentJson: input.contentJson,
        contentHtml,
        createdBy: userId,
      })
      .returning();
    if (!inserted) throw new Error("upsertHearingReport: insert returned no row");
    return inserted;
  });
}

// Soft delete del reporte. El UNIQUE index sobre event_id incluye
// WHERE deleted_at IS NULL — al borrar, libera el "slot" así se puede crear
// un nuevo reporte para el mismo evento si hace falta.
export async function softDeleteHearingReport(
  firmId: string,
  userId: string,
  reportId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(hearingReports)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(hearingReports.id, reportId),
          isNull(hearingReports.deletedAt),
        ),
      )
      .returning({ id: hearingReports.id });
    return !!row;
  });
}

// Registra un envío por email. Usado por la server action de envío.
// Acepta tanto userIds (cuentas del firm) como emails sueltos (futuro).
export async function recordHearingReportSend(
  firmId: string,
  userId: string,
  input: {
    reportId: string;
    recipientUserIds: string[];
    recipientEmails: string[];
  },
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx.insert(hearingReportSends).values({
      firmId,
      reportId: input.reportId,
      sentBy: userId,
      recipientUserIds: input.recipientUserIds,
      recipientEmails: input.recipientEmails,
    });
  });
}

// Resuelve los datos completos del reporte + evento + emails de los
// destinatarios elegidos. Se usa desde la server action de envío (usa
// adminDb porque el envío puede hacerse en after() sin context de firm).
export async function getHearingReportForSend(
  firmId: string,
  reportId: string,
  recipientUserIds: string[],
): Promise<{
  report: HearingReport;
  event: { title: string; startAt: Date; endAt: Date; location: string | null };
  caseInfo: { id: string };
  recipients: Array<{ id: string; name: string; email: string }>;
} | null> {
  const [report] = await adminDb
    .select()
    .from(hearingReports)
    .where(
      and(
        eq(hearingReports.id, reportId),
        eq(hearingReports.firmId, firmId),
        isNull(hearingReports.deletedAt),
      ),
    )
    .limit(1);
  if (!report) return null;

  const [evt] = await adminDb
    .select({
      title: events.title,
      startAt: events.startAt,
      endAt: events.endAt,
      location: events.location,
    })
    .from(events)
    .where(eq(events.id, report.eventId))
    .limit(1);
  if (!evt) return null;

  const recipients = recipientUserIds.length
    ? await adminDb
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(
          and(
            inArray(users.id, recipientUserIds),
            eq(users.firmId, firmId),
            isNull(users.deletedAt),
          ),
        )
    : [];

  return {
    report,
    event: evt,
    caseInfo: { id: report.caseId },
    recipients: recipients
      .filter((r): r is { id: string; name: string; email: string } => !!r.email)
      .map((r) => ({ id: r.id, name: r.name ?? "Colega", email: r.email })),
  };
}
