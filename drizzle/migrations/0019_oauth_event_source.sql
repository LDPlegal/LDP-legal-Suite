-- F7+ Bloque 5 — Fix sync de calendario con OAuth.
--
-- Bug: events.external_subscription_id tenía FK a external_calendar_subscriptions
-- (las suscripciones iCal de la fase iCal bidireccional). Cuando intentamos
-- sincronizar desde OAuth (Microsoft Graph), guardábamos integration.id ahí
-- y violaba el FK.
--
-- Fix limpio: agregamos columna `oauth_integration_id` con su propio FK a
-- calendar_integrations. external_subscription_id queda solo para iCal.
-- La columna external_uid se reutiliza para identificador del provider en
-- ambos casos (uid del feed iCal O id REST del evento Graph).

ALTER TABLE "events" ADD COLUMN "oauth_integration_id" uuid;
--> statement-breakpoint

ALTER TABLE "events"
  ADD CONSTRAINT "events_oauth_integration_fk"
  FOREIGN KEY ("oauth_integration_id")
  REFERENCES "public"."calendar_integrations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Dedupe para eventos sincronizados desde OAuth.
CREATE UNIQUE INDEX "events_oauth_unique"
  ON "events" USING btree ("oauth_integration_id", "external_uid")
  WHERE "oauth_integration_id" IS NOT NULL AND "external_uid" IS NOT NULL;
