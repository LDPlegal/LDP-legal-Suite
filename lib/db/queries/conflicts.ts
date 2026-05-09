// lib/db/queries/conflicts.ts
//
// Conflict check (§ 9.6) — UI lands in Fase 4 but the underlying columns and
// indexes have been there since Fase 0:
//   - clients.tax_id  (clients_firm_tax_id_idx)
//   - cases.counterparty_tax_id  (cases_firm_counterparty_tax_idx)
//
// The contract is intentionally narrow: given a tax_id (string, normalized to
// digits-only) we return the existing relationships that could constitute a
// conflict of interest:
//   - "client"        → that party is already a client of the firm
//   - "counterparty"  → that party has appeared as a counterparty in a case
//
// Name-only matches are reported with lower confidence; we never block on
// them, only surface as a soft warning. Tax_id matches are the strong signal.

import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { caseAssignments, cases, clients, users } from "../schema";
import type { ConflictHit, ConflictReport } from "@/lib/conflictos/types";

// Re-export so existing imports keep working.
export type { ConflictHit, ConflictKind, ConflictReport } from "@/lib/conflictos/types";
export { CONFLICT_KIND_LABEL } from "@/lib/conflictos/types";

// Normalize a tax id to digits only so "130-12345-6", "13012345-6" and
// "13012345 6" all match. Returns "" for empty input — callers should treat
// empty as "no signal", not "match all".
export function normalizeTaxId(input: string | null | undefined): string {
  return (input ?? "").replace(/\D+/gu, "");
}

export type CheckConflictsInput = {
  // The party being checked. Provide what you have:
  //   - For a new client: pass the client's name + tax_id.
  //   - For a new case: pass the counterparty's name + tax_id.
  name?: string | null;
  taxId?: string | null;
  // When editing an existing record, pass its id so it doesn't match itself.
  excludeClientId?: string;
  excludeCaseId?: string;
};

export async function checkConflicts(
  firmId: string,
  userId: string,
  input: CheckConflictsInput,
): Promise<ConflictReport> {
  const taxIdDigits = normalizeTaxId(input.taxId);
  const name = (input.name ?? "").trim();

  if (!taxIdDigits && !name) {
    return { hits: [], blocking: false };
  }

  return withFirm(firmId, userId, async (tx) => {
    const hits: ConflictHit[] = [];

    // -------------------------------------------------------------------------
    // Strong signal: tax_id matches
    // -------------------------------------------------------------------------
    if (taxIdDigits) {
      // Match against clients.tax_id — uses clients_firm_tax_id_idx.
      const clientRows = await tx
        .select({
          id: clients.id,
          displayName: clients.displayName,
          legalName: clients.legalName,
          taxId: clients.taxId,
          taxIdType: clients.taxIdType,
          status: clients.status,
        })
        .from(clients)
        .where(
          and(
            isNull(clients.deletedAt),
            // Compare digits-only: regexp_replace strips non-digits then equality.
            sql`regexp_replace(coalesce(${clients.taxId}, ''), '\\D', '', 'g') = ${taxIdDigits}`,
            input.excludeClientId
              ? sql`${clients.id} <> ${input.excludeClientId}`
              : sql`true`,
          ),
        );
      for (const c of clientRows) {
        hits.push({
          kind: "client_taxid",
          refId: c.id,
          refType: "client",
          label: c.displayName + (c.taxId ? ` (${c.taxIdType?.toUpperCase()} ${c.taxId})` : ""),
          detail: `Cliente ${c.status === "active" ? "activo" : c.status} del firm`,
        });
      }

      // Match against cases.counterparty_tax_id — uses cases_firm_counterparty_tax_idx.
      const caseRows = await tx
        .select({
          id: cases.id,
          code: cases.code,
          title: cases.title,
          status: cases.status,
          counterpartyName: cases.counterpartyName,
          counterpartyTaxId: cases.counterpartyTaxId,
        })
        .from(cases)
        .where(
          and(
            isNull(cases.deletedAt),
            sql`regexp_replace(coalesce(${cases.counterpartyTaxId}, ''), '\\D', '', 'g') = ${taxIdDigits}`,
            input.excludeCaseId ? sql`${cases.id} <> ${input.excludeCaseId}` : sql`true`,
          ),
        );

      // Lookup lawyers who worked on each matched case so we can surface
      // personal-conflict warnings ("Dr. X trabajó este caso").
      const caseIds = caseRows.map((c) => c.id);
      const lawyerByCase = new Map<string, Array<{ id: string; name: string }>>();
      if (caseIds.length > 0) {
        const assignmentRows = await tx
          .select({
            caseId: caseAssignments.caseId,
            userId: caseAssignments.userId,
            userName: users.name,
          })
          .from(caseAssignments)
          .innerJoin(users, eq(users.id, caseAssignments.userId))
          .where(inArray(caseAssignments.caseId, caseIds));
        for (const a of assignmentRows) {
          const list = lawyerByCase.get(a.caseId) ?? [];
          list.push({ id: a.userId, name: a.userName });
          lawyerByCase.set(a.caseId, list);
        }
      }
      for (const c of caseRows) {
        hits.push({
          kind: "counterparty_taxid",
          refId: c.id,
          refType: "case",
          label: `${c.code} — ${c.title}`,
          detail: `Contraparte: ${c.counterpartyName ?? "(sin nombre)"} · estado ${c.status}`,
          involvedLawyers: lawyerByCase.get(c.id) ?? [],
        });
      }
    }

    // -------------------------------------------------------------------------
    // Soft signal: name fuzzy matches (only when no strong hit was found, to
    // avoid duplicating warnings; legal_name and counterparty_name use ILIKE).
    // -------------------------------------------------------------------------
    if (name && hits.length === 0) {
      const term = `%${name}%`;
      const clientNameRows = await tx
        .select({
          id: clients.id,
          displayName: clients.displayName,
          legalName: clients.legalName,
          status: clients.status,
        })
        .from(clients)
        .where(
          and(
            isNull(clients.deletedAt),
            or(ilike(clients.displayName, term), ilike(clients.legalName, term)),
            input.excludeClientId
              ? sql`${clients.id} <> ${input.excludeClientId}`
              : sql`true`,
          ),
        )
        .limit(5);
      for (const c of clientNameRows) {
        hits.push({
          kind: "client_name",
          refId: c.id,
          refType: "client",
          label: c.displayName,
          detail: `Cliente ${c.status === "active" ? "activo" : c.status} (coincidencia por nombre)`,
        });
      }

      const caseNameRows = await tx
        .select({
          id: cases.id,
          code: cases.code,
          title: cases.title,
          status: cases.status,
          counterpartyName: cases.counterpartyName,
        })
        .from(cases)
        .where(
          and(
            isNull(cases.deletedAt),
            ilike(cases.counterpartyName, term),
            input.excludeCaseId ? sql`${cases.id} <> ${input.excludeCaseId}` : sql`true`,
          ),
        )
        .limit(5);
      for (const c of caseNameRows) {
        hits.push({
          kind: "counterparty_name",
          refId: c.id,
          refType: "case",
          label: `${c.code} — ${c.title}`,
          detail: `Contraparte: ${c.counterpartyName} (coincidencia por nombre)`,
        });
      }
    }

    const blocking = hits.some((h) => h.kind === "client_taxid" || h.kind === "counterparty_taxid");
    return { hits, blocking };
  });
}

