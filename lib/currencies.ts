// Monedas soportadas en los honorarios de los casos. Modelo simplificado
// pedido por LDP: solo 3 opciones — DÓLAR, PESO, o AMBOS. "Ambos" significa
// que UNA misma línea de honorario tiene componente en USD y componente en
// DOP (ej. firma cobra US$1000 + RD$50000 por un trabajo combinado).
//
// La elección "Ambos" no es una moneda en sí — es un MODO de carga. En la
// DB se guardan amount_usd y amount_dop como columnas separadas (ambas
// nullable). El UI decide cuál(es) inputs mostrar.

export type CaseFeeCurrencyMode = "USD" | "DOP" | "BOTH";

export const CASE_FEE_CURRENCY_MODE_LABEL: Record<CaseFeeCurrencyMode, string> = {
  USD: "Dólar",
  DOP: "Peso",
  BOTH: "Dólar y Peso",
};

export const CASE_FEE_CURRENCY_MODES: CaseFeeCurrencyMode[] = ["USD", "DOP", "BOTH"];

/** Símbolo por código. Útil para mostrar montos. */
export function currencySymbol(code: "USD" | "DOP"): string {
  return code === "USD" ? "US$" : "RD$";
}

/** Formato listo para mostrar — "US$ 1,000.00" / "RD$ 50,000.00". */
export function formatMoneyWithSymbol(
  amount: string | number | null,
  code: "USD" | "DOP",
): string {
  if (amount === null) return `${currencySymbol(code)} —`;
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(n)) return `${currencySymbol(code)} —`;
  const formatted = new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${currencySymbol(code)} ${formatted}`;
}

/** Renderiza un honorario completo, mostrando ambos montos si están presentes.
 *  Ej. "US$ 1,000.00 + RD$ 50,000.00" o solo uno si el otro es null. */
export function formatFeeAmounts(
  amountUsd: string | null,
  amountDop: string | null,
): string {
  const parts: string[] = [];
  if (amountUsd !== null) parts.push(formatMoneyWithSymbol(amountUsd, "USD"));
  if (amountDop !== null) parts.push(formatMoneyWithSymbol(amountDop, "DOP"));
  return parts.join(" + ") || "—";
}
