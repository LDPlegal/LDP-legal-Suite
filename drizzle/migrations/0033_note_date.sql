-- 0033_note_date.sql
-- =============================================================================
-- Agrega `note_date` a notes (gestiones): la FECHA de la gestión, que puede
-- diferir de created_at — p. ej. registrar hoy una gestión que ocurrió la
-- semana pasada. Editable desde el form (antes solo se guardaba el título).
-- =============================================================================

ALTER TABLE "notes"
  ADD COLUMN "note_date" timestamp with time zone;--> statement-breakpoint

-- Backfill: las gestiones existentes toman su created_at como fecha.
UPDATE "notes" SET "note_date" = "created_at" WHERE "note_date" IS NULL;--> statement-breakpoint

-- De aquí en adelante: default = ahora, NOT NULL.
ALTER TABLE "notes" ALTER COLUMN "note_date" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "note_date" SET NOT NULL;
