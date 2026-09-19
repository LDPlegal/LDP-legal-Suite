import { and, desc, eq, or, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { auditLog, users } from "../schema";

export type AuditEntry = {
  id: string;
  userId: string | null;
  userName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string | null;
  diff: Record<string, unknown> | null;
  createdAt: Date;
};

// listAuditFor supports two filter modes:
//   1) Exact entity:    pass { entityType, entityId }, returns events whose
//      target IS that entity. Use for non-case detail pages.
//   2) Case correlation: pass { caseId }, returns events whose target IS the
//      case itself, OR whose target is any sub-entity (invoice / time / expense
//      / document / note / task / event) tagged with case_id = caseId. Use
//      this on the case detail's Bitácora tab so all activity related to the
//      case appears together.
export async function listAuditFor(
  firmId: string,
  userId: string,
  filter: {
    entityType?: string;
    entityId?: string;
    caseId?: string;
    limit?: number;
  },
): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  return withFirm(firmId, userId, async (tx) => {
    const conds = [];
    if (filter.caseId) {
      // case detail: events about the case itself OR sub-entities tagged with
      // this case_id (invoices, time entries, expenses, documents, notes…).
      conds.push(
        or(
          and(eq(auditLog.entityType, "case"), eq(auditLog.entityId, filter.caseId)),
          eq(auditLog.caseId, filter.caseId),
        )!,
      );
    } else {
      if (filter.entityType) conds.push(eq(auditLog.entityType, filter.entityType));
      if (filter.entityId) conds.push(eq(auditLog.entityId, filter.entityId));
    }

    const rows = await tx
      .select({
        id: auditLog.id,
        userId: auditLog.userId,
        userName: users.name,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        summary: auditLog.summary,
        diff: auditLog.diff,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
    return rows;
  });
}

export async function listFirmRecentAudit(
  firmId: string,
  userId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: auditLog.id,
        userId: auditLog.userId,
        userName: users.name,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        summary: auditLog.summary,
        diff: auditLog.diff,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  });
}

export const ACTION_LABEL: Record<string, string> = {
  created: "creó",
  updated: "actualizó",
  deleted: "eliminó",
  approved: "aprobó",
  sent: "envió",
  paid: "pagó",
  voided: "anuló",
  uploaded: "subió",
  timer_started: "inició timer",
  timer_stopped: "detuvo timer",
  ncf_assigned: "asignó NCF",
};

export const ENTITY_LABEL: Record<string, string> = {
  case: "caso",
  client: "cliente",
  invoice: "factura",
  payment: "pago",
  time_entry: "tiempo",
  expense: "gasto",
  task: "tarea",
  event: "evento",
  document: "documento",
  note: "nota",
  user: "usuario",
  ncf_range: "rango NCF",
};

// =============================================================================
// Aggregate report queries
// =============================================================================

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  current: "Al día",
  d1_30: "1-30 días",
  d31_60: "31-60 días",
  d61_90: "61-90 días",
  d90_plus: "+90 días",
};

export async function arAgingReport(firmId: string, userId: string) {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        CASE
          WHEN due_on >= now() THEN 'current'
          WHEN due_on >= now() - INTERVAL '30 days' THEN 'd1_30'
          WHEN due_on >= now() - INTERVAL '60 days' THEN 'd31_60'
          WHEN due_on >= now() - INTERVAL '90 days' THEN 'd61_90'
          ELSE 'd90_plus'
        END AS bucket,
        SUM(balance::numeric)::text AS total,
        COUNT(*)::int AS count
      FROM invoices
      WHERE deleted_at IS NULL
        AND status IN ('sent', 'partial', 'overdue')
      GROUP BY bucket
      ORDER BY bucket
    `);
    return result.rows as Array<{ bucket: AgingBucket; total: string; count: number }>;
  });
}

export async function hoursByUserReport(
  firmId: string,
  userId: string,
  range: { from: Date; to: Date },
) {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        COALESCE(SUM(t.duration_seconds), 0)::int AS total_seconds,
        COALESCE(SUM(CASE WHEN t.billable THEN t.duration_seconds ELSE 0 END), 0)::int AS billable_seconds,
        COUNT(t.id)::int AS entry_count
      FROM users u
      LEFT JOIN time_entries t
        ON t.user_id = u.id
        AND t.deleted_at IS NULL
        AND t.started_at >= ${range.from}
        AND t.started_at < ${range.to}
      WHERE u.deleted_at IS NULL
        AND u.role <> 'client'
      GROUP BY u.id, u.name
      ORDER BY total_seconds DESC
    `);
    return result.rows as Array<{
      user_id: string;
      user_name: string;
      total_seconds: number;
      billable_seconds: number;
      entry_count: number;
    }>;
  });
}

