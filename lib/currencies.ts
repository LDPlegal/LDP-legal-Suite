// Monedas soportadas en la app. Lista preconfigurada — no aceptamos cualquier
// código ISO para evitar typos y mantener consistencia en reportes. Si una
// firma necesita una moneda exótica, se agrega acá.
//
// Las 3 primeras (DOP, USD, EUR) cubren el 99% del uso real en RD. Las demás
// están por completitud para clientes internacionales y la firma misma cuando
// factura en LATAM/Europa/USA.

export const CURRENCIES = [
  { code: "DOP", label: "Peso Dominicano", symbol: "RD$" },
  { code: "USD", label: "Dólar Estadounidense", symbol: "US$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "Libra Esterlina", symbol: "£" },
  { code: "CHF", label: "Franco Suizo", symbol: "CHF" },
  { code: "CAD", label: "Dólar Canadiense", symbol: "CA$" },
  { code: "MXN", label: "Peso Mexicano", symbol: "MX$" },
  { code: "COP", label: "Peso Colombiano", symbol: "COL$" },
  { code: "ARS", label: "Peso Argentino", symbol: "AR$" },
  { code: "BRL", label: "Real Brasileño", symbol: "R$" },
  { code: "CLP", label: "Peso Chileno", symbol: "CL$" },
  { code: "PEN", label: "Sol Peruano", symbol: "S/" },
  { code: "VES", label: "Bolívar Venezolano", symbol: "Bs" },
  { code: "JPY", label: "Yen Japonés", symbol: "¥" },
  { code: "CNY", label: "Yuan Chino", symbol: "¥" },
  { code: "AUD", label: "Dólar Australiano", symbol: "AU$" },
  { code: "ZAR", label: "Rand Sudafricano", symbol: "R" },
  { code: "PAB", label: "Balboa Panameño", symbol: "B/." },
  { code: "CRC", label: "Colón Costarricense", symbol: "₡" },
  { code: "HTG", label: "Gourde Haitiano", symbol: "G" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as CurrencyCode[];

/** Lookup helper — symbol or fallback to code. */
export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

/** Formato listo para mostrar — "RD$ 50,000.00" / "US$ 1,500.00".
 *  Renombrado a formatMoneyWithSymbol para no chocar con el formatMoney
 *  existente en lib/invoicing/calculate.ts que usa el código (no el símbolo). */
export function formatMoneyWithSymbol(amount: string | number, currency: string): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(n)) return `${currencySymbol(currency)} —`;
  // Intl.NumberFormat con DOP a veces tira "DOP" en lugar del símbolo según
  // el browser. Usamos formato manual con grouping para tener control total.
  const formatted = new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${currencySymbol(currency)} ${formatted}`;
}
