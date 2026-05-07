CREATE TYPE "public"."billing_mode" AS ENUM('hourly', 'flat_fee', 'retainer', 'contingency');--> statement-breakpoint
CREATE TYPE "public"."case_assignment_role" AS ENUM('lead', 'associate', 'paralegal');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('open', 'on_hold', 'closed');--> statement-breakpoint
CREATE TYPE "public"."case_visibility" AS ENUM('firm', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'prospect', 'closed');--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('individual', 'corporate');--> statement-breakpoint
CREATE TYPE "public"."matter_type" AS ENUM('civil', 'corporate', 'real_estate', 'criminal', 'labor', 'tax', 'administrative', 'other');--> statement-breakpoint
CREATE TYPE "public"."tax_id_type" AS ENUM('rnc', 'cedula', 'passport', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'partner', 'lawyer', 'paralegal', 'client');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'suspended');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_in_case" "case_assignment_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_counters" (
	"firm_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"matter_type" "matter_type" NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"client_id" uuid NOT NULL,
	"matter_type" "matter_type" NOT NULL,
	"description" text,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"lead_lawyer_id" uuid,
	"billing_mode" "billing_mode" DEFAULT 'hourly' NOT NULL,
	"flat_fee_amount" numeric(14, 2),
	"retainer_balance" numeric(14, 2),
	"court" text,
	"counterparty_name" text,
	"counterparty_tax_id" text,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"visibility" "case_visibility" DEFAULT 'firm' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"type" "client_type" NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text,
	"tax_id_type" "tax_id_type",
	"tax_id" text,
	"primary_contact_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"billing_address" text,
	"notes" jsonb,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rnc" text,
	"address" text,
	"logo_url" text,
	"timezone" text DEFAULT 'America/Santo_Domingo' NOT NULL,
	"default_currency" text DEFAULT 'DOP' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'lawyer' NOT NULL,
	"hourly_rate" numeric(12, 2),
	"image" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_counters" ADD CONSTRAINT "case_counters_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_lead_lawyer_id_users_id_fk" FOREIGN KEY ("lead_lawyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_assignments_case_user_unique" ON "case_assignments" USING btree ("case_id","user_id");--> statement-breakpoint
