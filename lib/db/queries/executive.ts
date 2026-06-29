// Reportes ejecutivos para la dirección de la firma (vista del dueño).
//
// Responden las preguntas que un socio director hace al abrir el sistema:
//   - ¿Cuánto trabajo hecho todavía no facturé? (WIP = dinero parado)
//   - ¿Qué casos están estancados? (riesgo de abandono / cliente molesto)
//   - ¿Quiénes son mis mejores clientes por facturación?
//
// Todas pasan por withFirm (RLS). SQL crudo via tx.execute para los
// agregados — mismo patron que lib/db/queries/audit.ts.

import { sql } from "drizzle-orm";
import { withFirm } from "../with-firm";

// =============================================================================
// WIP no facturado — trabajo hecho que aun no se cobro.
// =============================================================================
// Tiempos billable que NO estan en una factura (status != invoiced),
// valorizados por el rate fijado al registrar el tiempo (hourly_rate_snapshot)
// o, si no hay snapshot, el rate base del usuario. Agrupado por caso para
// ver donde esta concentrado el dinero parado.

export type WipByCase = {
  caseId: string;
  caseCode: string;
  caseTitle: string;
  clientName: string | null;
  unbilledSeconds: number;
  unbilledValue: string; // decimal as string
  currency: string;
};

export async function unbilledWipReport(
  firmId: string,
  userId: string,
  limit = 20,
): Promise<{ rows: WipByCase[]; totalValue: string; totalSeconds: number }> {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        c.id AS case_id,
        c.code AS case_code,
        c.title AS case_title,
        cl.display_name AS client_name,
        COALESCE(SUM(t.duration_seconds), 0)::int AS unbilled_seconds,
        COALESCE(SUM(
          (t.duration_seconds / 3600.0) *
          COALESCE(t.hourly_rate_snapshot, u.hourly_rate, 0)
        ), 0)::numeric(14,2)::text AS unbilled_value
      FROM time_entries t
      JOIN cases c ON c.id = t.case_id AND c.deleted_at IS NULL
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.deleted_at IS NULL
        AND t.billable = true
        AND t.status <> 'invoiced'
      GROUP BY c.id, c.code, c.title, cl.display_name
      HAVING COALESCE(SUM(t.duration_seconds), 0) > 0
      ORDER BY unbilled_value DESC
      LIMIT ${limit}
    `);
    const rows = (result.rows as Array<{
      case_id: string;
      case_code: string;
      case_title: string;
      client_name: string | null;
      unbilled_seconds: number;
      unbilled_value: string;
    }>).map((r) => ({
      caseId: r.case_id,
      caseCode: r.case_code,
      caseTitle: r.case_title,
      clientName: r.client_name,
      unbilledSeconds: r.unbilled_seconds,
      unbilledValue: r.unbilled_value,
      currency: "DOP",
    }));

    // Total firm-wide (no limitado por LIMIT).
    const totalRes = await tx.execute(sql`
      SELECT
        COALESCE(SUM(t.duration_seconds), 0)::int AS total_seconds,
        COALESCE(SUM(
          (t.duration_seconds / 3600.0) *
          COALESCE(t.hourly_rate_snapshot, u.hourly_rate, 0)
        ), 0)::numeric(14,2)::text AS total_value
      FROM time_entries t
      JOIN cases c ON c.id = t.case_id AND c.deleted_at IS NULL
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.deleted_at IS NULL
        AND t.billable = true
        AND t.status <> 'invoiced'
    `);
    const total = totalRes.rows[0] as { total_seconds: number; total_value: string };

    return {
      rows,
      totalValue: total.total_value,
      totalSeconds: total.total_seconds,
    };
  });
}

// =============================================================================
// Casos estancados — abiertos sin actividad reciente.
// =============================================================================
// "Actividad" = la fecha mas reciente entre: updated_at del caso, y el ultimo
// audit_log del caso. Si esa fecha es anterior al umbral (default 30 dias),
// el caso aparece como estancado. Solo casos status='open'.

export type StalledCase = {
  caseId: string;
  caseCode: string;
  caseTitle: string;
  clientName: string | null;
  lastActivity: Date;
  daysSince: number;
};

export async function stalledCasesReport(
  firmId: string,
  userId: string,
  daysThreshold = 30,
  limit = 20,
): Promise<StalledCase[]> {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      WITH last_activity AS (
        SELECT
          c.id AS case_id,
          GREATEST(
            c.updated_at,
            COALESCE(MAX(a.created_at), c.created_at)
          ) AS last_at
        FROM cases c
        LEFT JOIN audit_log a ON a.case_id = c.id
        WHERE c.deleted_at IS NULL
          AND c.status = 'open'
        GROUP BY c.id, c.updated_at, c.created_at
      )
      SELECT
        c.id AS case_id,
        c.code AS case_code,
        c.title AS case_title,
        cl.display_name AS client_name,
        la.last_at AS last_activity,
        EXTRACT(DAY FROM (now() - la.last_at))::int AS days_since
      FROM last_activity la
      JOIN cases c ON c.id = la.case_id
      LEFT JOIN clients cl ON cl.id = c.client_id
      WHERE la.last_at < now() - (${daysThreshold} * INTERVAL '1 day')
      ORDER BY la.last_at ASC
      LIMIT ${limit}
    `);
    return (result.rows as Array<{
      case_id: string;
      case_code: string;
      case_title: string;
      client_name: string | null;
      last_activity: string;
      days_since: number;
    }>).map((r) => ({
      caseId: r.case_id,
      caseCode: r.case_code,
      caseTitle: r.case_title,
      clientName: r.client_name,
      lastActivity: new Date(r.last_activity),
      daysSince: r.days_since,
    }));
  });
}

// =============================================================================
// Top clientes por facturación (revenue).
// =============================================================================
// Suma de invoices.total (no void) por cliente en el rango. Muestra quien
// genera mas ingresos — para priorizar relaciones.

export type TopClient = {
  clientId: string;
  clientName: string;
  totalBilled: string;
  totalCollected: string;
  invoiceCount: number;
};

export async function topClientsByRevenueReport(
  firmId: string,
  userId: string,
  range: { from: Date; to: Date },
  limit = 5,
): Promise<TopClient[]> {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        cl.id AS client_id,
        cl.display_name AS client_name,
        COALESCE(SUM(i.total::numeric), 0)::numeric(14,2)::text AS total_billed,
        COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total::numeric ELSE 0 END), 0)::numeric(14,2)::text AS total_collected,
        COUNT(*)::int AS invoice_count
      FROM invoices i
      JOIN clients cl ON cl.id = i.client_id
      WHERE i.deleted_at IS NULL
        AND i.status <> 'void'
        AND i.issued_on >= ${range.from}
        AND i.issued_on < ${range.to}
      GROUP BY cl.id, cl.display_name
      ORDER BY total_billed DESC
      LIMIT ${limit}
    `);
    return (result.rows as Array<{
      client_id: string;
      client_name: string;
      total_billed: string;
      total_collected: string;
      invoice_count: number;
    }>).map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name,
      totalBilled: r.total_billed,
      totalCollected: r.total_collected,
      invoiceCount: r.invoice_count,
    }));
  });
}
