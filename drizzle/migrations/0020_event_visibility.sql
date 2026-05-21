-- F7+ Bloque 5 — Privacidad de eventos sincronizados desde calendarios
-- personales OAuth.
--
-- Antes del fix: los eventos pulled desde el Outlook de un socio quedaban
-- visibles a TODO el firm (porque events solo se filtra por firmId).
-- Eso filtra info personal (reuniones médicas, agenda privada, etc.).
--
-- Fix: nueva columna `visibility` con 2 valores:
--   - 'firm': default. Visible a todos los del firm con acceso al caso
--     o al calendario general. Los eventos que crean los socios desde la
--     app (audiencias, plazos, reuniones de cliente) son 'firm'.
--   - 'private': solo el `created_by` ve este evento. Los pulled desde
--     OAuth se insertan como 'private' por default; el socio puede
--     "compartirlos" a 'firm' manualmente si quiere.

ALTER TABLE "events"
  ADD COLUMN "visibility" text NOT NULL DEFAULT 'firm';
--> statement-breakpoint

ALTER TABLE "events"
  ADD CONSTRAINT "events_visibility_check"
  CHECK ("visibility" IN ('firm', 'private'));
--> statement-breakpoint

-- Índice parcial para acelerar la query de "mis privados".
CREATE INDEX "events_private_creator_idx"
  ON "events" USING btree ("created_by")
  WHERE "visibility" = 'private' AND "deleted_at" IS NULL;
