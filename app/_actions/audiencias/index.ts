"use server";

// Server actions para reportes de audiencias.
//
// guardarReporteAudienciaAction: upsert (crear o actualizar) un reporte
//   asociado a un evento tipo audiencia.
// enviarReporteAudienciaAction: manda el reporte por email a los users
//   del firm que el autor eligió. Registra el envío para audit y para
//   mostrar "Último envío: X" en la UI.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/admin";
import { cases, events } from "@/lib/db/schema";
import {
  getHearingReportForSend,
  recordHearingReportSend,
  softDeleteHearingReport,
  upsertHearingReport,
} from "@/lib/db/queries/hearing-reports";
import { logAuditStandalone } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email";
import { buildHearingReportEmail } from "@/lib/email/templates";
import { resolveFirmGraphSenderUserId } from "@/lib/notifications/sender";
import { sendMail } from "@/lib/oauth/microsoft-graph";
import { logSystemEvent } from "@/lib/db/queries/system-events";

const EliminarSchema = z.object({
  reportId: z.string().uuid(),
  caseId: z.string().uuid(),
});

export async function eliminarReporteAudienciaAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const parsed = EliminarSchema.parse({
    reportId: formData.get("reportId"),
    caseId: formData.get("caseId"),
  });
  const ok = await softDeleteHearingReport(user.firmId, user.userId, parsed.reportId);
  if (ok) {
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "event",
      entityId: parsed.reportId,
      caseId: parsed.caseId,
      action: "deleted",
      summary: "Eliminó reporte de audiencia",
    });
  }
  revalidatePath(`/casos/${parsed.caseId}`);
}

const GuardarSchema = z.object({
  caseId: z.string().uuid(),
  eventId: z.string().uuid(),
  title: z.string().min(1).max(200),
  contentJson: z.record(z.string(), z.unknown()),
});

export async function guardarReporteAudienciaAction(input: {
  caseId: string;
  eventId: string;
  title: string;
  contentJson: Record<string, unknown>;
}): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = GuardarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos. Verificá título y contenido." };
  }

  // Verificar que el evento existe, es del caso, y es audiencia.
  const [evt] = await adminDb
    .select({
      id: events.id,
      caseId: events.caseId,
      eventType: events.eventType,
      firmId: events.firmId,
    })
    .from(events)
    .where(eq(events.id, parsed.data.eventId))
    .limit(1);

  if (!evt || evt.firmId !== user.firmId) {
    return { ok: false, error: "Evento no encontrado." };
  }
  if (evt.caseId !== parsed.data.caseId) {
    return { ok: false, error: "El evento no pertenece a este caso." };
  }
  if (evt.eventType !== "audiencia") {
    return {
      ok: false,
      error: "Solo eventos marcados como 'audiencia' pueden tener reporte.",
    };
  }

  try {
    const report = await upsertHearingReport(user.firmId, user.userId, parsed.data);
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "event",
      entityId: report.id,
      caseId: parsed.data.caseId,
      action: "updated",
      summary: `Guardó reporte de audiencia: ${parsed.data.title}`,
    });
    revalidatePath(`/casos/${parsed.data.caseId}`);
    return { ok: true, reportId: report.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `No se pudo guardar el reporte: ${msg}` };
  }
}

