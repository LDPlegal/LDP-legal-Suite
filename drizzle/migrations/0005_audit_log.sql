CREATE TYPE "public"."audit_action" AS ENUM('created', 'updated', 'deleted', 'approved', 'sent', 'paid', 'voided', 'uploaded', 'timer_started', 'timer_stopped', 'ncf_assigned');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"summary" text,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_firm_idx" ON "audit_log" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "audit_firm_entity_idx" ON "audit_log" USING btree ("firm_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_firm_user_idx" ON "audit_log" USING btree ("firm_id","user_id");--> statement-breakpoint
CREATE INDEX "audit_firm_created_idx" ON "audit_log" USING btree ("firm_id","created_at");--> statement-breakpoint

-- =============================================================================
-- RLS for audit_log
-- =============================================================================
-- Simple firm isolation. Audit entries are append-only from server actions
-- via the admin connection, but we still ENABLE RLS so any accidental read
-- via the runtime app_user is properly scoped.
-- =============================================================================

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "audit_log_firm_isolation" ON "audit_log"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
