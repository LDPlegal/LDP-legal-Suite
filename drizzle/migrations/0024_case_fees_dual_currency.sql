-- case_fees: simplificar moneda a 3 opciones (Dólar / Peso / Dólar y Peso)
--
-- Decisión de producto: las firmas dominicanas en la práctica facturan en
-- DOP, USD, o AMBAS combinadas. No usan 20 monedas distintas. Conceptualmente
-- "Dólar y Peso" = una misma línea de honorario con MONTO en USD + MONTO en DOP
-- (ej. la firma cobra US$1000 + RD$50000 por un trabajo).
--
-- Cambio de forma:
--   Antes: amount (single) + currency (text con código ISO)
--   Después: amount_usd (nullable) + amount_dop (nullable), al menos uno > 0
--
-- Como ya hicimos wipe del firm test, no hay filas en case_fees todavía,
-- así que el cambio es seguro sin migración de datos.

ALTER TABLE case_fees
  ADD COLUMN amount_usd numeric(14, 2),
  ADD COLUMN amount_dop numeric(14, 2);

-- Si por algún motivo hay filas viejas con (amount, currency) — copiarlas
-- a la columna correcta. En nuestro caso firms en producción está vacío,
-- pero esto deja el comportamiento correcto para cualquier otro firm.
UPDATE case_fees
  SET amount_usd = amount
  WHERE currency = 'USD' AND amount_usd IS NULL;

UPDATE case_fees
  SET amount_dop = amount
  WHERE currency = 'DOP' AND amount_dop IS NULL;

-- Para cualquier otra moneda exótica (EUR, GBP, etc.) que algún firm haya
-- guardado, las copiamos a DOP por default (no es ideal, pero conserva el
-- número — el firm puede corregir manual después). En nuestra DB no hay
-- ninguno de estos, así que es defensivo.
UPDATE case_fees
  SET amount_dop = amount
  WHERE currency NOT IN ('USD', 'DOP') AND amount_dop IS NULL AND amount_usd IS NULL;

-- Drop columnas viejas
ALTER TABLE case_fees DROP COLUMN amount;
ALTER TABLE case_fees DROP COLUMN currency;

-- Garantía: cada fila debe tener al menos un monto (USD o DOP).
ALTER TABLE case_fees
  ADD CONSTRAINT case_fees_at_least_one_amount
  CHECK (amount_usd IS NOT NULL OR amount_dop IS NOT NULL);
