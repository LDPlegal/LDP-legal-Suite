CREATE TYPE "public"."expense_status" AS ENUM('draft', 'approved', 'invoiced');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'med', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'waiting', 'done');--> statement-breakpoint
CREATE TYPE "public"."time_entry_status" AS ENUM('draft', 'approved', 'invoiced');--> statement-breakpoint
CREATE TABLE "active_timers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"description" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"case_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"attendees" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"reminder_minutes" integer,
	"ical_uid" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'DOP' NOT NULL,
	"incurred_on" timestamp with time zone NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"receipt_url" text,
	"status" "expense_status" DEFAULT 'draft' NOT NULL,
	"invoice_id" uuid,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"case_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"due_at" timestamp with time zone,
	"priority" "task_priority" DEFAULT 'med' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"hourly_rate_snapshot" numeric(12, 2),
	"status" time_entry_status DEFAULT 'draft' NOT NULL,
	"invoice_id" uuid,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "active_timers_firm_idx" ON "active_timers" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "active_timers_case_idx" ON "active_timers" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "events_firm_idx" ON "events" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "events_firm_case_idx" ON "events" USING btree ("firm_id","case_id");--> statement-breakpoint
CREATE INDEX "events_firm_start_idx" ON "events" USING btree ("firm_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_ical_uid_unique" ON "events" USING btree ("ical_uid");--> statement-breakpoint
CREATE INDEX "expenses_firm_idx" ON "expenses" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "expenses_firm_case_idx" ON "expenses" USING btree ("firm_id","case_id");--> statement-breakpoint
CREATE INDEX "expenses_firm_user_idx" ON "expenses" USING btree ("firm_id","user_id");--> statement-breakpoint
CREATE INDEX "expenses_firm_status_idx" ON "expenses" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "expenses_incurred_idx" ON "expenses" USING btree ("firm_id","incurred_on");--> statement-breakpoint
CREATE INDEX "tasks_firm_idx" ON "tasks" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "tasks_firm_case_idx" ON "tasks" USING btree ("firm_id","case_id");--> statement-breakpoint
CREATE INDEX "tasks_firm_assignee_idx" ON "tasks" USING btree ("firm_id","assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_firm_status_idx" ON "tasks" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "tasks_firm_due_idx" ON "tasks" USING btree ("firm_id","due_at");--> statement-breakpoint
CREATE INDEX "time_entries_firm_idx" ON "time_entries" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "time_entries_firm_case_idx" ON "time_entries" USING btree ("firm_id","case_id");--> statement-breakpoint
CREATE INDEX "time_entries_firm_user_idx" ON "time_entries" USING btree ("firm_id","user_id");--> statement-breakpoint
CREATE INDEX "time_entries_firm_status_idx" ON "time_entries" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "time_entries_started_idx" ON "time_entries" USING btree ("firm_id","started_at");--> statement-breakpoint

-- =============================================================================
-- RLS for Fase 1 tables (BRIEF style — same migration as the table DDL)
-- =============================================================================
-- Pattern: every firm-scoped table has firm_isolation. Tables that hang off a
-- case (time_entries, expenses) or that may hang off a case (tasks, events
-- with case_id NULL meaning firm-wide) inherit the case's visibility — if
-- the case is `restricted` and the session user isn't assigned, they don't
-- see its time/expenses/tasks/events either.
--
-- Cross-table joins go through a SECURITY DEFINER function to avoid the
-- recursive policy detection error we hit in 0001.
-- =============================================================================

ALTER TABLE "active_timers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "time_entries"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events"        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses"      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Helper: can the current user see the given case?
-- Combines firm match + visibility logic (firm | restricted via assignment | admin override).
-- SECURITY DEFINER bypasses RLS inside the function body so we don't recurse
-- into the cases policy (which itself evaluates this kind of expression).
CREATE OR REPLACE FUNCTION app_user_can_see_case(p_case_id uuid, p_user_id uuid, p_firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM cases c
    WHERE c.id = p_case_id
      AND c.firm_id = p_firm_id
      AND c.deleted_at IS NULL
      AND (
        c.visibility = 'firm'
        OR EXISTS (
          SELECT 1 FROM case_assignments ca
          WHERE ca.case_id = c.id AND ca.user_id = p_user_id
        )
        OR EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = p_user_id AND u.firm_id = p_firm_id AND u.role = 'admin' AND u.deleted_at IS NULL
        )
      )
  )
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_user_can_see_case(uuid, uuid, uuid) TO PUBLIC;--> statement-breakpoint

-- ----- active_timers: personal — only the owner sees their timer ------------
-- Other users (even admins) don't see your active timer. If reporting needs
-- it later, that goes through SECURITY DEFINER from a privileged role.
CREATE POLICY "active_timers_self" ON "active_timers"
  USING (
    user_id = current_setting('app.user_id', true)::uuid
    AND firm_id = current_setting('app.firm_id', true)::uuid
  )
  WITH CHECK (
    user_id = current_setting('app.user_id', true)::uuid
    AND firm_id = current_setting('app.firm_id', true)::uuid
  );
--> statement-breakpoint

-- ----- time_entries: firm match + can-see-case ------------------------------
CREATE POLICY "time_entries_firm_case_visibility" ON "time_entries"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND app_user_can_see_case(
      case_id,
      current_setting('app.user_id', true)::uuid,
      firm_id
    )
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND app_user_can_see_case(
      case_id,
      current_setting('app.user_id', true)::uuid,
      firm_id
    )
  );
--> statement-breakpoint

-- ----- tasks: firm match + (case-less OR can-see-case) ----------------------
CREATE POLICY "tasks_firm_case_visibility" ON "tasks"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(
           case_id,
           current_setting('app.user_id', true)::uuid,
           firm_id
         )
    )
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(
           case_id,
           current_setting('app.user_id', true)::uuid,
           firm_id
         )
    )
  );
--> statement-breakpoint

-- ----- events: same pattern as tasks ----------------------------------------
CREATE POLICY "events_firm_case_visibility" ON "events"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(
           case_id,
           current_setting('app.user_id', true)::uuid,
           firm_id
         )
    )
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(
           case_id,
           current_setting('app.user_id', true)::uuid,
           firm_id
         )
    )
  );
--> statement-breakpoint

-- ----- expenses: case is always required, so the can-see-case check applies -
CREATE POLICY "expenses_firm_case_visibility" ON "expenses"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND app_user_can_see_case(
      case_id,
      current_setting('app.user_id', true)::uuid,
      firm_id
    )
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND app_user_can_see_case(
      case_id,
      current_setting('app.user_id', true)::uuid,
      firm_id
    )
  );