// listAllConflicts: enumerate every party that appears both as a client (by
// tax_id) and as a case counterparty (by tax_id) within the firm. Powers the
// /conflictos overview page so partners can audit existing conflicts at a
// glance, not just at creation time.
export type ConflictPair = {
  taxId: string;
  taxIdNormalized: string;
  client: { id: string; name: string; status: string };
  cases: Array<{ id: string; code: string; title: string; status: string; counterpartyName: string | null }>;
};

export async function listAllConflicts(firmId: string, userId: string): Promise<ConflictPair[]> {
  return withFirm(firmId, userId, async (tx) => {
    // Find tax_ids that appear in both clients and cases.counterparty_tax_id.
    // Uses the digits-only normalization so format differences (dashes, spaces)
    // don't hide matches.
    const result = await tx.execute(sql`
      WITH client_tax AS (
        SELECT
          id,
          display_name AS name,
          status::text AS status,
          tax_id AS raw_tax_id,
          regexp_replace(coalesce(tax_id, ''), '\\D', '', 'g') AS norm_tax_id
        FROM clients
        WHERE deleted_at IS NULL AND tax_id IS NOT NULL AND tax_id <> ''
      ),
      case_tax AS (
        SELECT
          id,
          code,
          title,
          status::text AS status,
          counterparty_name,
          counterparty_tax_id AS raw_tax_id,
          regexp_replace(coalesce(counterparty_tax_id, ''), '\\D', '', 'g') AS norm_tax_id
        FROM cases
        WHERE deleted_at IS NULL
          AND counterparty_tax_id IS NOT NULL
          AND counterparty_tax_id <> ''
      )
      SELECT
        c.norm_tax_id AS norm_tax_id,
        c.raw_tax_id AS raw_tax_id,
        c.id AS client_id,
        c.name AS client_name,
        c.status AS client_status,
        cs.id AS case_id,
        cs.code AS case_code,
        cs.title AS case_title,
        cs.status AS case_status,
        cs.counterparty_name AS counterparty_name
      FROM client_tax c
      INNER JOIN case_tax cs ON cs.norm_tax_id = c.norm_tax_id
      WHERE c.norm_tax_id <> ''
      ORDER BY c.name ASC, cs.code ASC
    `);

    const map = new Map<string, ConflictPair>();
    for (const row of result.rows as Array<{
      norm_tax_id: string;
      raw_tax_id: string;
      client_id: string;
      client_name: string;
      client_status: string;
      case_id: string;
      case_code: string;
      case_title: string;
      case_status: string;
      counterparty_name: string | null;
    }>) {
      const key = row.norm_tax_id;
      const existing = map.get(key);
      if (existing) {
        existing.cases.push({
          id: row.case_id,
          code: row.case_code,
          title: row.case_title,
          status: row.case_status,
          counterpartyName: row.counterparty_name,
        });
      } else {
        map.set(key, {
          taxId: row.raw_tax_id,
          taxIdNormalized: row.norm_tax_id,
          client: { id: row.client_id, name: row.client_name, status: row.client_status },
          cases: [
            {
              id: row.case_id,
              code: row.case_code,
              title: row.case_title,
              status: row.case_status,
              counterpartyName: row.counterparty_name,
            },
          ],
        });
      }
    }
    return Array.from(map.values());
  });
}

