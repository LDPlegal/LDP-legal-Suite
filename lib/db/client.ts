// Runtime database connection.
// Uses the `app_user` Postgres role (BYPASSRLS = false). Every query passing
// through this client is subject to RLS policies. Domain code MUST go through
// `withFirm(firmId, userId, ...)` (see `./with-firm.ts`) so that
// `app.firm_id` and `app.user_id` are set on the transaction. A query that
// reaches this client outside `withFirm` will raise an RLS-induced error
// rather than silently leak data, that is the intended behavior.
//
// For schema migrations and seeds (operations that must bypass RLS), use
// `./admin.ts` instead. Never import this file from a script that needs
// admin privileges, and never import `./admin.ts` from request-handling code.

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is required (runtime connection, uses app_user with BYPASSRLS = false).",
  );
}

const pool = new Pool({
  connectionString: url,
  // Reasonable defaults for a Next.js dev environment; tune for prod later.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema, casing: "snake_case" });
export { pool };
export type Db = typeof db;
