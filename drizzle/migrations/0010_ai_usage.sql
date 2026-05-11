-- Fase 6 — cost tracking de llamadas a Claude.

CREATE TABLE "ai_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid,
  "feature" text NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "cost_usd" numeric(10, 6),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "ai_usage_firm_idx" ON "ai_usage" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "ai_usage_firm_created_idx" ON "ai_usage" USING btree ("firm_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_usage_firm_user_idx" ON "ai_usage" USING btree ("firm_id", "user_id");
--> statement-breakpoint
CREATE INDEX "ai_usage_firm_feature_idx" ON "ai_usage" USING btree ("firm_id", "feature");
--> statement-breakpoint

ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "ai_usage_firm_isolation" ON "ai_usage"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
