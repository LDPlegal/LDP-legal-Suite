// POST /api/cron/ai-suggestions
//
// Cron-triggered (Vercel Cron, every hour) sweep that:
//   1. Purges expired pending suggestions (status → dismissed).
//   2. Recomputes proactive suggestions for each firm:
//      - stale_case, pending_review, deadline_soon.
//
// Auth: Bearer CRON_SECRET. Vercel Cron sends this automatically when the
// schedule is declared in vercel.json; you can also hit it manually for
// dev (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/ai-suggestions`).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // generous; the work is mostly index lookups

import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { runSuggestionsForAllFirms } from "@/lib/ai/suggestions";
import { purgeExpiredSuggestions } from "@/lib/db/queries/ai-suggestions";

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  let purged = 0;
  let perFirm: Awaited<ReturnType<typeof runSuggestionsForAllFirms>> = [];
  try {
    purged = await purgeExpiredSuggestions();
    perFirm = await runSuggestionsForAllFirms();
  } catch (err) {
    console.error("[cron/ai-suggestions] failed", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  const tookMs = Date.now() - t0;
  console.info("[cron/ai-suggestions] done", {
    tookMs,
    purged,
    firmCount: perFirm.length,
  });
  return NextResponse.json({
    ok: true,
    tookMs,
    purged,
    firmCount: perFirm.length,
    perFirm,
  });
}

// GET para healthcheck/test manual (sin auth: solo dice "alive").
export async function GET() {
  return NextResponse.json({ alive: true, endpoint: "ai-suggestions" });
}
