// GET /api/cron/calendar-sync
//
// Cron diario que tira pull del calendario de cada usuario con
// integración Microsoft activa. Llamado por Vercel Cron según vercel.json.
//
// Auth: bearer CRON_SECRET para evitar que cualquiera lo dispare.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncAllCalendars } from "@/lib/calendar/sync";

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  // Vercel Cron pasa header `x-vercel-cron: 1` Y bearer si está
  // configurado el secret. Aceptamos cualquiera de los 2.
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!isVercelCron && !authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const summaries = await syncAllCalendars();
    const totals = summaries.reduce(
      (a, s) => ({
        pulled: a.pulled + s.pulled,
        skipped: a.skipped + s.skipped,
        errors: a.errors + s.errors,
      }),
      { pulled: 0, skipped: 0, errors: 0 },
    );
    return NextResponse.json({
      ok: true,
      ms: Date.now() - t0,
      integrations: summaries.length,
      totals,
      summaries,
    });
  } catch (err) {
    console.error("[cron/calendar-sync] error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
