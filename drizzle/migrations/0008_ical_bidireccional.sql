-- Fase 4.3 — iCal bidireccional
--
-- Out: each user can opt into a public ICS feed served at
--      /api/calendario/feed/<token>.ics. We add users.ical_token (random
--      string) with a partial unique index ignoring NULL.
--
-- In:  each user can register external ICS URLs (Outlook / Google / coworker
--      feeds). Sync upserts into events with external_subscription_id +
--      external_uid set so re-syncs are idempotent.

ALTER TABLE "users"
  ADD COLUMN "ical_token" text;
--> statement-breakpoint

CREATE UNIQUE INDEX "users_ical_token_unique"
  ON "users" USING btree ("ical_token")
  WHERE "ical_token" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "events"
  ADD COLUMN "external_subscription_id" uuid;
--> statement-breakpoint

ALTER TABLE "events"
  ADD COLUMN "external_uid" text;
--> statement-breakpoint

CREATE UNIQUE INDEX "events_external_unique"
  ON "events" USING btree ("external_subscription_id", "external_uid")
  WHERE "external_subscription_id" IS NOT NULL AND "external_uid" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE "external_calendar_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "last_synced_at" timestamp with time zone,
  "last_error" text,
  "last_event_count" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "external_calendar_subscriptions"
  ADD CONSTRAINT "external_cal_firm_id_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "external_calendar_subscriptions"
  ADD CONSTRAINT "external_cal_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "external_cal_firm_user_idx"
  ON "external_calendar_subscriptions" USING btree ("firm_id", "user_id");
--> statement-breakpoint

ALTER TABLE "events"
  ADD CONSTRAINT "events_external_subscription_fk"
  FOREIGN KEY ("external_subscription_id")
  REFERENCES "public"."external_calendar_subscriptions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- =============================================================================
-- RLS for external_calendar_subscriptions
-- =============================================================================
-- Same firm-isolation policy as the rest of domain tables. We don't add a
-- per-user policy here; any staff member of the firm can see and manage
-- subscriptions of other staff (it's a transparent calendar feature).
ALTER TABLE "external_calendar_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "external_cal_firm_isolation" ON "external_calendar_subscriptions"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