const EnviarSchema = z.object({
  reportId: z.string().uuid(),
  caseId: z.string().uuid(),
  recipientUserIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function enviarReporteAudienciaAction(input: {
  reportId: string;
  caseId: string;
  recipientUserIds: string[];
}): Promise<
  | { ok: true; sentTo: number; via: "m365" | "fallback" | "mixed" }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const parsed = EnviarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Seleccioná al menos un destinatario." };
  }

  const data = await getHearingReportForSend(
    user.firmId,
    parsed.data.reportId,
    parsed.data.recipientUserIds,
  );
  if (!data) return { ok: false, error: "Reporte no encontrado." };
  if (data.recipients.length === 0) {
    return { ok: false, error: "Ninguno de los destinatarios tiene email." };
  }

  // Resolver info del caso para el email.
  const [caseRow] = await adminDb
    .select({ code: cases.code, title: cases.title })
    .from(cases)
    .where(eq(cases.id, data.caseInfo.id))
    .limit(1);
  if (!caseRow) return { ok: false, error: "Caso no encontrado." };

  const senderName = user.name ?? "Tu colega";
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const actionUrl = `${baseUrl}/casos/${data.caseInfo.id}?tab=audiencias`;

  // Construir el email una vez por destinatario (varía el recipientName).
  // Lo mandamos por after() para no bloquear la respuesta.
  const m365SenderUserId = await resolveFirmGraphSenderUserId(user.firmId).catch(
    () => null,
  );

  let m365Count = 0;
  let fallbackCount = 0;
  const errors: string[] = [];

  for (const r of data.recipients) {
    const { subject, html } = buildHearingReportEmail({
      recipientName: r.name,
      senderName,
      reportTitle: data.report.title,
      reportHtml: data.report.contentHtml,
      caseTitle: caseRow.title,
      caseCode: caseRow.code,
      hearingTitle: data.event.title,
      hearingStartAt: data.event.startAt,
      hearingLocation: data.event.location,
      actionUrl,
    });

    let sent = false;
    if (m365SenderUserId) {
      try {
        await sendMail(m365SenderUserId, {
          to: [{ email: r.email, name: r.name }],
          subject,
          bodyHtml: html,
          saveToSentItems: true,
        });
        m365Count += 1;
        sent = true;
      } catch (e) {
        // Cae al fallback más abajo, pero registramos el error.
        errors.push(
          `M365 → ${r.email}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (!sent) {
      try {
        await sendEmail({ to: r.email, subject, html });
        fallbackCount += 1;
      } catch (e) {
        errors.push(
          `fallback → ${r.email}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  const totalSent = m365Count + fallbackCount;
  if (totalSent === 0) {
    return {
      ok: false,
      error: `No se pudo enviar a nadie. ${errors.slice(0, 2).join(" | ")}`,
    };
  }

  // Registrar el envío. Best-effort (no romper si falla).
  try {
    await recordHearingReportSend(user.firmId, user.userId, {
      reportId: parsed.data.reportId,
      recipientUserIds: data.recipients.map((r) => r.id),
      recipientEmails: data.recipients.map((r) => r.email),
    });
  } catch (e) {
    console.error("[audiencias] recordHearingReportSend failed:", e);
  }

  try {
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "event",
      entityId: parsed.data.reportId,
      caseId: parsed.data.caseId,
      action: "updated",
      summary: `Envió reporte de audiencia por email a ${totalSent} destinatario(s)`,
    });
  } catch {}

  // Errores parciales no rompen la respuesta, el user ve cuántos llegaron,
  // pero dejamos rastro en Eventos del sistema para que alguien revise a
  // qué destinatarios NO les llegó el reporte.
  if (errors.length > 0) {
    after(async () => {
      console.error("[audiencias] envío parcial:", errors);
      await logSystemEvent({
        firmId: user.firmId,
        kind: "hearing_report_partial_send",
        severity: "warning",
        message: `El reporte de audiencia se envió a ${totalSent} de ${data.recipients.length} destinatarios. ${errors.length} fallaron.`,
        context: { reportId: parsed.data.reportId, errors: errors.slice(0, 5) },
        userId: user.userId,
      });
    });
  }

  revalidatePath(`/casos/${parsed.data.caseId}`);

  const via: "m365" | "fallback" | "mixed" =
    m365Count > 0 && fallbackCount === 0
      ? "m365"
      : m365Count === 0 && fallbackCount > 0
        ? "fallback"
        : "mixed";
  return { ok: true, sentTo: totalSent, via };
}
