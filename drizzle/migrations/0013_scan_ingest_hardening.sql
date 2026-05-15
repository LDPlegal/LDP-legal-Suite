-- Scan-ingest hardening: rate limit storage + idempotency key + functional
-- index on lower(email) for case-insensitive lookups.

-- Idempotency key for the scan worker. Unique per (firm_id, scan_id) when
-- non-null. Lets the worker retry POST /api/scan-ingest safely.
ALTER TABLE "documents" ADD COLUMN "scan_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_firm_scan_id_unique"
  ON "documents" USING btree ("firm_id", "scan_id")
  WHERE "scan_id" IS NOT NULL;
--> statement-breakpoint

-- Functional index for case-insensitive email lookups used by scan-ingest
-- (worker passes whatever case the user typed in their device).
CREATE INDEX "users_email_lower_idx"
  ON "users" USING btree (LOWER("email"));
--> statement-breakpoint

-- Generic single-row-per-key rate limit table. Used by lib/rate-limit.ts.
-- Not multi-tenant (no firm_id) because we rate-limit IPs from external
-- workers and signup attempts that don't have a firm yet.
CREATE TABLE "rate_limits" (
  "key" text PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 0,
  "window_start" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- No RLS on rate_limits: it's a global counter table, only touched by the
-- admin connection from lib/rate-limit.ts. Privileges on app_user kept
-- minimal — by default the migrate script grants SELECT/INSERT/UPDATE/DELETE
-- via DEFAULT PRIVILEGES, which is acceptable here (no sensitive data).
