-- Subcasos (casos hijos) — un caso puede contener otros casos para organizar
-- expedientes grandes (ej. "TEJAR DEL REY" contiene "Demanda en cobro...").
--
--   1. cases.parent_case_id: self-FK nullable. Máx. 1 nivel de profundidad
--      (un subcaso no puede tener hijos) — se valida en la capa de app
--      (lib/db/queries/cases.ts createCase), no con constraint recursivo.
--   2. cases.subcase_last_seq: contador atómico por padre para el código
--      derivado "PADRE-NN" (ej. 2026-CIV-014-01). Se incrementa con
--      UPDATE ... RETURNING dentro de la misma tx que el INSERT del hijo,
--      así dos subcasos simultáneos no chocan. No se reusa numeración al
--      archivar (el índice parcial cases_firm_code_unique solo cubre filas
--      vivas y un restore no debe romperse).
--
-- RLS: no hace falta política nueva — parent_case_id vive en cases, que ya
-- tiene cases_firm_visibility. Un hijo hereda su propia visibilidad (el
-- formulario de subcaso precarga la del padre).

ALTER TABLE "cases" ADD COLUMN "parent_case_id" uuid;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "subcase_last_seq" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "cases"
  ADD CONSTRAINT "cases_parent_case_fk"
  FOREIGN KEY ("parent_case_id") REFERENCES "public"."cases"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "cases_parent_case_idx" ON "cases" ("parent_case_id")
  WHERE "parent_case_id" IS NOT NULL;
