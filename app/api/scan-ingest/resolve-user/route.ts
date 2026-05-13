// POST /api/scan-ingest/resolve-user
//
// Internal endpoint called by the scan worker before uploading to S3.
// Returns firmId + userId for a given email so the worker can build the
// correct S3 key (scans/{firmId}/...) before calling the main ingest route.
//
// Auth: Bearer SCAN_WORKER_API_KEY — same token used by /api/scan-ingest.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { users } from "@/lib/db/schema";
import { resolveUserSchema } from "@/lib/scan/shared-types";

function isAuthorized(req: Request): boolean {
  const key = process.env.SCAN_WORKER_API_KEY;
  if (!key) return false;
  return req.headers.get("authorization") === `Bearer ${key}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const [user] = await adminDb
    .select({ id: users.id, firmId: users.firmId })
    .from(users)
    .where(
      and(
        eq(users.email, userEmail.toLowerCase()),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ firmId: user.firmId, userId: user.id });
}
