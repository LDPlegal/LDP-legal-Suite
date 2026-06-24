-- Fase 11:
--   Reportes de audiencias. Cada evento con event_type='audiencia' puede
--   tener UN reporte asociado. El reporte tiene un editor rico (tiptap JSON)
--   y registra a qué usuarios se envió por email (audit + idempotencia).

-- =============================================================================
-- hearing_reports
-- =============================================================================
-- Un reporte por evento. event_id es UNIQUE para garantizar idempotencia
-- (upsert simple). content_json guarda el doc tiptap como en notes.
-- content_html es el render del tiptap a HTML que se usa para el email y
-- como vista rápida; lo calculamos server-side al guardar y reutilizamos.
CREATE TABLE IF NOT EXISTS "hearing_reports" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firm_id"      uuid NOT NULL REFERENCES "firms"("id") ON DELETE CASCADE,
  "case_id"      uuid NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "event_id"     uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "title"        text NOT NULL,
  "content_json" jsonb NOT NULL,
  "content_html" text NOT NULL DEFAULT '',
  "created_by"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now(),
  "deleted_at"   timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "hearing_reports_event_unique"
  ON "hearing_reports" ("event_id")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "hearing_reports_firm_case_idx"
  ON "hearing_reports" ("firm_id", "case_id");

ALTER TABLE "hearing_reports" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hearing_reports_firm" ON "hearing_reports";
CREATE POLICY "hearing_reports_firm" ON "hearing_reports"
  FOR ALL
  TO PUBLIC
  USING (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "hearing_reports" TO app_user;

-- =============================================================================
-- hearing_report_sends
-- =============================================================================
-- Registro de cada envío por email. Un reporte se puede re-enviar; cada vez
-- queda fila con la lista de destinatarios y quién lo envió. Sirve como
-- audit y para mostrar en UI "Último envío: 23/06 a 4 personas".
CREATE TABLE IF NOT EXISTS "hearing_report_sends" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firm_id"    uuid NOT NULL REFERENCES "firms"("id") ON DELETE CASCADE,
  "report_id"  uuid NOT NULL REFERENCES "hearing_reports"("id") ON DELETE CASCADE,
  "sent_by"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recipient_user_ids" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  "recipient_emails"   text[] NOT NULL DEFAULT ARRAY[]::text[],
  "sent_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "hearing_report_sends_report_idx"
  ON "hearing_report_sends" ("report_id");

ALTER TABLE "hearing_report_sends" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hearing_report_sends_firm" ON "hearing_report_sends";
CREATE POLICY "hearing_report_sends_firm" ON "hearing_report_sends"
  FOR ALL
  TO PUBLIC
  USING (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "hearing_report_sends" TO app_user;
