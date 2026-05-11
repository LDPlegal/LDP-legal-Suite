-- Agrega el rol 'tester' (acceso total, igual que admin/partner) sin
-- romper roles existentes. Postgres permite ALTER TYPE ADD VALUE pero NO
-- dentro de una transacción; las migraciones de drizzle corren cada
-- archivo en su propia transacción, así que esto necesita ejecutarse de
-- forma aislada. Usamos DO block con autonomous-like semantics via
-- pg_temp; alternativamente: agregar BEFORE 'client' para mantener orden.

ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'tester' BEFORE 'client';
