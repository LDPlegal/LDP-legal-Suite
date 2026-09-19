// lib/invoicing/calculate.ts
//
// Pure calculation helpers for invoices. The DB stores the resolved totals
// on the invoice header (subtotal / itbis_amount / isr_withholding_amount /
// total / balance) and we recompute every time the line items or payments
// change. Fixed-point arithmetic via numeric strings → number → toFixed(2)
// keeps the rounding behavior consistent with what react-pdf will render.
//
// What's IN this module (Fase 2):
//   * ITBIS por línea con tax_rate por defecto 0.18 (configurable a 0).
//   * Retención ISR 10% a nivel de factura (toggle, típicamente true para
//     clientes persona jurídica que retienen al firm).
//   * Resta de pagos contra el total para producir el balance.
// Lo que NO está aún (Fase 2.5+):
//   * Retención ITBIS 30% por servicios profesionales, requiere distinguir
//     servicios vs bienes a nivel de línea, lo difiero (DECISIONS.md F2.X).
//   * Modo fiscal con NCF/e-CF, tabla soporta los campos pero la emisión
//     real con la DGII queda fuera. Por ahora ncf=NULL y los PDFs se
//     emiten como "Factura interna, no válida para fines fiscales".

export type LineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number; // 0..1, e.g. 0.18 for ITBIS
  sourceType: "time_entry" | "expense" | "manual";
  sourceId: string | null;
};

export type ComputedLine = LineInput & {
  amount: number; // quantity * unit_price
  taxAmount: number; // amount * tax_rate (rounded to 2dp)
};

export type InvoiceTotals = {
  lines: ComputedLine[];
  subtotal: number;
  itbisAmount: number;
  isrWithholdingAmount: number;
  itbisWithholdingAmount: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeLines(lines: LineInput[]): ComputedLine[] {
  return lines.map((l) => {
    const amount = round2(l.quantity * l.unitPrice);
    const taxAmount = round2(amount * l.taxRate);
    return { ...l, amount, taxAmount };
  });
}

export function computeTotals(
  lines: LineInput[],
  options: { isrWithholding?: boolean; itbisWithholding?: boolean } = {},
): InvoiceTotals {
  const computed = computeLines(lines);
  const subtotal = round2(computed.reduce((acc, l) => acc + l.amount, 0));
  const itbisAmount = round2(computed.reduce((acc, l) => acc + l.taxAmount, 0));
  const isrWithholdingAmount = options.isrWithholding ? round2(subtotal * 0.1) : 0;
  // ITBIS withholding is documented as Fase 2.5, keep field at 0 for now.
  const itbisWithholdingAmount = options.itbisWithholding ? round2(itbisAmount * 0.3) : 0;
  const total = round2(subtotal + itbisAmount - isrWithholdingAmount - itbisWithholdingAmount);
  return {
    lines: computed,
    subtotal,
    itbisAmount,
    isrWithholdingAmount,
    itbisWithholdingAmount,
    total,
  };
}

export function computeBalance(total: number, paidSoFar: number): number {
  return Math.max(0, round2(total - paidSoFar));
}

// Convert a Decimal/numeric string from drizzle (`"180000.00"`) to a number
// for arithmetic. Drizzle returns decimals as strings to preserve precision.
export function num(s: string | number | null | undefined): number {
  if (s == null) return 0;
  const n = typeof s === "number" ? s : Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(amount: number, currency = "DOP"): string {
  return `${currency} ${amount.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
