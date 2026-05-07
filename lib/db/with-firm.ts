// withFirm(firmId, userId, fn) — the only sanctioned way to run domain queries.
//
// Wraps `fn` in a transaction and sets `app.firm_id` + `app.user_id` as
// LOCAL settings (scoped to the transaction). Postgres RLS policies on every
// firm-scoped table read those settings via `current_setting('app.firm_id', true)`.
//
// Two consequences worth knowing (Trampa #5 of the BRIEF):
//   1. The callback receives `tx` (the transaction handle). Every query in
//      the callback MUST use `tx` — using the outer `db` runs OUTSIDE the
//      transaction, the SET LOCAL settings won't apply, and RLS will fail
//      the query (loudly — by design).
//   2. SET LOCAL ends with the transaction. Two sequential `withFirm` calls
//      are independent: settings from the first do not leak into the second.
//
// Use Case (§ 9.2) authorization is partly enforced here (via the policy on
// `cases` that joins case_assignments) and partly in domain code (filtering
// "restricted" cases when listing). RLS is the floor; app code can be more
// restrictive but never less.

import { sql } from "drizzle-orm";
import { db, type Db } from "./client";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function withFirm<T>(
  firmId: string,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!firmId) throw new Error("withFirm: firmId is required");
  if (!userId) throw new Error("withFirm: userId is required");

  return await db.transaction(async (tx) => {
    // set_config(name, value, is_local=true) is equivalent to SET LOCAL but
    // accepts parameterized values, which avoids SQL injection on identifier-
    // shaped strings. The `true` third argument scopes the setting to this
    // transaction.
    await tx.execute(sql`SELECT set_config('app.firm_id', ${firmId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return await fn(tx);
  });
}
