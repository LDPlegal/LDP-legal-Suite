-- Agrega el campo opcional `registro_mercantil` a la tabla `clients`.
--
-- Contexto: en RD las personas jurídicas se identifican con dos números
-- distintos al RNC: el Registro Mercantil (RM) emitido por la Cámara de
-- Comercio y Producción correspondiente. Hasta ahora el sistema solo
-- guardaba RNC en `tax_id`, lo que obligaba a guardar el RM en `notes` o
-- al margen. Esta columna lo formaliza.
--
-- Es nullable porque:
--   - Personas físicas (type='individual') no tienen RM.
--   - Algunas firmas pueden no llegar a capturarlo en clientes existentes.
--
-- `IF NOT EXISTS` evita que el migrate falle si la columna ya fue agregada
-- a mano en algún entorno (defensa en profundidad — la migración de Drizzle
-- por sí sola tira error si el `ADD COLUMN` choca).

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "registro_mercantil" text;

-- RLS — `clients` ya tiene policies definidas desde la migración 0000_initial_with_rls.sql,
-- y esas policies aplican a todas las columnas de la tabla. No hace falta crear policy nueva.
