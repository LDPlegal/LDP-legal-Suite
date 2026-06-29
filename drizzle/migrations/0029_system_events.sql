-- Fase 12:
--   Registro de eventos del sistema (fallos silenciosos visibles).
--
--   Hoy hay decenas de try/catch que solo hacen console.error: si un email
--   de notificacion no se envia, si el sync de Outlook falla, si Graph
--   rechaza un sendMail — nadie se entera hasta que el cliente reclama.
--   Esta tabla registra esos eventos para mostrarlos en Configuracion ->
--   Eventos del sistema, con severidad y opcion de marcar como resuelto.

CREATE TABLE IF NOT EXISTS "system_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firm_id"     uuid NOT NULL REFERENCES "firms"("id") ON DELETE CASCADE,
  -- kind: identificador estable del tipo de evento (email_send_failed,
  --   calendar_sync_failed, graph_send_failed, ocr_failed, ...). No es enum
  --   para no migrar cada vez que agregamos un tipo nuevo.
  "kind"        text NOT NULL,
  -- severity: 'info' | 'warning' | 'error'. Texto libre validado en app.
  "severity"    text NOT NULL DEFAULT 'error',
  "message"     text NOT NULL,
  -- context: payload arbitrario (ids, emails, codigos de error de Graph).
  "context"     jsonb,
  -- Quien estaba en sesion cuando ocurrio (si aplica). Puede ser null para
  -- eventos de sistema (crons).
  "user_id"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "system_events_firm_created_idx"
  ON "system_events" ("firm_id", "created_at" DESC);

-- Indice parcial para el badge de "no resueltos" — el caso comun.
CREATE INDEX IF NOT EXISTS "system_events_firm_unresolved_idx"
  ON "system_events" ("firm_id")
  WHERE "resolved_at" IS NULL;

ALTER TABLE "system_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_events_firm" ON "system_events";
CREATE POLICY "system_events_firm" ON "system_events"
  FOR ALL
  TO PUBLIC
  USING (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "system_events" TO app_user;
