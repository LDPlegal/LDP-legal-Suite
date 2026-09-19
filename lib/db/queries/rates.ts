// Hourly-rate overrides (Fase 6).
//
// Lookup precedence (most specific first):
//   1. (user, client) , "doctor X cobra Y al cliente Z"
//   2. (user, matter) , "doctor X cobra Y en lo civil"
//   3. (user)         , "doctor X cobra Y a todos"
//   4. fallback to users.hourly_rate
// validFrom / validTo carve historical periods.

import { and, asc, eq, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { rates, users, type Rate } from "../schema";

export async function listRates(
  firmId: string,
  userId: string,
): Promise<
  Array<
    Rate & {
      userName: string | null;
    }
  >
> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select({
        id: rates.id,
        firmId: rates.firmId,
        userId: rates.userId,
        userName: users.name,
        matterType: rates.matterType,
        clientId: rates.clientId,
        hourlyRate: rates.hourlyRate,
        currency: rates.currency,
        notes: rates.notes,
        validFrom: rates.validFrom,
        validTo: rates.validTo,
        createdAt: rates.createdAt,
        updatedAt: rates.updatedAt,
        deletedAt: rates.deletedAt,
      })
      .from(rates)
      .leftJoin(users, eq(users.id, rates.userId))
      .where(isNull(rates.deletedAt))
      .orderBy(asc(rates.userId), asc(rates.matterType), asc(rates.clientId));
    return rows;
  });
}

export async function createRate(
  firmId: string,
  userId: string,
  data: {
    userId: string | null;
    matterType: Rate["matterType"];
    clientId: string | null;
    hourlyRate: string;
    currency: string;
    notes: string | null;
    validFrom: Date;
    validTo: Date | null;
  },
): Promise<Rate> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(rates)
      .values({
        firmId,
        userId: data.userId,
        matterType: data.matterType,
        clientId: data.clientId,
        hourlyRate: data.hourlyRate,
        currency: data.currency,
        notes: data.notes,
        validFrom: data.validFrom,
        validTo: data.validTo,
      })
      .returning();
    if (!row) throw new Error("createRate: insert returned no row");
    return row;
  });
}

export async function softDeleteRate(
  firmId: string,
  userId: string,
  rateId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(rates)
      .set({ deletedAt: new Date() })
      .where(and(eq(rates.id, rateId), isNull(rates.deletedAt)))
      .returning({ id: rates.id });
    return !!row;
  });
}

// Resolve the rate for a specific user × matter × client at a point in time.
// Returns null if no override applies; caller falls back to user.hourlyRate.
export async function resolveRate(
  firmId: string,
  userId: string,
  query: {
    forUserId: string;
    matterType: NonNullable<Rate["matterType"]>;
    clientId: string;
    asOf?: Date;
  },
): Promise<{ hourlyRate: string; currency: string } | null> {
  const asOf = query.asOf ?? new Date();
  return withFirm(firmId, userId, async (tx) => {
    // Single query, server-side precedence via CASE-based ORDER BY.
    // Specificity score: client match = 4, matter match = 2, user match = 1.
    // Higher score wins; ties broken by most-recent validFrom.
    const rows = await tx
      .select({
        id: rates.id,
        hourlyRate: rates.hourlyRate,
        currency: rates.currency,
        userId: rates.userId,
        matterType: rates.matterType,
        clientId: rates.clientId,
        validFrom: rates.validFrom,
      })
      .from(rates)
      .where(
        and(
          isNull(rates.deletedAt),
          // Active at `asOf`: validFrom <= asOf AND (validTo IS NULL OR validTo > asOf)
          lte(rates.validFrom, asOf),
          or(isNull(rates.validTo), sql`${rates.validTo} > ${asOf}`),
          // user filter: matches forUserId OR is NULL (firm-wide)
          or(eq(rates.userId, query.forUserId), isNull(rates.userId)) as SQL<unknown>,
          // matter filter: matches OR NULL
          or(eq(rates.matterType, query.matterType), isNull(rates.matterType)) as SQL<unknown>,
          // client filter: matches OR NULL
          or(eq(rates.clientId, query.clientId), isNull(rates.clientId)) as SQL<unknown>,
        ),
      );
    if (rows.length === 0) return null;
    // Compute specificity score in JS, clearer than SQL CASE for review.
    let best: (typeof rows)[number] | null = null;
    let bestScore = -1;
    for (const r of rows) {
      const score =
        (r.clientId ? 4 : 0) + (r.matterType ? 2 : 0) + (r.userId ? 1 : 0);
      if (
        score > bestScore ||
        (score === bestScore &&
          best &&
          r.validFrom.getTime() > best.validFrom.getTime())
      ) {
        best = r;
        bestScore = score;
      }
    }
    return best ? { hourlyRate: best.hourlyRate, currency: best.currency } : null;
  });
}
