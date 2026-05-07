// Admin database connection.
// Uses the schema owner / superuser via DATABASE_MIGRATE_URL. This connection
// BYPASSES Row Level Security and must NEVER be imported from request-handling
// code (server actions, route handlers, server components, layouts, pages).
//
// Allowed callers:
//   - scripts/migrate.ts and scripts/seed.ts
//   - lib/auth/server.ts (better-auth needs to read/write users/sessions/
//     accounts/verifications without a firm_id context)
//   - lib/auth/signup.ts (the bootstrap moment: creating the first firm + its
//     admin user, where `withFirm` cannot apply because the firm does not
//     exist yet — see § 9.1 of the maestro and Trampa #6 of the BRIEF).
//
// Documented in DECISIONS.md.

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_MIGRATE_URL;
if (!url) {
  throw new Error(
    "DATABASE_MIGRATE_URL is required (admin connection — owner/superuser, BYPASSES RLS).",
  );
}

const pool = new Pool({
  connectionString: url,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const adminDb = drizzle(pool, { schema, casing: "snake_case" });
export { pool as adminPool };
export type AdminDb = typeof adminDb;
