// CRUD for ncf_counters (NCF range configuration). Used by /configuracion.

import { and, asc, eq, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { ncfCounters } from "../schema";
import type { NcfType } from "@/lib/invoicing/ncf";

export type NcfRangeRow = {
  ncfType: NcfType;
  rangeStart: number;
  rangeEnd: number;
  lastSeq: number;
  expiresOn: Date | null;
  updatedAt: Date;
};

export async function listNcfRanges(firmId: string, userId: string): Promise<NcfRangeRow[]> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(ncfCounters)
      .where(eq(ncfCounters.firmId, firmId))
      .orderBy(asc(ncfCounters.ncfType));
    return rows.map((r) => ({
      ncfType: r.ncfType as NcfType,
      rangeStart: r.rangeStart,
      rangeEnd: r.rangeEnd,
      lastSeq: r.lastSeq,
      expiresOn: r.expiresOn,
      updatedAt: r.updatedAt,
    }));
  });
}

export async function upsertNcfRange(
  firmId: string,
  userId: string,
  input: {
    ncfType: NcfType;
    rangeStart: number;
    rangeEnd: number;
    expiresOn: Date | null;
  },
): Promise<void> {
  if (input.rangeEnd < input.rangeStart) {
    throw new Error("El fin del rango debe ser >= al inicio.");
  }
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .insert(ncfCounters)
      .values({
        firmId,
        ncfType: input.ncfType,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        // last_seq starts at rangeStart - 1 so the first assignment returns rangeStart.
        lastSeq: input.rangeStart - 1,
        expiresOn: input.expiresOn,
      })
      .onConflictDoUpdate({
        target: [ncfCounters.firmId, ncfCounters.ncfType],
        set: {
          rangeStart: input.rangeStart,
          rangeEnd: input.rangeEnd,
          // Keep the old last_seq if it still falls in the new range; otherwise reset.
          lastSeq: sql`CASE WHEN ${ncfCounters.lastSeq} >= ${input.rangeStart - 1} AND ${ncfCounters.lastSeq} < ${input.rangeEnd} THEN ${ncfCounters.lastSeq} ELSE ${input.rangeStart - 1} END`,
          expiresOn: input.expiresOn,
          updatedAt: new Date(),
        },
      });
  });
}

export async function deleteNcfRange(
  firmId: string,
  userId: string,
  ncfType: NcfType,
): Promise<void> {
  await withFirm(firmId, userId, async (tx) => {
    await tx
      .delete(ncfCounters)
      .where(and(eq(ncfCounters.firmId, firmId), eq(ncfCounters.ncfType, ncfType)));
  });
}

