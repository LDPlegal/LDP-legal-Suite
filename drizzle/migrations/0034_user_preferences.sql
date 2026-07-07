-- Preferencias de UI por usuario (dashboard personalizable con widgets).
--
-- Columna jsonb libre en users. Hoy guarda la config del dashboard:
--   { "dashboardWidgets": [ { "id": "kpi_casos", "visible": true }, ... ] }
-- en el orden elegido por el usuario. Default '{}' → el dashboard usa el
-- layout por defecto del registry (lib/dashboard/widgets.ts) hasta que el
-- usuario personalice.
--
-- No requiere política RLS nueva: users ya tiene su aislamiento por firm;
-- esta columna solo agrega datos a filas existentes.

ALTER TABLE "users" ADD COLUMN "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb;
