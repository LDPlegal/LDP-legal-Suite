// SQL-backed sliding-window rate limiter.
//
// Why SQL and not Redis: avoids a second piece of infra for the volume we
// have. One atomic UPSERT per call. Postgres handles thousands of these per
// second easily; if traffic grows past that, swap to Upstash with the same
// `checkRateLimit()` signature.
//
// Semantics:
//   - One row per `key` in `rate_limits`.
//   - First call inserts (count=1, window_start=now()).
//   - Subsequent calls within the window increment count.
//   - When window expires, the next call resets to (count=1, window=now()).
//   - Returns { ok, remaining, retryAfterSeconds } so the caller can set
//     proper 429 headers.
//
// Identifier convention for keys: `<feature>:<sub>:<identifier>`, e.g.
// "scan-ingest:resolve-user:203.0.113.5". Keep them deterministic so the
// counter survives across requests.

import "server-only";
import { sql } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";

export type RateLimitResult = {
  ok: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
};

export async function checkRateLimit(opts: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const result = await adminDb.execute(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${opts.key}, 1, now())
    ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => ${opts.windowSeconds})
        THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => ${opts.windowSeconds})
        THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count, window_start
  `);

  const row = result.rows[0] as { count: number; window_start: Date } | undefined;
  if (!row) {
    // Should be impossible, INSERT…RETURNING always emits a row. Fail open
    // (allow request) rather than crash.
    return {
      ok: true,
      count: 1,
      remaining: opts.limit - 1,
      retryAfterSeconds: 0,
    };
  }

  const count = Number(row.count);
  const elapsedMs = Date.now() - new Date(row.window_start).getTime();
  const windowMs = opts.windowSeconds * 1000;
  const retryAfterSeconds = Math.max(0, Math.ceil((windowMs - elapsedMs) / 1000));

  return {
    ok: count <= opts.limit,
    count,
    remaining: Math.max(0, opts.limit - count),
    retryAfterSeconds,
  };
}
