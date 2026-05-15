-- F7 bloque 3 — Tipos de evento + politica de alertas + eventos por IA.

ALTER TABLE "events" ADD COLUMN "event_type" text;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "created_by_ai" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "original_prompt" text;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ai_chat_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "alert_policy" jsonb;
--> statement-breakpoint

CREATE INDEX "events_firm_type_idx"
  ON "events" USING btree ("firm_id", "event_type")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- event_alerts: one row per scheduled reminder. Cron consumer in
-- lib/events/alerts.ts sweeps WHERE due_at <= now() AND sent_at IS NULL.

CREATE TABLE "event_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "channel" text NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "sent_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "event_alerts"
  ADD CONSTRAINT "event_alerts_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_alerts"
  ADD CONSTRAINT "event_alerts_event_fk"
  FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_alerts"
  ADD CONSTRAINT "event_alerts_recipient_fk"
  FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "event_alerts_firm_idx" ON "event_alerts" USING btree ("firm_id");
--> statement-breakpoint
-- Partial index — only pending alerts matter for the cron scan.
CREATE INDEX "event_alerts_due_idx" ON "event_alerts" USING btree ("due_at")
  WHERE "sent_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "event_alerts_event_idx" ON "event_alerts" USING btree ("event_id");
--> statement-breakpoint

ALTER TABLE "event_alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "event_alerts_firm_isolation" ON "event_alerts"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
