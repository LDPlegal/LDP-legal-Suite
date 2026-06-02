-- Multi-honorarios + multi-moneda por caso.
--
-- Antes: cases tenía dos columnas hardcoded en DOP:
--   flat_fee_amount (decimal 14,2)
--   retainer_balance (decimal 14,2)
-- Solo permitía UN fee de cada tipo, en una sola moneda.
--
-- Ahora: tabla case_fees con N filas por caso, cada una con su propia moneda
-- y tipo. La firma puede mezclar (ej. tarifa plana en DOP + iguala mensual
-- en USD para clientes internacionales).
--
-- La columna billing_mode de cases se MANTIENE como "modo predominante" del
-- caso (útil para reportes y para decidir cómo facturar por default).

-- Enum para el tipo de honorario.
CREATE TYPE case_fee_type AS ENUM (
  'flat_fee',     -- tarifa plana (un pago acordado)
  'retainer',     -- iguala (mensual u otro periodo)
  'success_fee',  -- contingencia / honorario de éxito
  'other'         -- otros (gastos pactados, bono, etc.)
);

CREATE TABLE case_fees (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  case_id       uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  fee_type      case_fee_type NOT NULL,
  description   text,
  amount        numeric(14, 2) NOT NULL,
  currency      text NOT NULL DEFAULT 'DOP',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_fees_case_idx ON case_fees(case_id);
CREATE INDEX case_fees_firm_idx ON case_fees(firm_id);

-- RLS — mismo patrón que el resto.
ALTER TABLE case_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_fees_firm_isolation ON case_fees
  USING (firm_id = current_setting('app.firm_id', true)::uuid);

-- Las columnas viejas (flat_fee_amount, retainer_balance) las dejamos por
-- ahora — Drizzle schema las deprecata pero no las borramos en esta
-- migración para que un rollback de código no rompa filas viejas. En una
-- migración futura (0024+) las dropeamos cuando confirmemos que nada las
-- referencia.