export async function hoursByMonthReport(
  firmId: string,
  userId: string,
  monthsBack = 6,
) {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        to_char(date_trunc('month', started_at), 'YYYY-MM') AS month,
        COALESCE(SUM(duration_seconds), 0)::int AS total_seconds,
        COALESCE(SUM(CASE WHEN billable THEN duration_seconds ELSE 0 END), 0)::int AS billable_seconds
      FROM time_entries
      WHERE deleted_at IS NULL
        AND started_at >= date_trunc('month', now()) - (${`${monthsBack - 1} months`}::interval)
      GROUP BY month
      ORDER BY month ASC
    `);
    return result.rows as Array<{
      month: string;
      total_seconds: number;
      billable_seconds: number;
    }>;
  });
}

export async function topCasesByHoursReport(
  firmId: string,
  userId: string,
  range: { from: Date; to: Date },
  limit = 10,
) {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        c.id AS case_id,
        c.code AS case_code,
        c.title AS case_title,
        COALESCE(SUM(t.duration_seconds), 0)::int AS total_seconds,
        COALESCE(SUM(CASE WHEN t.billable THEN t.duration_seconds ELSE 0 END), 0)::int AS billable_seconds
      FROM cases c
      LEFT JOIN time_entries t
        ON t.case_id = c.id
        AND t.deleted_at IS NULL
        AND t.started_at >= ${range.from}
        AND t.started_at < ${range.to}
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.code, c.title
      HAVING COALESCE(SUM(t.duration_seconds), 0) > 0
      ORDER BY total_seconds DESC
      LIMIT ${limit}
    `);
    return result.rows as Array<{
      case_id: string;
      case_code: string;
      case_title: string;
      total_seconds: number;
      billable_seconds: number;
    }>;
  });
}

// AI usage summary (Fase 6.2): totals + breakdown by feature and user
// for the given period. Used by /reportes tab "IA".
export async function aiUsageSummary(
  firmId: string,
  userId: string,
  range: { from: Date; to: Date },
) {
  return withFirm(firmId, userId, async (tx) => {
    const totals = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS call_count,
        COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
        COALESCE(SUM(cost_usd::numeric), 0)::text AS cost_usd
      FROM ai_usage
      WHERE created_at >= ${range.from}
        AND created_at < ${range.to}
    `);
    const byFeature = await tx.execute(sql`
      SELECT
        feature,
        COUNT(*)::int AS call_count,
        COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
        COALESCE(SUM(cost_usd::numeric), 0)::text AS cost_usd
      FROM ai_usage
      WHERE created_at >= ${range.from}
        AND created_at < ${range.to}
      GROUP BY feature
      ORDER BY cost_usd DESC
    `);
    const byUser = await tx.execute(sql`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        COUNT(a.*)::int AS call_count,
        COALESCE(SUM(a.input_tokens), 0)::int AS input_tokens,
        COALESCE(SUM(a.output_tokens), 0)::int AS output_tokens,
        COALESCE(SUM(a.cost_usd::numeric), 0)::text AS cost_usd
      FROM ai_usage a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.created_at >= ${range.from}
        AND a.created_at < ${range.to}
      GROUP BY u.id, u.name
      ORDER BY cost_usd DESC
    `);
    return {
      totals: totals.rows[0] as {
        call_count: number;
        input_tokens: number;
        output_tokens: number;
        cost_usd: string;
      },
      byFeature: byFeature.rows as Array<{
        feature: string;
        call_count: number;
        input_tokens: number;
        output_tokens: number;
        cost_usd: string;
      }>,
      byUser: byUser.rows as Array<{
        user_id: string | null;
        user_name: string | null;
        call_count: number;
        input_tokens: number;
        output_tokens: number;
        cost_usd: string;
      }>,
    };
  });
}

export const AI_FEATURE_LABEL: Record<string, string> = {
  case_summary: "Resumen de caso",
  refine_note: "Mejorar nota",
  doc_search: "Búsqueda documentos",
  doc_summary: "Resumen de documento",
  chat: "Chat IA",
  scan_classify: "Clasificación de escaneo",
  matter_chat: "Chat por expediente",
  matter_context: "Contexto expediente",
  doc_generate: "Generación de documento",
  event_parse: "Parseo de evento",
  doc_format: "Formato de documento",
};

// F7+ Bloque 4: trazabilidad de documentos generados por IA. Lista los
// últimos N docs con ai_generated=true, su estado de revisión, quién
// hizo el prompt original, y el caso al que pertenecen. Datos clave que
// Gabriel pide en la spec como "auditoría completa de IA".
export async function aiGeneratedDocsReport(
  firmId: string,
  userId: string,
  limit: number = 50,
) {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        d.id,
        d.name,
        d.created_at,
        d.review_status,
        d.reviewed_at,
        d.ai_original_prompt,
        d.case_id,
        c.code AS case_code,
        c.title AS case_title,
        u.id AS uploader_id,
        u.name AS uploader_name,
        r.name AS reviewer_name
      FROM documents d
      LEFT JOIN cases c ON c.id = d.case_id
      LEFT JOIN users u ON u.id = d.uploaded_by
      LEFT JOIN users r ON r.id = d.reviewed_by
      WHERE d.ai_generated = true
        AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC
      LIMIT ${limit}
    `);
    return rows.rows as Array<{
      id: string;
      name: string;
      created_at: Date;
      review_status: string | null;
      reviewed_at: Date | null;
      ai_original_prompt: string | null;
      case_id: string | null;
      case_code: string | null;
      case_title: string | null;
      uploader_id: string | null;
      uploader_name: string | null;
      reviewer_name: string | null;
    }>;
  });
}

