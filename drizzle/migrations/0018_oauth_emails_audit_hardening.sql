-- F7+ — Endurecimiento del audit log, scaffolding de OAuth/correos,
-- y campos faltantes para sugerencias con feedback.
--
--   1. audit_log: trigger que rechaza UPDATE/DELETE (cumple "inmutable").
--   2. calendar_integrations: tokens OAuth Google/Microsoft por usuario.
--   3. sent_emails: correos salientes desde el chat con audit trail.
--   4. inbox_processed: dedupe + clasificación de correos entrantes.
--   5. ai_suggestions: campos `feedback` y `feedback_at` para el loop
--      útil/no relevante/ignorar tipo.
--   6. users: campo `email_signature` para que cada socio configure su firma.

-- ---------------------------------------------------------------------------
-- 0) audit_action: nuevo valor 'viewed' (read_document, descargas, accesos)
-- ---------------------------------------------------------------------------
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'viewed';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 1) Audit log inmutable
-- ---------------------------------------------------------------------------
-- Append-only: cualquier UPDATE o DELETE sobre audit_log dispara excepción.
-- Sólo el rol postgres puede saltar el trigger (para migraciones futuras).

CREATE OR REPLACE FUNCTION ldp_audit_log_immutable()
RETURNS trigger AS $$
BEGIN
  IF current_user = 'postgres' OR current_user = 'neondb_owner' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_log is append-only — % rejected by trigger', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_log_no_modify ON "audit_log";
--> statement-breakpoint
CREATE TRIGGER audit_log_no_modify
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW
  EXECUTE FUNCTION ldp_audit_log_immutable();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2) calendar_integrations — OAuth tokens por usuario (Google/Microsoft)
-- ---------------------------------------------------------------------------

CREATE TABLE "calendar_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,           -- 'google' | 'microsoft'
  "external_account_id" text NOT NULL, -- email/UPN del provider
  -- Tokens cifrados con APP_CRYPTO_MASTER_KEY (lib/crypto/app-layer.ts).
  -- access_token_cipher se rota frecuentemente (cada 1h aprox).
  "access_token_cipher" text NOT NULL,
  "refresh_token_cipher" text,
  "token_meta" jsonb NOT NULL,         -- { iv, aad, keyId, expiresAt }
  "scopes" text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Configuración por usuario: qué carpetas leer (Gmail labels o MS folders),
  -- agresividad de las sugerencias (conservador/moderado/agresivo).
  "inbox_label" text,
  "suggestion_aggressiveness" text NOT NULL DEFAULT 'moderate',
  "last_sync_at" timestamp with time zone,
  "last_error" text,
  "disconnected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "calendar_integrations"
  ADD CONSTRAINT "calendar_integrations_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "calendar_integrations"
  ADD CONSTRAINT "calendar_integrations_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "calendar_integrations"
  ADD CONSTRAINT "calendar_integrations_provider_check"
  CHECK ("provider" IN ('google', 'microsoft'));
--> statement-breakpoint
ALTER TABLE "calendar_integrations"
  ADD CONSTRAINT "calendar_integrations_aggressiveness_check"
  CHECK ("suggestion_aggressiveness" IN ('conservative', 'moderate', 'aggressive'));
--> statement-breakpoint

CREATE UNIQUE INDEX "calendar_integrations_user_provider_unique"
  ON "calendar_integrations" ("user_id", "provider")
  WHERE "disconnected_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "calendar_integrations_firm_idx"
  ON "calendar_integrations" ("firm_id");
--> statement-breakpoint

ALTER TABLE "calendar_integrations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "calendar_integrations_firm_isolation" ON "calendar_integrations"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3) sent_emails — audit trail de correos salientes desde el chat
-- ---------------------------------------------------------------------------

