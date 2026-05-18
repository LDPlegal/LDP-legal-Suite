// F7 bloque 4 — Worker que genera sugerencias proactivas para la bandeja
// del dashboard.
//
// Reglas implementadas en V1 (deterministas, sin Claude — barato y rápido):
//
//   1. STALE_CASE: caso abierto sin actuaciones nuevas (events, notes,
//      time_entries, documents) en los últimos N días → sugerir revisar.
//   2. PENDING_REVIEW: documento ai_generated con review_status='pending'
//      hace > 7 días → sugerir al lead lawyer aprobar/rechazar.
//   3. DEADLINE_SOON: evento de event_type='plazo_procesal' o
//      'vencimiento_administrativo' a < 5 días sin documento generado
//      por IA asociado.
//
// El presupuesto IA usa su propio canal (lib/ai/budget.ts), no este worker.
//
// Idempotencia: antes de insertar, chequea si ya existe una sugerencia
// `pending` del mismo (kind + caseId) en los últimos 7 días. Esto permite
// que el worker corra cada hora sin spammear.

import "server-only";
import { and, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import {
  aiSuggestions,
  cases,
  documents,
  events,
  notes,
  timeEntries,
  userMutedSuggestionKinds,
  users,
  type NewAiSuggestion,
} from "@/lib/db/schema";

const STALE_DAYS = 21;
const PENDING_REVIEW_DAYS = 7;
const DEADLINE_WINDOW_DAYS = 5;

export type SuggestionRunResult = {
  staleCases: number;
  pendingReviews: number;
  deadlinesSoon: number;
  skippedAlreadyPending: number;
};

export async function runSuggestionsForFirm(firmId: string): Promise<SuggestionRunResult> {
  const result: SuggestionRunResult = {
    staleCases: 0,
    pendingReviews: 0,
    deadlinesSoon: 0,
    skippedAlreadyPending: 0,
  };

  // ---- 1) STALE_CASE -------------------------------------------------------
  // Cases that are open, not soft-deleted, and have no activity in N days.
  // "Activity" = any of: events created/updated, notes updated, documents
  // created, time_entries created. We approximate with each case's most
  // recent updated_at, plus a check on its child tables.
  const staleSince = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const staleCases = await adminDb
    .select({
      caseId: cases.id,
      caseCode: cases.code,
      caseTitle: cases.title,
      leadLawyerId: cases.leadLawyerId,
      updatedAt: cases.updatedAt,
    })
    .from(cases)
    .where(
      and(
        eq(cases.firmId, firmId),
        eq(cases.status, "open"),
        isNull(cases.deletedAt),
        lt(cases.updatedAt, staleSince),
        // No activity in any child table since staleSince.
        sql`NOT EXISTS (
          SELECT 1 FROM ${events} e
          WHERE e.case_id = ${cases.id}
            AND e.created_at >= ${staleSince}
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${notes} n
          WHERE n.case_id = ${cases.id}
            AND n.updated_at >= ${staleSince}
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${documents} d
          WHERE d.case_id = ${cases.id}
            AND d.created_at >= ${staleSince}
            AND d.deleted_at IS NULL
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${timeEntries} t
          WHERE t.case_id = ${cases.id}
            AND t.created_at >= ${staleSince}
        )`,
      ),
    )
    .limit(50);

  for (const c of staleCases) {
    if (!c.leadLawyerId) continue; // sin lead nadie es responsable
    const enqueued = await maybeEnqueue(firmId, {
      firmId,
      userId: c.leadLawyerId,
      caseId: c.caseId,
      kind: "stale_case",
      title: `Caso sin movimiento: ${c.caseCode}`,
      body: `Hace más de ${STALE_DAYS} días que ${c.caseCode} (${c.caseTitle}) no registra actuaciones, notas, documentos ni tiempo. Revisalo para confirmar el estado y, si corresponde, archivalo.`,
      href: `/casos/${c.caseId}`,
      severity: "info",
      status: "pending",
      // Stale stays "interesante" durante 7 días; pasado ese tiempo la
      // sugerencia expira y el worker la re-evalúa.
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      metadata: { lastUpdatedAt: c.updatedAt.toISOString(), staleDays: STALE_DAYS },
    });
    if (enqueued) result.staleCases++;
    else result.skippedAlreadyPending++;
  }

  // ---- 2) PENDING_REVIEW ---------------------------------------------------
  const pendingSince = new Date(Date.now() - PENDING_REVIEW_DAYS * 24 * 60 * 60 * 1000);
  const pending = await adminDb
    .select({
      docId: documents.id,
      docName: documents.name,
      caseId: documents.caseId,
      caseCode: cases.code,
      leadLawyerId: cases.leadLawyerId,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .leftJoin(cases, eq(documents.caseId, cases.id))
    .where(
      and(
        eq(documents.firmId, firmId),
        eq(documents.aiGenerated, true),
        eq(documents.reviewStatus, "pending"),
        isNull(documents.deletedAt),
        lt(documents.createdAt, pendingSince),
      ),
    )
    .limit(50);

  for (const p of pending) {
    if (!p.leadLawyerId || !p.caseId) continue;
    const enqueued = await maybeEnqueue(firmId, {
      firmId,
      userId: p.leadLawyerId,
      caseId: p.caseId,
      kind: "pending_review",
      title: `Documento por revisar: ${p.docName}`,
      body: `El borrador generado por IA "${p.docName}" en ${p.caseCode ?? "caso desconocido"} lleva más de ${PENDING_REVIEW_DAYS} días pendiente de tu aprobación. Aprobalo o rechazalo desde la pestaña Documentos.`,
      href: `/casos/${p.caseId}?tab=documentos`,
      severity: "warn",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      metadata: { documentId: p.docId, createdAt: p.createdAt.toISOString() },
    });
    if (enqueued) result.pendingReviews++;
    else result.skippedAlreadyPending++;
  }

  // ---- 3) DEADLINE_SOON ----------------------------------------------------
  const windowEnd = new Date(Date.now() + DEADLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const soon = await adminDb
    .select({
      eventId: events.id,
      eventTitle: events.title,
      eventType: events.eventType,
      startAt: events.startAt,
      caseId: events.caseId,
      caseCode: cases.code,
      leadLawyerId: cases.leadLawyerId,
    })
    .from(events)
    .leftJoin(cases, eq(events.caseId, cases.id))
    .where(
      and(
        eq(events.firmId, firmId),
        or(
          eq(events.eventType, "plazo_procesal"),
          eq(events.eventType, "vencimiento_administrativo"),
        ),
        gte(events.startAt, new Date()),
        lt(events.startAt, windowEnd),
        isNotNull(events.caseId),
      ),
    )
    .limit(50);

  for (const ev of soon) {
    if (!ev.leadLawyerId || !ev.caseId) continue;
    const daysAway = Math.max(
      1,
      Math.ceil((ev.startAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    const enqueued = await maybeEnqueue(firmId, {
      firmId,
      userId: ev.leadLawyerId,
      caseId: ev.caseId,
      kind: "deadline_soon",
      title: `Plazo próximo: ${ev.eventTitle}`,
      body: `${ev.eventType === "plazo_procesal" ? "Plazo procesal" : "Vencimiento"} en ${ev.caseCode ?? "el caso"} dentro de ${daysAway} día(s). Si necesitás preparar un borrador, abrí el chat del expediente y pedíselo a la IA.`,
      href: `/casos/${ev.caseId}`,
      severity: daysAway <= 2 ? "critical" : "warn",
      status: "pending",
      // Expira el día del vencimiento (deja de tener sentido).
      expiresAt: new Date(ev.startAt.getTime() + 24 * 60 * 60 * 1000),
      metadata: {
        eventId: ev.eventId,
        eventType: ev.eventType,
        startAt: ev.startAt.toISOString(),
        daysAway,
      },
    });
    if (enqueued) result.deadlinesSoon++;
    else result.skippedAlreadyPending++;
  }

  return result;
}

// Insert if (kind, caseId, userId) doesn't already have a pending row,
// and the user hasn't muted this kind via feedback.
async function maybeEnqueue(
  firmId: string,
  row: NewAiSuggestion,
): Promise<boolean> {
  // 1) Respect mute list.
  const root = row.kind.split(":")[0] ?? row.kind;
  const [muted] = await adminDb
    .select({ kindPattern: userMutedSuggestionKinds.kindPattern })
    .from(userMutedSuggestionKinds)
    .where(
      and(
        eq(userMutedSuggestionKinds.userId, row.userId),
        eq(userMutedSuggestionKinds.kindPattern, root),
      ),
    )
    .limit(1);
  if (muted) return false;

  // 2) Dedupe pending.
  const existing = await adminDb
    .select({ id: aiSuggestions.id })
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.firmId, firmId),
        eq(aiSuggestions.kind, row.kind),
        eq(aiSuggestions.userId, row.userId),
        row.caseId
          ? eq(aiSuggestions.caseId, row.caseId)
          : isNull(aiSuggestions.caseId),
        eq(aiSuggestions.status, "pending"),
      ),
    )
    .limit(1);
  if (existing.length > 0) return false;
  await adminDb.insert(aiSuggestions).values(row);
  return true;
}

// Top-level driver: corre el worker para cada firm. Llamado desde el cron
// endpoint (e.g. POST /api/cron/ai-suggestions con bearer secret).
export async function runSuggestionsForAllFirms(): Promise<
  Array<{ firmId: string; result: SuggestionRunResult }>
> {
  const allFirms = await adminDb
    .select({ id: users.firmId })
    .from(users)
    .groupBy(users.firmId);
  const out: Array<{ firmId: string; result: SuggestionRunResult }> = [];
  for (const f of allFirms) {
    if (!f.id) continue;
    try {
      const result = await runSuggestionsForFirm(f.id);
      out.push({ firmId: f.id, result });
    } catch (err) {
      console.error("[ai-suggestions] firm failed", { firmId: f.id, err });
    }
  }
  return out;
}
