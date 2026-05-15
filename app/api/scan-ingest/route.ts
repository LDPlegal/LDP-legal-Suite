// POST /api/scan-ingest
//
// Receives a fully-OCR'd scanned PDF from the external scan worker and
// creates a documents row. The PDF itself was uploaded by the worker to
// our R2 bucket under `scans/<firmId>/<userId>/<scanId>.pdf` BEFORE this
// call; this endpoint just registers the metadata.
//
// Flow:
//   1. Worker reads scan from printer (HP M428fdw or Canon MF452dw).
//   2. Worker runs Claude classification → documentType + parties + date.
//   3. Worker uploads PDF to R2 with key `scans/<firmId>/<userId>/<scanId>.pdf`.
//   4. Worker POSTs to /api/scan-ingest with metadata.
//   5. We validate everything and insert into `documents` + `ai_usage`.
//
// Hardening (Fase 6):
//   - Constant-time Bearer (lib/scan/auth.ts).
//   - Rate limit 5 req/min per IP (slower than resolve-user because each
//     call hits R2 + DB).
//   - Re-resolve firmId from userEmail (don't trust client payload).
//   - Storage key must live under `scans/<firmId>/<userId>/` namespace.
//   - PDF magic-byte verification by reading first KB from R2.
//   - Idempotency via documents.scan_id unique partial index.
//   - Cost recomputed from local pricing table (don't trust worker).
//   - Audit log entry on success.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { aiUsage, documents, users } from "@/lib/db/schema";
import { scanIngestSchema } from "@/lib/scan/shared-types";
import {
  getRemoteIdentifier,
  isScanWorkerAuthorized,
  SCAN_STAFF_ROLES,
} from "@/lib/scan/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";
import { logAuditStandalone } from "@/lib/audit/log";

// Anthropic pricing (USD per million tokens). Mirrored from lib/ai/claude.ts.
// Kept here so this route doesn't import the full Anthropic SDK module.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

function computeCostUsd(model: string, inputTokens: number, outputTokens: number): string | null {
  const p = PRICING[model];
  if (!p) return null;
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return cost.toFixed(6);
}

// PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D) at offset 0. Some PDFs
// have a leading whitespace or BOM; accept the magic anywhere in the first
// 1024 bytes to be tolerant of those edge cases.
function isPdfMagic(bytes: Uint8Array): boolean {
  const head = bytes.slice(0, 1024);
  for (let i = 0; i < head.length - 4; i += 1) {
    if (
      head[i] === 0x25 &&
      head[i + 1] === 0x50 &&
      head[i + 2] === 0x44 &&
      head[i + 3] === 0x46 &&
      head[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

export async function POST(req: Request) {
  const remoteId = getRemoteIdentifier(req);

  if (!isScanWorkerAuthorized(req)) {
    console.warn("[scan-ingest] unauthorized", { remoteId });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit({
    key: `scan-ingest:ingest:${remoteId}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    console.warn("[scan-ingest] rate_limited", { remoteId, count: rl.count });
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

  const parsed = scanIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // Re-resolve the user from email — don't trust whatever firmId/userId the
  // worker might have cached. If the user was suspended between resolve and
  // ingest, this fails closed.
  const [user] = await adminDb
    .select({ id: users.id, firmId: users.firmId })
    .from(users)
    .where(
      and(
        sql`LOWER(${users.email}) = LOWER(${payload.userEmail})`,
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
    console.info("[scan-ingest] user not_found", {
      remoteId,
      userEmail: payload.userEmail,
    });
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Defense in depth: storageKey must live in this user's namespace.
  // Prevents a compromised worker from registering documents that point at
  // arbitrary R2 keys (e.g. another firm's data).
  const expectedPrefix = `scans/${user.firmId}/${user.id}/`;
  if (!payload.storageKey.startsWith(expectedPrefix)) {
    console.warn("[scan-ingest] storage_key_mismatch", {
      remoteId,
      userEmail: payload.userEmail,
      storageKey: payload.storageKey,
      expectedPrefix,
    });
    return NextResponse.json(
      { error: "storage_key_mismatch", expectedPrefix },
      { status: 400 },
    );
  }

  // Idempotency: if scanId is present and we already ingested it for this
  // firm, return the existing document. Avoids duplicate inserts on
  // retries from the worker.
  if (payload.scanId) {
    const [existing] = await adminDb
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.firmId, user.firmId),
          eq(documents.scanId, payload.scanId),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      console.info("[scan-ingest] idempotent_hit", {
        remoteId,
        scanId: payload.scanId,
        documentId: existing.id,
      });
      return NextResponse.json(
        { documentId: existing.id, idempotent: true },
        { status: 200 },
      );
    }
  }

  // Verify the PDF in R2 actually exists and has PDF magic bytes. Reading
  // the full file would be expensive; we read once via getStorage.get and
  // check the head. If the file is missing (worker uploaded to wrong key)
  // or not a PDF (worker lied or sent the wrong file), we refuse.
  const storage = getStorage();
  let bytes: Uint8Array;
  try {
    bytes = await storage.get(payload.storageKey);
  } catch (err) {
    console.warn("[scan-ingest] storage_get_failed", {
      remoteId,
      storageKey: payload.storageKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "storage_object_missing" }, { status: 400 });
  }
  if (bytes.byteLength !== payload.sizeBytes) {
    console.warn("[scan-ingest] size_mismatch", {
      remoteId,
      storageKey: payload.storageKey,
      reported: payload.sizeBytes,
      actual: bytes.byteLength,
    });
    return NextResponse.json({ error: "size_mismatch" }, { status: 400 });
  }
  if (!isPdfMagic(bytes)) {
    console.warn("[scan-ingest] not_a_pdf", {
      remoteId,
      storageKey: payload.storageKey,
    });
    return NextResponse.json({ error: "not_a_pdf" }, { status: 400 });
  }

  // Build a friendly name from classification when available, else the file
  // name. Truncate to 200 chars to keep the DB column happy.
  const niceName = payload.classification.documentType
    ? `${payload.classification.documentType}${payload.classification.parties[0] ? ` — ${payload.classification.parties[0]}` : ""}`.slice(
        0,
        200,
      )
    : payload.fileName;

  // Insert the document row. We use adminDb directly because the worker has
  // no session; the firmId is the one we re-resolved from email above, not
  // anything the worker sent.
  const tags = [
    "scan",
    `printer:${payload.sourcePrinter}`,
    ...(payload.classification.documentType
      ? [`type:${payload.classification.documentType.toLowerCase().replace(/\s+/g, "-")}`]
      : []),
  ].slice(0, 8);

  const [doc] = await adminDb
    .insert(documents)
    .values({
      firmId: user.firmId,
      name: niceName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      storageKey: payload.storageKey,
      uploadedBy: user.id,
      tags,
      ocrText: payload.ocrText || null,
      ocrStatus: payload.ocrText ? "done" : "pending",
      scanId: payload.scanId ?? null,
    })
    .returning({ id: documents.id });

  if (!doc) {
    console.error("[scan-ingest] insert_failed", { remoteId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // Recompute cost from our pricing table — worker's `costUsd` is
  // informational only. Falls back to the worker's value if the model
  // isn't in our table (e.g. they're on a newer model).
  const recomputedCost = computeCostUsd(
    payload.aiUsage.model,
    payload.aiUsage.inputTokens,
    payload.aiUsage.outputTokens,
  );
  const costToStore =
    recomputedCost ??
    (Number.isFinite(payload.aiUsage.costUsd)
      ? payload.aiUsage.costUsd.toFixed(6)
      : null);

  await adminDb.insert(aiUsage).values({
    firmId: user.firmId,
    userId: user.id,
    feature: "scan_classify",
    model: payload.aiUsage.model,
    inputTokens: payload.aiUsage.inputTokens,
    outputTokens: payload.aiUsage.outputTokens,
    costUsd: costToStore,
  });

  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.id,
    entityType: "document",
    entityId: doc.id,
    action: "uploaded",
    summary: `Scan ingerido desde ${payload.sourcePrinter}: ${niceName}`,
    diff: {
      scanId: payload.scanId ?? null,
      documentType: payload.classification.documentType,
      parties: payload.classification.parties,
      sourcePrinter: payload.sourcePrinter,
    },
  });

  console.info("[scan-ingest] success", {
    remoteId,
    userEmail: payload.userEmail,
    firmId: user.firmId,
    userId: user.id,
    documentId: doc.id,
    scanId: payload.scanId ?? null,
  });

  return NextResponse.json({ documentId: doc.id, idempotent: false }, { status: 201 });
}
