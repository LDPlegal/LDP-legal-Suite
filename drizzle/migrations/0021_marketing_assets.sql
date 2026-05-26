-- F7+ Marketing — Tablas para CRUD de fotos y presets de plantillas.
--
--   marketing_photos: cada foto que el firm sube vía el editor de
--     publicaciones (logos del cliente, fotos de equipo nuevas, etc.).
--     storage_key apunta al objeto en R2/S3. Soft-delete con deleted_at.
--
--   marketing_presets: snapshot del state de un template como un preset
--     reutilizable. Ej. "Presentación · Septiembre 2026" guarda todos los
--     valores que el usuario configuró (copy, foto, colores, sliders).
--     values jsonb guarda el dict completo.

-- ---------------------------------------------------------------------------
-- 1) marketing_photos
-- ---------------------------------------------------------------------------

CREATE TABLE "marketing_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "label" text NOT NULL,
  "url" text NOT NULL,           -- canonical URL para mostrar en preview (firm bucket / cdn)
  "storage_key" text NOT NULL,   -- key opaco en el provider (R2/S3/local)
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "marketing_photos"
  ADD CONSTRAINT "marketing_photos_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "marketing_photos"
  ADD CONSTRAINT "marketing_photos_uploaded_by_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint

CREATE INDEX "marketing_photos_firm_idx"
  ON "marketing_photos" ("firm_id")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

ALTER TABLE "marketing_photos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "marketing_photos_firm_isolation" ON "marketing_photos"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2) marketing_presets
-- ---------------------------------------------------------------------------

CREATE TABLE "marketing_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "template_id" text NOT NULL,    -- "p1" | "p2" | "p3" | "p4" | "s1" | ... | "li"
  "name" text NOT NULL,           -- e.g. "Presentación · Sept 2026"
  "values" jsonb NOT NULL,        -- snapshot completo del state
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "marketing_presets"
  ADD CONSTRAINT "marketing_presets_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "marketing_presets"
  ADD CONSTRAINT "marketing_presets_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint

CREATE INDEX "marketing_presets_firm_template_idx"
  ON "marketing_presets" ("firm_id", "template_id")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

ALTER TABLE "marketing_presets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "marketing_presets_firm_isolation" ON "marketing_presets"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
