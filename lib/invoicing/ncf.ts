// lib/invoicing/ncf.ts
//
// NCF (Numeración de Comprobante Fiscal) helpers for the Dominican Republic.
// Format used by DGII since 2018: 11 characters total — a 3-character type
// prefix (B01, B02, E31, E32) followed by an 8-digit sequential. Examples:
//   B0100000001 — Comprobante de crédito fiscal (paper, persona jurídica)
//   B0200000001 — Comprobante consumidor final (paper, persona física)
//   E3100000001 — e-CF crédito fiscal (electrónico)
//   E3200000001 — e-CF consumidor final (electrónico)
//
// Maestro § 9.3: el sistema soporta los cuatro tipos. La emisión real a la
// DGII (envío del XML del e-CF y manejo del TrackId) NO está implementada
// — eso queda para Fase 4 o un proveedor externo (Mercury, eFacturador,
// etc.). Lo que SÍ hace el sistema:
//   * Asigna NCFs atómicamente desde rangos configurados por el firm.
//   * Imprime/exporta facturas con NCF válido en el PDF para que el
//     cliente las use como soporte de crédito fiscal.
//
// Una sola fila por (firm_id, ncf_type) en `ncf_counters`. Cuando la DGII
// asigna un nuevo rango al firm, se actualiza esa fila (rango_inicio /
// rango_fin / last_seq). NCFs ya emitidos NO cambian — viven en
// `invoices.ncf` permanentemente.

import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Tx } from "../db/with-firm";
import { ncfCounters } from "../db/schema";

export type NcfType = "B01" | "B02" | "E31" | "E32";

export const NCF_TYPE_LABEL: Record<NcfType, string> = {
  B01: "B01 — Crédito fiscal (papel)",
  B02: "B02 — Consumidor final (papel)",
  E31: "E31 — e-CF crédito fiscal (electrónico)",
  E32: "E32 — e-CF consumidor final (electrónico)",
};

export const NCF_TYPE_SHORT: Record<NcfType, string> = {
  B01: "Crédito fiscal",
  B02: "Consumidor final",
  E31: "e-CF crédito fiscal",
  E32: "e-CF consumidor final",
};

/** Returns the formatted NCF, e.g. "B0100000001". */
export function formatNcf(type: NcfType, seq: number): string {
  if (seq <= 0) throw new Error(`formatNcf: invalid seq ${seq}`);
  return `${type}${seq.toString().padStart(8, "0")}`;
}

/** Validates DGII NCF shape: 3-char type + 8-digit seq, total 11 chars. */
export function isValidNcfFormat(ncf: string): boolean {
  return /^(B01|B02|E31|E32)\d{8}$/.test(ncf);
}

export class NcfAssignmentError extends Error {
  readonly code: "NO_RANGE" | "EXHAUSTED" | "EXPIRED";
  constructor(code: "NO_RANGE" | "EXHAUSTED" | "EXPIRED", message: string) {
    super(message);
    this.code = code;
    this.name = "NcfAssignmentError";
  }
}

/**
 * Atomically assigns the next NCF for the given firm + type. Throws a typed
 * error when the range is unconfigured / exhausted / expired so the caller
 * can show a precise message.
 *
 * Race-safe via a single UPDATE with the seq guard in the WHERE clause —
 * if no row matches (range exhausted or expired), the UPDATE returns no rows
 * and we report the right error after a follow-up read.
 */
export async function assignNcf(tx: Tx, firmId: string, ncfType: NcfType): Promise<string> {
  const [row] = await tx
    .update(ncfCounters)
    .set({ lastSeq: sql`${ncfCounters.lastSeq} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(ncfCounters.firmId, firmId),
        eq(ncfCounters.ncfType, ncfType),
        sql`${ncfCounters.lastSeq} < ${ncfCounters.rangeEnd}`,
        or(isNull(ncfCounters.expiresOn), sql`${ncfCounters.expiresOn} > now()`),
      ),
    )
    .returning({ lastSeq: ncfCounters.lastSeq, rangeEnd: ncfCounters.rangeEnd });

  if (row) {
    return formatNcf(ncfType, row.lastSeq);
  }

  // The atomic update didn't match — diagnose why so the user gets a precise
  // error (range not configured vs exhausted vs expired).
  const [existing] = await tx
    .select({
      lastSeq: ncfCounters.lastSeq,
      rangeEnd: ncfCounters.rangeEnd,
      expiresOn: ncfCounters.expiresOn,
    })
    .from(ncfCounters)
    .where(and(eq(ncfCounters.firmId, firmId), eq(ncfCounters.ncfType, ncfType)))
    .limit(1);

  if (!existing) {
    throw new NcfAssignmentError(
      "NO_RANGE",
      `No hay rango NCF configurado para ${ncfType}. Configúralo en /configuracion → Fiscal.`,
    );
  }
  if (existing.expiresOn && existing.expiresOn.getTime() <= Date.now()) {
    throw new NcfAssignmentError(
      "EXPIRED",
      `El rango NCF para ${ncfType} venció el ${existing.expiresOn.toLocaleDateString("es-DO")}. Carga un rango nuevo en Configuración → Fiscal.`,
    );
  }
  throw new NcfAssignmentError(
    "EXHAUSTED",
    `El rango NCF para ${ncfType} está agotado (último usado: ${existing.lastSeq}, fin: ${existing.rangeEnd}). Carga un rango nuevo.`,
  );
}
