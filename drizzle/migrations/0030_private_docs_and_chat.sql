-- Fase 13:
--   Trabajo individual dentro de un caso.
--
--   1. documents.visibility — cada usuario puede subir documentos "solo para
--      mí" (privados) que el resto del equipo del caso NO ve. Default 'case'
--      = comportamiento actual (visible a todo el equipo del caso/firm).
--      'private' = solo el uploaded_by lo ve.
--
--   2. matter_chats.owner_id — el chat de IA por caso pasa a ser individual:
--      cada usuario ve solo su propia conversación. owner_id NULL identifica
--      los mensajes del chat COMPARTIDO viejo (quedan ocultos en la nueva UI
--      individual, pero no se borran).

-- =============================================================================
-- 1. documents.visibility
-- =============================================================================
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'case';

-- Índice parcial: acelera el filtro "mis privados" sin penalizar el caso
-- común (docs de equipo). La mayoría de docs son 'case', así que este índice
-- es chico.
CREATE INDEX IF NOT EXISTS "documents_firm_private_owner_idx"
  ON "documents" ("firm_id", "uploaded_by")
  WHERE "visibility" = 'private' AND "deleted_at" IS NULL;

-- =============================================================================
-- 2. matter_chats.owner_id
-- =============================================================================
ALTER TABLE "matter_chats"
  ADD COLUMN IF NOT EXISTS "owner_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;

-- El chat individual lee por (firm, case, owner). Índice compuesto para que
-- cargar "mi conversación de este caso" sea un index scan directo.
CREATE INDEX IF NOT EXISTS "matter_chats_firm_case_owner_idx"
  ON "matter_chats" ("firm_id", "case_id", "owner_id", "created_at");