CREATE TABLE "sent_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,             -- quién envió
  "case_id" uuid,                       -- expediente al que pertenece
  "provider" text NOT NULL,             -- 'google' | 'microsoft' | 'system'
  "external_message_id" text,           -- id del provider para tracking
  "from_address" text NOT NULL,
  "to_addresses" text[] NOT NULL,
  "cc_addresses" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "bcc_addresses" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "subject" text NOT NULL,
  "body_html" text NOT NULL,
  "body_text" text,
  -- Attachments quedan en documents/storage; aquí guardamos solo los IDs.
  "attachment_document_ids" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  -- Audit IA: si el correo se redactó por IA, guardamos el prompt original
  -- + el chat message + el texto que generó la IA (para comparar con lo
  -- que finalmente se envió tras edición humana).
  "ai_generated" boolean NOT NULL DEFAULT false,
  "ai_original_prompt" text,
  "ai_chat_message_id" uuid,
  "ai_draft_body" text,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "sent_emails"
  ADD CONSTRAINT "sent_emails_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "sent_emails"
  ADD CONSTRAINT "sent_emails_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "sent_emails"
  ADD CONSTRAINT "sent_emails_case_fk"
  FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null;
--> statement-breakpoint

CREATE INDEX "sent_emails_firm_case_idx" ON "sent_emails" ("firm_id", "case_id");
--> statement-breakpoint
CREATE INDEX "sent_emails_firm_sent_idx" ON "sent_emails" ("firm_id", "sent_at");
--> statement-breakpoint

ALTER TABLE "sent_emails" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "sent_emails_firm_isolation" ON "sent_emails"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4) inbox_processed — dedupe + clasificación de correos entrantes
-- ---------------------------------------------------------------------------
-- Cada correo del inbox del socio que el worker analiza queda registrado
-- aquí con su clasificación. Si pasa el filtro y se considera relevante,
-- se enlaza con un caso (case_id) y genera una ai_suggestion. La idea es
-- NO guardar el cuerpo completo del correo en nuestra DB: el provider lo
-- mantiene; nosotros sólo guardamos los datos extraídos + la decisión.

CREATE TABLE "inbox_processed" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_message_id" text NOT NULL,
  "from_address" text NOT NULL,
  "subject" text,
  "received_at" timestamp with time zone,
  -- Clasificación: relevante | irrelevante | no-se-sabe.
  "classification" text NOT NULL,
  "matched_case_id" uuid,
  "match_confidence" numeric(4,3),  -- 0.000–1.000
  "suggestion_id" uuid,
  "tokens_used" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "inbox_processed"
  ADD CONSTRAINT "inbox_processed_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "inbox_processed"
  ADD CONSTRAINT "inbox_processed_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "inbox_processed"
  ADD CONSTRAINT "inbox_processed_case_fk"
  FOREIGN KEY ("matched_case_id") REFERENCES "public"."cases"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "inbox_processed"
  ADD CONSTRAINT "inbox_processed_classification_check"
  CHECK ("classification" IN ('relevant', 'irrelevant', 'uncertain'));
--> statement-breakpoint

-- Dedupe: si ya procesamos este mensaje del provider, no volver a tocarlo.
CREATE UNIQUE INDEX "inbox_processed_provider_msg_unique"
  ON "inbox_processed" ("provider", "external_message_id");
--> statement-breakpoint
CREATE INDEX "inbox_processed_firm_user_idx"
  ON "inbox_processed" ("firm_id", "user_id", "received_at");
--> statement-breakpoint
CREATE INDEX "inbox_processed_case_idx"
  ON "inbox_processed" ("matched_case_id")
  WHERE "matched_case_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "inbox_processed" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "inbox_processed_firm_isolation" ON "inbox_processed"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5) ai_suggestions: feedback loop
-- ---------------------------------------------------------------------------

ALTER TABLE "ai_suggestions" ADD COLUMN "feedback" text;
--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD COLUMN "feedback_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "ai_suggestions"
  ADD CONSTRAINT "ai_suggestions_feedback_check"
  CHECK ("feedback" IS NULL OR "feedback" IN ('useful', 'not_relevant', 'mute_kind'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6) users: firma de correo configurable
-- ---------------------------------------------------------------------------

ALTER TABLE "users" ADD COLUMN "email_signature" text;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 7) user_muted_suggestion_kinds — los tipos que cada usuario quiere ocultar
-- ---------------------------------------------------------------------------

CREATE TABLE "user_muted_suggestion_kinds" (
  "user_id" uuid NOT NULL,
  "kind_pattern" text NOT NULL,        -- 'stale_case' | 'pending_review' | 'deadline_soon' | 'ai_budget_warn_*'
  "muted_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "kind_pattern")
);
--> statement-breakpoint

ALTER TABLE "user_muted_suggestion_kinds"
  ADD CONSTRAINT "user_muted_kinds_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
