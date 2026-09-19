"use server";

import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { listClients } from "@/lib/db/queries/clients";
import { listCases } from "@/lib/db/queries/cases";
import { requireUser } from "@/lib/auth/session";
import { withFirm } from "@/lib/db/with-firm";
import { cases, documents, invoices, notes } from "@/lib/db/schema";

// Server-side palette search (BRIEF Trampa: don't load all clients/cases into
// the browser). Debounce on the client side; this action runs on every change
// and returns at most 8 of each entity. Per-firm/per-user; RLS guarantees
// visibility, no leakage even if a future bug skipped the helpers.

export type PaletteResult = {
  clientes: Array<{ id: string; displayName: string; status: string }>;
  casos: Array<{ id: string; code: string; title: string; status: string }>;
  documentos: Array<{
    id: string;
    name: string;
    caseId: string | null;
    caseCode: string | null;
  }>;
  facturas: Array<{
    id: string;
    number: string;
    ncf: string | null;
    status: string;
  }>;
  notas: Array<{
    id: string;
    title: string | null;
    caseId: string;
    caseCode: string;
  }>;
};

export async function searchPalette(query: string): Promise<PaletteResult> {
  const user = await requireUser();
  const term = query.trim();

  if (!term) {
    return { clientes: [], casos: [], documentos: [], facturas: [], notas: [] };
  }

  const like = `%${term}%`;

  const [clientesRes, casosRes, docs, invs, ntsRows] = await Promise.all([
    listClients(user.firmId, user.userId, { search: term, limit: 6 }),
    listCases(user.firmId, user.userId, { search: term, limit: 6 }),
    withFirm(user.firmId, user.userId, async (tx) =>
      tx
        .select({
          id: documents.id,
          name: documents.name,
          caseId: documents.caseId,
          caseCode: cases.code,
        })
        .from(documents)
        .leftJoin(cases, eq(cases.id, documents.caseId))
        .where(
          and(
            isNull(documents.deletedAt),
            // Visibilidad interna (Fase 13): no filtrar privados de otros.
            or(
              eq(documents.visibility, "case"),
              eq(documents.uploadedBy, user.userId),
            ),
            or(
              ilike(documents.name, like),
              sql`array_to_string(${documents.tags}, ',') ILIKE ${like}`,
            ),
          ),
        )
        .limit(6),
    ),
    withFirm(user.firmId, user.userId, async (tx) =>
      tx
        .select({
          id: invoices.id,
          number: invoices.number,
          ncf: invoices.ncf,
          status: invoices.status,
        })
        .from(invoices)
        .where(
          and(
            isNull(invoices.deletedAt),
            or(
              ilike(invoices.number, like),
              ilike(invoices.ncf, like),
            ),
          ),
        )
        .limit(6),
    ),
    withFirm(user.firmId, user.userId, async (tx) =>
      tx
        .select({
          id: notes.id,
          title: notes.title,
          caseId: notes.caseId,
          caseCode: cases.code,
        })
        .from(notes)
        .innerJoin(cases, eq(cases.id, notes.caseId))
        .where(
          and(isNull(notes.deletedAt), ilike(notes.title, like)),
        )
        .limit(6),
    ),
  ]);

  return {
    clientes: clientesRes.rows.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      status: c.status,
    })),
    casos: casosRes.rows.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      status: c.status,
    })),
    documentos: docs,
    facturas: invs,
    notas: ntsRows.map((n) => ({
      id: n.id,
      title: n.title,
      caseId: n.caseId,
      caseCode: n.caseCode ?? "",
    })),
  };
}
