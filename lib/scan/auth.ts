// Shared auth helpers for the scan-ingest worker endpoints.
//
// Why this lives separately from lib/auth/session.ts:
//   - The scan worker is a non-interactive client (no cookies, no user
//     session). It authenticates with a static Bearer token configured per
//     deployment (SCAN_WORKER_API_KEY).
//   - All scan endpoints share the same auth check; centralising it keeps
//     them consistent and makes it easy to rotate / hardening in one place.

import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of the Bearer token in the Authorization header.
 *
 * We compare in constant time to avoid timing side channels, a naive
 * `provided === expected` can leak bytes of the token by measuring response
 * time. timingSafeEqual requires equal-length inputs; we short-circuit on
 * length mismatch (this only leaks length, not bytes).
 */
export function isScanWorkerAuthorized(req: Request): boolean {
  const expected = process.env.SCAN_WORKER_API_KEY;
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

/**
 * Best-effort caller IP for logging and rate limiting. Vercel forwards the
 * original IP in `x-forwarded-for` (comma-separated when there were
 * intermediate proxies; we take the first). Falls back to "unknown".
 */
export function getRemoteIdentifier(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Roles considered "staff", the only ones a scan worker can resolve and
 * ingest documents on behalf of. Portal-cliente users (role='client') are
 * excluded by design: a scan worker should never act as a client receiving
 * documents.
 */
export const SCAN_STAFF_ROLES = [
  "admin",
  "partner",
  "lawyer",
  "paralegal",
  "tester",
] as const;
export type ScanStaffRole = (typeof SCAN_STAFF_ROLES)[number];
