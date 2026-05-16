-- F7 bloque 4 — Seguridad (2FA + cifrado app-layer), presupuesto IA y
-- sugerencias proactivas.
--
--   1. users.two_factor_enabled + tabla two_factors (better-auth plugin)
--   2. cases.confidential_tier — normal | confidential | ultra_confidential
--      (los "ultra" se cifran a nivel de app antes de subir al storage)
--   3. documents.encryption_meta jsonb — IV/AAD/version del cifrado app-layer
--   4. ai_suggestions — bandeja de sugerencias proactivas generadas por el
--      worker (NLP scan de casos sin movimiento, plazos próximos, etc.)
--
-- El presupuesto IA NO requiere columnas nuevas: vive en firms.settings.aiBudget
-- (jsonb) y se evalúa contra ai_usage en tiempo real.

-- ---------------------------------------------------------------------------
-- 1) 2FA con better-auth two-factor plugin
-- ---------------------------------------------------------------------------

ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE TABLE "two_factors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  -- TOTP secret y backup codes cifrados con BETTER_AUTH_SECRET (better-auth
  -- los cifra antes de persistir; nosotros no los tocamos).
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "verified" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "two_factors"
  ADD CONSTRAINT "two_factors_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "two_factors_user_unique" ON "two_factors" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "two_factors" USING btree ("secret");
--> statement-breakpoint

-- two_factors NO usa RLS: better-auth lo consulta con adminDb (BYPASSRLS)
-- igual que sessions/accounts. La unique-por-user-id ya garantiza aislamiento.

-- ---------------------------------------------------------------------------
-- 2) Casos confidenciales: tier por caso
-- ---------------------------------------------------------------------------
-- normal: comportamiento por defecto (visible a todos los del firm que tengan
--   acceso al caso).
-- confidential: igual que normal pero se loguea en audit cada acceso de
--   lectura por usuarios distintos al lead_lawyer.
-- ultra_confidential: documentos se cifran app-layer antes de subir al
--   storage (R2 ve blobs opacos). Solo el lead_lawyer y admins pueden ver
--   los originales descifrados.

ALTER TABLE "cases" ADD COLUMN "confidential_tier" text NOT NULL DEFAULT 'normal';
--> statement-breakpoint

ALTER TABLE "cases"
  ADD CONSTRAINT "cases_confidential_tier_check"
  CHECK ("confidential_tier" IN ('normal', 'confidential', 'ultra_confidential'));
--> statement-breakpoint

CREATE INDEX "cases_firm_tier_idx" ON "cases" USING btree ("firm_id", "confidential_tier")
  WHERE "deleted_at" IS NULL AND "confidential_tier" <> 'normal';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3) Documentos: metadata de cifrado app-layer
-- ---------------------------------------------------------------------------
-- Cuando el caso es ultra_confidential, lib/crypto/app-layer.ts cifra el
-- archivo con AES-256-GCM antes de subirlo. El IV (96 bits), el AAD y la
-- version del key live aquí; el ciphertext + tag van al storage.
-- Estructura: { v: 1, iv: "<base64>", aad: "<base64>", keyId: "default" }

ALTER TABLE "documents" ADD COLUMN "encryption_meta" jsonb;
--> statement-breakpoint

CREATE INDEX "documents_encrypted_idx" ON "documents" USING btree ("firm_id")
  WHERE "encryption_meta" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4) ai_suggestions — bandeja de sugerencias proactivas
-- ---------------------------------------------------------------------------
-- El worker NLP (lib/ai/suggestions.ts) escanea periódicamente cada firm y
-- genera sugerencias del tipo:
--   - "El caso 2026-CIV-014 lleva 21 días sin movimiento."
--   - "Hay 3 documentos pendientes de revisión humana > 7 días."
--   - "El plazo para responder el oficio del 12-mar vence en 2 días y aún
--      no hay borrador en el expediente."
--
-- Cada sugerencia se dirige a un usuario (lead lawyer o admin) y tiene un
-- estado: pending | dismissed | acted. La UI las muestra en el dashboard
-- y se marcan acted cuando el usuario navega al caso desde la tarjeta.

CREATE TABLE "ai_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "case_id" uuid,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "href" text,
  "severity" text NOT NULL DEFAULT 'info',
  "status" text NOT NULL DEFAULT 'pending',
  "metadata" jsonb,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "dismissed_at" timestamp with time zone,
  "acted_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "ai_suggestions"
  ADD CONSTRAINT "ai_suggestions_firm_fk"
  FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_suggestions"
  ADD CONSTRAINT "ai_suggestions_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_suggestions"
  ADD CONSTRAINT "ai_suggestions_case_fk"
  FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_suggestions"
  ADD CONSTRAINT "ai_suggestions_severity_check"
  CHECK ("severity" IN ('info', 'warn', 'critical'));
--> statement-breakpoint
ALTER TABLE "ai_suggestions"
  ADD CONSTRAINT "ai_suggestions_status_check"
  CHECK ("status" IN ('pending', 'dismissed', 'acted'));
--> statement-breakpoint

CREATE INDEX "ai_suggestions_firm_user_idx"
  ON "ai_suggestions" USING btree ("firm_id", "user_id", "status");
--> statement-breakpoint
-- Índice parcial: sólo las pendientes alimentan la bandeja.
CREATE INDEX "ai_suggestions_firm_pending_idx"
  ON "ai_suggestions" USING btree ("firm_id", "created_at")
  WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX "ai_suggestions_case_idx"
  ON "ai_suggestions" USING btree ("case_id")
  WHERE "case_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "ai_suggestions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "ai_suggestions_firm_isolation" ON "ai_suggestions"
  USING      (firm_id = current_setting('app.firm_id', true)::uuid)
  WITH CHECK (firm_id = current_setting('app.firm_id', true)::uuid);