// F7+ Bloque 4: trazabilidad de eventos creados por IA. Mismo concepto
// que aiGeneratedDocsReport pero para eventos. Útil para que el partner
// vea qué eventos fueron sugeridos por la IA vs creados a mano.
export async function aiCreatedEventsReport(
  firmId: string,
  userId: string,
  limit: number = 50,
) {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        e.id,
        e.title,
        e.event_type,
        e.start_at,
        e.original_prompt,
        e.case_id,
        c.code AS case_code,
        c.title AS case_title,
        u.id AS creator_id,
        u.name AS creator_name,
        e.created_at,
        e.deleted_at
      FROM events e
      LEFT JOIN cases c ON c.id = e.case_id
      LEFT JOIN users u ON u.id = e.created_by
      WHERE e.created_by_ai = true
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `);
    return rows.rows as Array<{
      id: string;
      title: string;
      event_type: string | null;
      start_at: Date;
      original_prompt: string | null;
      case_id: string | null;
      case_code: string | null;
      case_title: string | null;
      creator_id: string | null;
      creator_name: string | null;
      created_at: Date;
      deleted_at: Date | null;
    }>;
  });
}

// =============================================================================
// DGII Reporte 607, ventas con NCF del período (Fase 6.2)
// =============================================================================
// Formato standard DGII: una línea por factura emitida con NCF en el período,
// pipe-delimited, con columnas predefinidas. Lo usa el contador para subir el
// archivo mensual a la oficina virtual.

export async function dgii607Report(
  firmId: string,
  userId: string,
  range: { from: Date; to: Date },
) {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        i.ncf AS ncf,
        i.ncf_type AS ncf_type,
        c.tax_id_type AS client_tax_id_type,
        c.tax_id AS client_tax_id,
        c.legal_name AS client_legal_name,
        c.display_name AS client_display_name,
        i.issued_on AS issued_on,
        i.subtotal::text AS subtotal,
        i.itbis_amount::text AS itbis,
        i.isr_withholding_amount::text AS isr_withholding,
        i.total::text AS total
      FROM invoices i
      INNER JOIN clients c ON c.id = i.client_id
      WHERE i.deleted_at IS NULL
        AND i.ncf IS NOT NULL
        AND i.status IN ('sent', 'partial', 'paid', 'overdue')
        AND i.issued_on >= ${range.from}
        AND i.issued_on < ${range.to}
      ORDER BY i.issued_on ASC
    `);
    return result.rows as Array<{
      ncf: string;
      ncf_type: "B01" | "B02" | "E31" | "E32";
      client_tax_id_type: string | null;
      client_tax_id: string | null;
      client_legal_name: string | null;
      client_display_name: string;
      issued_on: Date;
      subtotal: string;
      itbis: string;
      isr_withholding: string;
      total: string;
    }>;
  });
}

export async function billingSummary(
  firmId: string,
  userId: string,
  range: { from: Date; to: Date },
) {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN status NOT IN ('void') THEN total::numeric ELSE 0 END), 0)::text AS total_billed,
        COALESCE(SUM(CASE WHEN status NOT IN ('void') THEN balance::numeric ELSE 0 END), 0)::text AS total_outstanding,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total::numeric ELSE 0 END), 0)::text AS total_collected,
        COUNT(*) FILTER (WHERE status NOT IN ('void'))::int AS invoice_count
      FROM invoices
      WHERE deleted_at IS NULL
        AND issued_on >= ${range.from}
        AND issued_on < ${range.to}
    `);
    return result.rows[0] as {
      total_billed: string;
      total_outstanding: string;
      total_collected: string;
      invoice_count: number;
    };
  });
}
