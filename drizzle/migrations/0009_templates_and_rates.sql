-- =============================================================================
-- Fase 6 — plantillas de matter + tarifas con override
-- =============================================================================

CREATE TABLE "matter_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "name" text NOT NULL,
  "matter_type" matter_type NOT NULL,
  "description" text,
  "default_tasks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "default_events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "matter_templates"
  ADD CONSTRAINT "matter_tpl_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "matter_tpl_firm_idx" ON "matter_templates" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "matter_tpl_firm_type_idx" ON "matter_templates" USING btree ("firm_id", "matter_type");
--> statement-breakpoint

ALTER TABLE "matter_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "matter_tpl_firm_isolation" ON "matter_templates"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- =============================================================================

CREATE TABLE "rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid,
  "matter_type" matter_type,
  "client_id" uuid,
  "hourly_rate" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'DOP',
  "notes" text,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "rates"
  ADD CONSTRAINT "rates_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "rates"
  ADD CONSTRAINT "rates_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "rates"
  ADD CONSTRAINT "rates_client_fk"
  FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "rates_firm_idx" ON "rates" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "rates_firm_user_idx" ON "rates" USING btree ("firm_id", "user_id");
--> statement-breakpoint
CREATE INDEX "rates_firm_matter_idx" ON "rates" USING btree ("firm_id", "matter_type");
--> statement-breakpoint
CREATE INDEX "rates_firm_client_idx" ON "rates" USING btree ("firm_id", "client_id");
--> statement-breakpoint

ALTER TABLE "rates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "rates_firm_isolation" ON "rates"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
