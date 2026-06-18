-- Fase 10:
--   1. Facturas proforma: columna `kind` en invoices + contador separado.
--   2. Preferencias de notificación por email por usuario (opt-in).

-- =============================================================================
-- 1. invoices.kind  ('standard' | 'proforma')
-- =============================================================================
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'standard';

-- Contador de proformas, separado del de facturas (no comparte secuencia
-- para no dejar huecos en la numeración fiscal).
CREATE TABLE IF NOT EXISTS "proforma_counters" (
  "firm_id"    uuid NOT NULL REFERENCES "firms"("id") ON DELETE CASCADE,
  "year"       integer NOT NULL,
  "last_seq"   integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "proforma_counters_pk"
  ON "proforma_counters" ("firm_id", "year");

-- RLS: mismo patrón que invoice_counters (firm-scoped). app_user las maneja
-- dentro de withFirm; el firm context se valida por la policy.
ALTER TABLE "proforma_counters" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proforma_counters_firm" ON "proforma_counters";
CREATE POLICY "proforma_counters_firm" ON "proforma_counters"
  FOR ALL
  TO PUBLIC
  USING (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "proforma_counters" TO app_user;

-- =============================================================================
-- 2. user_email_prefs — opt-in de notificaciones por correo
-- =============================================================================
CREATE TABLE IF NOT EXISTS "user_email_prefs" (
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind"       text NOT NULL,
  "enabled_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_email_prefs_pkey" PRIMARY KEY ("user_id", "kind")
);

-- Sin RLS dedicada: igual que user_muted_suggestion_kinds, se accede vía
-- adminDb (el envío de email corre fuera de la sesión del recipiente) y vía
-- queries scoped al propio user_id. Habilitamos RLS permisiva por user para
-- la UI de configuración (cada quien ve/edita lo suyo).
ALTER TABLE "user_email_prefs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_email_prefs_self" ON "user_email_prefs";
CREATE POLICY "user_email_prefs_self" ON "user_email_prefs"
  FOR ALL
  TO PUBLIC
  USING (user_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "user_email_prefs" TO app_user;
