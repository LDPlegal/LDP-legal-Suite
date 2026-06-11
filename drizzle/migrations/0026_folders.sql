-- Sistema de carpetas estilo "explorador de archivos" para documentos.
--
-- Contexto: una firma de abogados organiza documentos por caso, y dentro
-- del caso, por jerarquía libre (Demanda / 2026 / Demandas iniciales /
-- Anexos / ...). Hasta ahora los documentos vivían "planos" — solo
-- columnas case_id / client_id sin sub-niveles. Esta migración:
--
-- 1. Crea tabla `folders` con jerarquía ilimitada (parent_folder_id self-FK).
-- 2. Agrega `folder_id` a `documents` (nullable — un doc puede vivir suelto).
-- 3. Aplica RLS en `folders` reusando el patrón firm-scoped que ya tiene
--    `documents`, con el helper `app_user_can_see_case` para folders dentro
--    de casos restringidos.
-- 4. Índices y unicidad de nombre por nivel.
--
-- Compatibilidad: documentos existentes quedan con folder_id NULL (raíz).
-- Nada se rompe — el listado "global" sigue funcionando, simplemente ahora
-- la app puede agruparlos por carpeta.

-- =============================================================================
-- 1. Tabla folders
-- =============================================================================

CREATE TABLE IF NOT EXISTS "folders" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firm_id"          uuid NOT NULL REFERENCES "firms"("id") ON DELETE CASCADE,
  "case_id"          uuid REFERENCES "cases"("id") ON DELETE CASCADE,
  "client_id"        uuid REFERENCES "clients"("id") ON DELETE CASCADE,
  "parent_folder_id" uuid REFERENCES "folders"("id") ON DELETE CASCADE,
  "name"             text NOT NULL,
  "path"             text NOT NULL DEFAULT '/',
  "created_by"       uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now(),
  "deleted_at"       timestamptz
);

CREATE INDEX IF NOT EXISTS "folders_firm_idx"
  ON "folders" ("firm_id");

CREATE INDEX IF NOT EXISTS "folders_firm_parent_idx"
  ON "folders" ("firm_id", "parent_folder_id");

CREATE INDEX IF NOT EXISTS "folders_firm_case_idx"
  ON "folders" ("firm_id", "case_id");

CREATE INDEX IF NOT EXISTS "folders_firm_client_idx"
  ON "folders" ("firm_id", "client_id");

-- Unicidad de nombre dentro del mismo parent (case-sensitive). Ignorando
-- soft-deleted para permitir reuso de nombre tras eliminar.
CREATE UNIQUE INDEX IF NOT EXISTS "folders_unique_name_per_parent"
  ON "folders" ("firm_id", "parent_folder_id", "name")
  WHERE "deleted_at" IS NULL;

-- =============================================================================
-- 2. Columna folder_id en documents
-- =============================================================================

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "folder_id" uuid;

-- FK declarada después (separada por si la columna ya existe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_folder_id_fkey'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_folder_id_fkey"
      FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "documents_firm_folder_idx"
  ON "documents" ("firm_id", "folder_id");

-- =============================================================================
-- 3. RLS para folders — mismo patrón que documents
-- =============================================================================

ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;

-- Policy: el firm context debe coincidir. Si la carpeta está dentro de un
-- caso, además debe respetar la visibilidad del caso (helper de Fase 1).
-- Si es firm-wide (case_id NULL), basta con el firm match.

DROP POLICY IF EXISTS "folders_firm_visibility" ON "folders";
CREATE POLICY "folders_firm_visibility" ON "folders"
  FOR ALL
  TO PUBLIC
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(
           case_id,
           current_setting('app.user_id', true)::uuid,
           firm_id
         )
    )
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(
           case_id,
           current_setting('app.user_id', true)::uuid,
           firm_id
         )
    )
  );

-- Permisos básicos para app_user (creado en 0000_initial_with_rls.sql).
-- DEFAULT PRIVILEGES también se setearon allí, pero por seguridad explicitamos:
GRANT SELECT, INSERT, UPDATE, DELETE ON "folders" TO app_user;