CREATE INDEX "case_assignments_user_idx" ON "case_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_counters_pk" ON "case_counters" USING btree ("firm_id","year","matter_type");--> statement-breakpoint
CREATE INDEX "cases_firm_id_idx" ON "cases" USING btree ("firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_firm_code_unique" ON "cases" USING btree ("firm_id","code") WHERE "cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cases_firm_client_idx" ON "cases" USING btree ("firm_id","client_id");--> statement-breakpoint
CREATE INDEX "cases_firm_status_idx" ON "cases" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "cases_firm_lead_idx" ON "cases" USING btree ("firm_id","lead_lawyer_id");--> statement-breakpoint
CREATE INDEX "cases_firm_counterparty_tax_idx" ON "cases" USING btree ("firm_id","counterparty_tax_id");--> statement-breakpoint
CREATE INDEX "clients_firm_id_idx" ON "clients" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "clients_firm_status_idx" ON "clients" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "clients_firm_tax_id_idx" ON "clients" USING btree ("firm_id","tax_id");--> statement-breakpoint
CREATE UNIQUE INDEX "firms_rnc_unique" ON "firms" USING btree ("rnc") WHERE "firms"."rnc" IS NOT NULL AND "firms"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_firm_id_idx" ON "users" USING btree ("firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_firm_email_unique" ON "users" USING btree ("firm_id","email") WHERE "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint

-- =============================================================================
-- Row Level Security (BRIEF Paso 4 / maestro § 9.1, § 9.2)
-- =============================================================================
-- RLS goes in the SAME initial migration as table creation, on purpose: a
-- window in which tables exist without RLS is exactly when seeds get inserted
-- and isolation tests get confused later. Defense in depth pairs with the
-- application-level helper withFirm() (lib/db/with-firm.ts).
--
-- Every firm-scoped policy reads `app.firm_id` and `app.user_id` via
-- current_setting(name, TRUE) — the second TRUE returns NULL when the
-- setting is missing (instead of erroring inside current_setting). The
-- subsequent ::uuid cast on NULL still raises a runtime error, so a query
-- that ran outside withFirm() FAILS LOUDLY rather than silently leaking
-- another firm's data. That is the desired behavior; do not "fix" it by
-- adding NULL coalescing (Trampa #2 in the BRIEF).
--
-- Both USING (read filter) and WITH CHECK (write filter) are required.
-- Without WITH CHECK, an INSERT with a foreign firm_id would still pass
-- (Trampa #3). The pattern below repeats both for every domain table.
-- =============================================================================

ALTER TABLE "firms"             ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users"             ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cases"             ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "case_assignments"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "case_counters"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verifications"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----- firms: a session can read/write only its own firm row ---------------
CREATE POLICY "firms_self" ON "firms"
  USING      (id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ----- users: scoped by firm_id --------------------------------------------
CREATE POLICY "users_firm_isolation" ON "users"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ----- clients: scoped by firm_id ------------------------------------------
CREATE POLICY "clients_firm_isolation" ON "clients"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ----- cases: firm_isolation + visibility (§ 9.2) --------------------------
-- Visibility rule: a case is readable iff
--   (a) it belongs to the active firm, AND
--   (b) one of:
--        - visibility = 'firm', OR
--        - the session user is in case_assignments for this case, OR
--        - the session user is admin of this firm.
-- WITH CHECK only enforces firm match for INSERT/UPDATE; case-level
-- restriction is set when populating case_assignments.
-- Trampa #4: this policy can become slow with many cases + assignments;
-- documented in DECISIONS.md to revisit at scale (not premature-optimized
-- with functional indexes for Fase 0).
CREATE POLICY "cases_firm_visibility" ON "cases"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      visibility = 'firm'
      OR EXISTS (
        SELECT 1 FROM case_assignments ca
        WHERE ca.case_id = cases.id
          AND ca.user_id = current_setting('app.user_id', true)::uuid
      )
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = current_setting('app.user_id', true)::uuid
          AND u.firm_id = cases.firm_id
          AND u.role = 'admin'
      )
    )
  )
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ----- case_assignments: scoped via cases.firm_id --------------------------
CREATE POLICY "case_assignments_firm_isolation" ON "case_assignments"
  USING (
    EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = case_assignments.case_id
        AND c.firm_id = current_setting('app.firm_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = case_assignments.case_id
        AND c.firm_id = current_setting('app.firm_id', true)::uuid
    )
  );
--> statement-breakpoint

-- ----- case_counters: scoped by firm_id ------------------------------------
CREATE POLICY "case_counters_firm_isolation" ON "case_counters"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ----- sessions: scoped via users.firm_id (defense in depth) ---------------
-- In normal operation better-auth uses the admin connection (BYPASSRLS=true),
-- so this policy is never triggered for legitimate auth traffic. It exists
-- to prevent the runtime app_user from accidentally reading or writing
-- session rows from a different firm if domain code ever touches this table.
CREATE POLICY "sessions_firm_isolation" ON "sessions"
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = sessions.user_id
        AND u.firm_id = current_setting('app.firm_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = sessions.user_id
        AND u.firm_id = current_setting('app.firm_id', true)::uuid
    )
  );
--> statement-breakpoint

-- ----- accounts: scoped via users.firm_id (defense in depth) ---------------
CREATE POLICY "accounts_firm_isolation" ON "accounts"
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = accounts.user_id
        AND u.firm_id = current_setting('app.firm_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = accounts.user_id
        AND u.firm_id = current_setting('app.firm_id', true)::uuid
    )
  );
--> statement-breakpoint

-- ----- verifications: deny-all to runtime app_user -------------------------
-- Better-auth uses the admin connection (BYPASSRLS) for verification tokens,
-- which has no firm context (used during email verification, password reset).
-- Domain code must NEVER touch this table; the deny-all policy enforces that.
CREATE POLICY "verifications_deny_runtime" ON "verifications"
  USING (false)
  WITH CHECK (false);
