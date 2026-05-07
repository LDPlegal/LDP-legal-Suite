// scripts/migrate.ts
//
// Idempotent bootstrap + migration for the LDP Legal Suite database.
// Runs as `pnpm db:migrate`. Steps:
//
//   1. Connect to the `postgres` admin DB. CREATE DATABASE if missing.
//   2. Connect to the target DB. CREATE ROLE app_user (NOBYPASSRLS) if
//      missing; sync its password to whatever `.env` says.
//   3. Verify rolbypassrls = false (BRIEF Trampa #1 — refuses to continue
//      otherwise). RLS is meaningless if the runtime role bypasses it.
//   4. Run drizzle migrations (drizzle/migrations/*.sql) using the admin
//      connection. The first migration creates schema + RLS in one go.
//   5. GRANT object privileges to app_user on the public schema and set
//      DEFAULT PRIVILEGES so future objects also flow to app_user.
//
// Re-running this script after an initial setup is safe: each step is
// guarded by an existence check.

import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: ".env" });

const ADMIN_URL = process.env.DATABASE_MIGRATE_URL;
const RUNTIME_URL = process.env.DATABASE_URL;

if (!ADMIN_URL) throw new Error("DATABASE_MIGRATE_URL is required in .env");
if (!RUNTIME_URL) throw new Error("DATABASE_URL is required in .env");

const runtime = new URL(RUNTIME_URL);
const APP_USER = decodeURIComponent(runtime.username);
const APP_PASS = decodeURIComponent(runtime.password);
const DB_NAME = runtime.pathname.slice(1);

if (!APP_USER || !APP_PASS) {
  throw new Error("DATABASE_URL must include user and password (postgres://user:pass@host/db)");
}
if (!DB_NAME) {
  throw new Error("DATABASE_URL must include a database name");
}
if (APP_USER === "postgres") {
  throw new Error(
    "Refusing to use 'postgres' as the runtime user — runtime must be a dedicated low-privilege role with NOBYPASSRLS.",
  );
}

const adminParsed = new URL(ADMIN_URL);
if (adminParsed.pathname.slice(1) !== DB_NAME) {
  console.warn(
    `[migrate] WARNING: DATABASE_URL db (${DB_NAME}) and DATABASE_MIGRATE_URL db (${adminParsed.pathname.slice(1)}) differ — using ${DB_NAME}.`,
  );
}

function quoteIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function quoteLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function ensureDatabase(): Promise<void> {
  const tmp = new URL(ADMIN_URL!);
  tmp.pathname = "/postgres";
  const pool = new Pool({ connectionString: tmp.toString() });
  try {
    const res = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
    if (res.rowCount === 0) {
      console.log(`[migrate] Creating database ${quoteIdent(DB_NAME)}...`);
      await pool.query(`CREATE DATABASE ${quoteIdent(DB_NAME)}`);
    } else {
      console.log(`[migrate] Database ${quoteIdent(DB_NAME)} already exists.`);
    }
  } finally {
    await pool.end();
  }
}

async function ensureRoleAndVerifyNoBypass(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_URL });
  try {
    const exists = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_USER]);
    if (exists.rowCount === 0) {
      console.log(`[migrate] Creating role ${quoteIdent(APP_USER)} (LOGIN, NOBYPASSRLS)...`);
      await pool.query(
        `CREATE ROLE ${quoteIdent(APP_USER)} LOGIN PASSWORD ${quoteLiteral(APP_PASS)} NOBYPASSRLS`,
      );
    } else {
      console.log(`[migrate] Role ${quoteIdent(APP_USER)} exists; ensuring password and NOBYPASSRLS.`);
      await pool.query(
        `ALTER ROLE ${quoteIdent(APP_USER)} LOGIN PASSWORD ${quoteLiteral(APP_PASS)} NOBYPASSRLS`,
      );
    }

    const verify = await pool.query<{ rolbypassrls: boolean }>(
      "SELECT rolbypassrls FROM pg_roles WHERE rolname = $1",
      [APP_USER],
    );
    const row = verify.rows[0];
    if (!row) {
      throw new Error(`[migrate] SAFETY: role ${APP_USER} not found after creation`);
    }
    if (row.rolbypassrls) {
      throw new Error(
        `[migrate] SAFETY: role ${APP_USER} has BYPASSRLS=true. RLS would be silently bypassed at runtime. Refusing to continue (BRIEF Trampa #1).`,
      );
    }
    console.log(`[migrate] Verified ${quoteIdent(APP_USER)}.rolbypassrls = false ✓`);
  } finally {
    await pool.end();
  }
}

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_URL });
  try {
    const db = drizzle(pool);
    console.log("[migrate] Applying drizzle migrations...");
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    console.log("[migrate] Migrations applied.");
  } finally {
    await pool.end();
  }
}

async function grantPrivileges(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_URL });
  try {
    console.log(`[migrate] Granting privileges to ${quoteIdent(APP_USER)}...`);
    const stmts = [
      `GRANT CONNECT ON DATABASE ${quoteIdent(DB_NAME)} TO ${quoteIdent(APP_USER)}`,
      `GRANT USAGE ON SCHEMA public TO ${quoteIdent(APP_USER)}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdent(APP_USER)}`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdent(APP_USER)}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoteIdent(APP_USER)}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${quoteIdent(APP_USER)}`,
    ];
    for (const stmt of stmts) {
      await pool.query(stmt);
    }
    console.log("[migrate] Privileges granted.");
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  console.log("[migrate] Starting bootstrap + migration.");
  await ensureDatabase();
  await ensureRoleAndVerifyNoBypass();
  await runMigrations();
  await grantPrivileges();
  console.log("[migrate] Done. App is ready.");
}

main().catch((err: unknown) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
