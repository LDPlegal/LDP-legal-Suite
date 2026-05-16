// Shared bearer-token auth for cron endpoints (Vercel Cron + manual triggers).
//
// Vercel Cron sends a request to your route with the header
//   Authorization: Bearer <CRON_SECRET>
// We compare in constant time to avoid timing side channels (same pattern
// as lib/scan/auth.ts).

import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = header.slice(7);
  if (provided.length !== expected.length) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
