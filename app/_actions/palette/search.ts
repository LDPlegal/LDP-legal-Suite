"use server";

import { listClients } from "@/lib/db/queries/clients";
import { listCases } from "@/lib/db/queries/cases";
import { requireUser } from "@/lib/auth/session";

// Server-side palette search (BRIEF Trampa: don't load all clients/cases into
// the browser). Debounce on the client side; this action runs on every change
// and returns at most 8 of each entity. Per-firm/per-user; RLS guarantees
// visibility — no leakage even if a future bug skipped the helpers.

export async function searchPalette(query: string) {
  const user = await requireUser();
  const term = query.trim();

  const [clientesRes, casosRes] = await Promise.all([
    listClients(user.firmId, user.userId, { search: term, limit: 8 }),
    listCases(user.firmId, user.userId, { search: term, limit: 8 }),
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
  };
}
