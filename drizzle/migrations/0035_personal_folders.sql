-- Repositorio documental — Fase 1: carpetas personales + biblioteca general.
--
-- Contexto: la firma quiere que cada uno de sus miembros tenga una carpeta
-- PERSONAL (privada: solo la ve su dueño) para guardar sus cosas, y además
-- una BIBLIOTECA compartida de toda la firma (leyes, libros, plantillas) que
-- todos ven. Hasta ahora las carpetas (tabla `folders`, migración 0026) solo
-- tenían scope firm-wide / caso / cliente, y la privacidad era una bandera por
-- documento (`documents.visibility`, migración 0030) aplicada a nivel de query.
--
-- Esta migración agrega el concepto de "dueño" a las carpetas y lo hace cumplir
-- a nivel de RLS (defensa en profundidad: aunque una query se olvide de filtrar,
-- Postgres no deja ver la carpeta ni sus documentos a otro usuario):
--
--   * folders.owner_user_id:
--       - NULL  → carpeta COMPARTIDA de la firma (biblioteca, o carpetas de
--                 caso/cliente ya existentes). Comportamiento actual intacto.
--       - set   → carpeta PERSONAL: solo la ve/edita ese usuario.
--   * Los documentos que viven dentro de una carpeta personal quedan visibles
--     únicamente para el dueño de la carpeta (helper app_folder_owner + RLS de
--     documents), sin importar su propio `visibility`/`uploaded_by`.
--
-- Compatibilidad: todo lo existente tiene owner_user_id NULL → sigue siendo
-- compartido/como estaba. No se rompe nada. Al final se siembran, de forma
-- idempotente, una carpeta "Mi carpeta" por cada usuario staff y una
-- "Biblioteca" por cada firma.

-- =============================================================================
-- 1. Columna owner_user_id en folders
-- =============================================================================
-- ON DELETE CASCADE: si algún día se BORRA (hard delete) un usuario, sus
-- carpetas personales se van con él. La app usa soft-delete de usuarios, así
-- que en la práctica esto casi nunca dispara; CASCADE es lo seguro porque el
-- comportamiento alternativo (SET NULL) convertiría una carpeta privada en
-- compartida y filtraría sus documentos.
ALTER TABLE "folders"
  ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Índice para listar rápido "mis carpetas personales".
CREATE INDEX IF NOT EXISTS "folders_firm_owner_idx"
  ON "folders" ("firm_id", "owner_user_id")
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

-- Una sola carpeta PERSONAL raíz por usuario (la que la app autocrea como
-- "Mi carpeta"). Hace idempotente el find-or-create y evita duplicados por
-- carreras. Las subcarpetas personales cuelgan de esta (parent no NULL) y no
-- caen en este índice.
CREATE UNIQUE INDEX IF NOT EXISTS "folders_personal_root_unique"
  ON "folders" ("firm_id", "owner_user_id")
  WHERE "owner_user_id" IS NOT NULL
    AND "parent_folder_id" IS NULL
    AND "deleted_at" IS NULL;
--> statement-breakpoint

-- Unicidad de nombre entre carpetas RAÍZ firm-wide compartidas (owner NULL,
-- sin caso ni cliente). Cubre la "Biblioteca" y cualquier otra raíz de firma,
-- sin afectar las raíces de caso/cliente (que llevan case_id/client_id).
CREATE UNIQUE INDEX IF NOT EXISTS "folders_firmwide_root_unique"
  ON "folders" ("firm_id", "name")
  WHERE "owner_user_id" IS NULL
    AND "parent_folder_id" IS NULL
    AND "case_id" IS NULL
    AND "client_id" IS NULL
    AND "deleted_at" IS NULL;
--> statement-breakpoint

