// POST /api/scan-ingest/resolve-user
//
// Internal endpoint called by the external scan worker before uploading a
// scanned PDF to R2. The worker passes the user's email (read from the
// printer's display / the email-to-scan config) and we return the firmId
// + userId so the worker can build the correct R2 key:
//
//   scans/<firmId>/<userId>/<scanId>.pdf
//
// The main /api/scan-ingest endpoint then validates that the storageKey
// in the payload matches that prefix.
//
// Hardening (Fase 6):
//   - Constant-time Bearer comparison via lib/scan/auth.ts (timing attacks).
//   - Per-IP rate limit via lib/rate-limit.ts (10 req/min per IP).
//   - Filter to active staff users only (no soft-deleted, no clients,
//     no suspended).
//   - Structured logging on every code path for forensics.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { users } from "@/lib/db/schema";
import { resolveUserSchema } from "@/lib/scan/shared-types";
import {
  getRemoteIdentifier,
  isScanWorkerAuthorized,
  SCAN_STAFF_ROLES,
} from "@/lib/scan/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const remoteId = getRemoteIdentifier(req);

  if (!isScanWorkerAuthorized(req)) {
    console.warn("[scan-ingest/resolve-user] unauthorized", { remoteId });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limit per-IP: 10 req/min is well above any legitimate scan volume
  // (a busy office prints ~1 doc/min). If you legitimately need more, bump
  // here or switch the key from IP to token-fingerprint.
  const rl = await checkRateLimit({
    key: `scan-ingest:resolve-user:${remoteId}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    console.warn("[scan-ingest/resolve-user] rate_limited", {
      remoteId,
      count: rl.count,
    });
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const parsed = resolveUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { userEmail } = parsed.data;

  // Case-insensitive lookup via the LOWER(email) functional index added in
  // migration 0013. Filter to active staff only — portal-cliente users
  // (role='client') can't legitimately receive scans, and we don't want
  // soft-deleted or suspended accounts to resolve either.
  const [user] = await adminDb
    .select({ id: users.id, firmId: users.firmId })
    .from(users)
    .where(
      and(
        sql`LOWER(${users.email}) = LOWER(${userEmail})`,
        isNull(users.deletedAt),
        eq(users.status, "active"),
        inArray(
          users.role,
          // SCAN_STAFF_ROLES is `readonly ScanStaffRole[]`; drizzle's
          // inArray wants a mutable array of the enum's literal union.
          [...SCAN_STAFF_ROLES] as Array<"admin" | "partner" | "lawyer" | "paralegal" | "tester">,
        ),
      ),
    )
    .limit(1);

  if (!user) {
    console.info("[scan-ingest/resolve-user] not_found", {
      remoteId,
      userEmail,
    });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  console.info("[scan-ingest/resolve-user] resolved", {
    remoteId,
    userEmail,
    firmId: user.firmId,
    userId: user.id,
  });

  return NextResponse.json({ firmId: user.firmId, userId: user.id });
}
