// POST /api/sync/calendar
//
// Trigger manual de sync para el usuario logueado. Útil después de conectar
// la cuenta o cuando el usuario quiere ver los cambios inmediatamente sin
// esperar el cron diario.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { pullCalendarFromProvider } from "@/lib/calendar/sync";
import { adminDb } from "@/lib/db/admin";
import { calendarIntegrations } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

export async function POST() {
  const user = await requireUser();
  try {
    const summary = await pullCalendarFromProvider(user.userId);
    // Si hubo errores, leemos lastError para mostrarlo al usuario.
    let lastError: string | null = null;
    if (summary.errors > 0) {
      const [row] = await adminDb
        .select({ lastError: calendarIntegrations.lastError })
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.userId, user.userId),
            eq(calendarIntegrations.provider, "microsoft"),
            isNull(calendarIntegrations.disconnectedAt),
          ),
        )
        .limit(1);
      lastError = row?.lastError ?? null;
    }
    revalidatePath("/calendario");
    return NextResponse.json({ ok: true, summary, lastError });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
