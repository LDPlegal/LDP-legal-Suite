// POST /api/sync/calendar
//
// Trigger manual de sync para el usuario logueado. Útil después de conectar
// la cuenta o cuando el usuario quiere ver los cambios inmediatamente sin
// esperar el cron diario.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { pullCalendarFromProvider } from "@/lib/calendar/sync";
import { revalidatePath } from "next/cache";

export async function POST() {
  const user = await requireUser();
  try {
    const summary = await pullCalendarFromProvider(user.userId);
    revalidatePath("/calendario");
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
