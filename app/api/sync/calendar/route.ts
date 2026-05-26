// POST /api/sync/calendar
//
// Trigger manual de sync para el usuario logueado. Útil después de conectar
// la cuenta o cuando el usuario quiere ver los cambios inmediatamente sin
// esperar el cron diario.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { pullCalendarFromProvider } from "@/lib/calendar/sync";
import { adminDb } from "@/lib/db/admin";
import { calendarIntegrations } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";
import { IntegrationTokenUndecryptableError } from "@/lib/oauth/persistence";

/** Mapea errores oscuros del provider a mensajes legibles para el usuario. */
function humanizeError(raw: string): { message: string; needsReconnect: boolean } {
  const m = raw.toLowerCase();
  if (
    m.includes("unable to authenticate data") ||
    m.includes("unsupported state") ||
    m.includes("tokens_undecryptable") ||
    m.includes("aad mismatch")
  ) {
    return {
      message:
        "La conexión con Microsoft expiró por un cambio de seguridad. " +
        "Andá a Configuración → Seguridad → Integraciones y reconectá tu cuenta.",
      needsReconnect: true,
    };
  }
  if (m.includes("not_connected")) {
    return {
      message:
        "No hay cuenta Microsoft conectada. Conectala en Configuración → Seguridad.",
      needsReconnect: true,
    };
  }
  if (m.includes("refresh") && m.includes("fail")) {
    return {
      message:
        "Microsoft rechazó el refresh token. Reconectá la cuenta en Configuración → Seguridad.",
      needsReconnect: true,
    };
  }
  return { message: raw.slice(0, 220), needsReconnect: false };
}

export async function POST() {
  const user = await requireUser();
  try {
    const summary = await pullCalendarFromProvider(user.userId);
    // Si hubo errores, leemos lastError para humanizarlo.
    let lastError: string | null = null;
    let needsReconnect = false;
    if (summary.errors > 0) {
      const [row] = await adminDb
        .select({ lastError: calendarIntegrations.lastError })
        .from(calendarIntegrations)
        .where(
          and(
            eq(calendarIntegrations.userId, user.userId),
            eq(calendarIntegrations.provider, "microsoft"),
          ),
        )
        .limit(1);
      if (row?.lastError) {
        const h = humanizeError(row.lastError);
        lastError = h.message;
        needsReconnect = h.needsReconnect;
      }
    }
    revalidatePath("/calendario");
    return NextResponse.json({ ok: true, summary, lastError, needsReconnect });
  } catch (err) {
    if (err instanceof IntegrationTokenUndecryptableError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La conexión con Microsoft expiró por un cambio de seguridad. " +
            "Reconectá tu cuenta en Configuración → Seguridad.",
          needsReconnect: true,
        },
        { status: 200 }, // 200 para que el front lo trate como respuesta, no como crash
      );
    }
    const msg = err instanceof Error ? err.message : "unknown";
    const h = humanizeError(msg);
    return NextResponse.json(
      { ok: false, error: h.message, needsReconnect: h.needsReconnect },
      { status: 200 },
    );
  }
}