-- =============================================================================
-- 2. Helper: dueño de una carpeta (SECURITY DEFINER, no dispara RLS adentro)
-- =============================================================================
-- Se usa en la policy de `documents` para saber si el documento vive dentro de
-- una carpeta personal ajena. Mismo patrón de hardening que los helpers de
-- 0001/0004 (STABLE + search_path fijo). Devuelve NULL si la carpeta no existe
-- o es compartida.
CREATE OR REPLACE FUNCTION app_folder_owner(p_folder_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT owner_user_id FROM folders WHERE id = p_folder_id
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_folder_owner(uuid) TO PUBLIC;
--> statement-breakpoint

-- =============================================================================
-- 3. RLS de folders — agrega la cláusula de dueño
-- =============================================================================
-- Reemplaza la policy de 0026. Una carpeta es visible/escribible si:
--   firm coincide
--   Y (es compartida  OR  su dueño es el usuario actual)
--   Y (es firm-wide   OR  el usuario puede ver el caso)
DROP POLICY IF EXISTS "folders_firm_visibility" ON "folders";
--> statement-breakpoint
CREATE POLICY "folders_firm_visibility" ON "folders"
  FOR ALL
  TO PUBLIC
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      owner_user_id IS NULL
      OR owner_user_id = current_setting('app.user_id', true)::uuid
    )
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
      owner_user_id IS NULL
      OR owner_user_id = current_setting('app.user_id', true)::uuid
    )
    AND (
      case_id IS NULL
      OR app_user_can_see_case(
           case_id,
           current_setting('app.user_id', true)::uuid,
           firm_id
         )
    )
  );
--> statement-breakpoint

-- =============================================================================
-- 4. RLS de documents — respeta el dueño de la carpeta contenedora
-- =============================================================================
-- Reemplaza la policy de 0004. Agrega: si el documento vive en una carpeta
-- personal, solo su dueño lo ve/escribe (aunque la RLS por caso lo permitiera).
-- Documentos sin carpeta o en carpeta compartida: sin cambios.
DROP POLICY IF EXISTS "documents_firm_case_visibility" ON "documents";
--> statement-breakpoint
CREATE POLICY "documents_firm_case_visibility" ON "documents"
  USING (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(case_id, current_setting('app.user_id', true)::uuid, firm_id)
    )
    AND (
      folder_id IS NULL
      OR app_folder_owner(folder_id) IS NULL
      OR app_folder_owner(folder_id) = current_setting('app.user_id', true)::uuid
    )
  )
  WITH CHECK (
    firm_id = current_setting('app.firm_id', true)::uuid
    AND (
      case_id IS NULL
      OR app_user_can_see_case(case_id, current_setting('app.user_id', true)::uuid, firm_id)
    )
    AND (
      folder_id IS NULL
      OR app_folder_owner(folder_id) IS NULL
      OR app_folder_owner(folder_id) = current_setting('app.user_id', true)::uuid
    )
  );
--> statement-breakpoint

-- =============================================================================
-- 5. Seed idempotente: "Mi carpeta" por usuario staff + "Biblioteca" por firma
-- =============================================================================
-- Corre como el rol dueño de la migración (BYPASSRLS), así que inserta sin
-- chocar con las policies. Los usuarios/firmas nuevos obtienen las suyas por
-- find-or-create desde la app (protegido por los índices únicos de arriba).

-- Carpeta personal raíz por cada usuario staff (excluye clientes del portal).
INSERT INTO "folders" ("firm_id", "owner_user_id", "name", "path", "created_by")
SELECT u.firm_id, u.id, 'Mi carpeta', '/', u.id
FROM "users" u
WHERE u.deleted_at IS NULL
  AND u.role <> 'client'
  AND NOT EXISTS (
    SELECT 1 FROM "folders" f
    WHERE f.firm_id = u.firm_id
      AND f.owner_user_id = u.id
      AND f.parent_folder_id IS NULL
      AND f.deleted_at IS NULL
  );
--> statement-breakpoint

-- Biblioteca compartida por cada firma.
INSERT INTO "folders" ("firm_id", "owner_user_id", "name", "path", "created_by")
SELECT f.id, NULL, 'Biblioteca', '/', NULL
FROM "firms" f
WHERE NOT EXISTS (
  SELECT 1 FROM "folders" x
  WHERE x.firm_id = f.id
    AND x.owner_user_id IS NULL
    AND x.parent_folder_id IS NULL
    AND x.case_id IS NULL
    AND x.client_id IS NULL
    AND x.name = 'Biblioteca'
    AND x.deleted_at IS NULL
);
