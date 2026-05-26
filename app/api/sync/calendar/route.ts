// POST /api/sync/calendar
//
// Trigger manual de sync para el usuario logueado. Útil después de conectar
// la cuenta o cuando el usuario quiere ver los cambios inmediatamente sin
// esperar el cron diario.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
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

/** Trae la row más recientemente actualizada del par (user, provider).
 *  Ordenamos por updatedAt DESC para que las disconnected viejas no
 *  pisen la activa o la recién auto-desconectada. */
async function getLatestIntegration(userId: string) {
  const [row] = await adminDb
    .select({
      id: calendarIntegrations.id,
      lastError: calendarIntegrations.lastError,
      disconnectedAt: calendarIntegrations.disconnectedAt,
    })
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, userId),
        eq(calendarIntegrations.provider, "microsoft"),
      ),
    )
    .orderBy(desc(calendarIntegrations.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function POST() {
  const user = await requireUser();

  // Guard explícito: si NO hay integración activa, no hace falta llamar al sync.
  // Esto cubre el caso donde una sync anterior auto-desconectó (decryption error)
  // y ahora el front insiste — devolvemos un needsReconnect claro inmediato.
  const [activeIntegration] = await adminDb
    .select({ id: calendarIntegrations.id })
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, user.userId),
        eq(calendarIntegrations.provider, "microsoft"),
        isNull(calendarIntegrations.disconnectedAt),
      ),
    )
    .limit(1);

  if (!activeIntegration) {
    // ¿Tuvo conexión antes pero está desconectada ahora? → ofrecer reconnect.
    const last = await getLatestIntegration(user.userId);
    if (last && last.disconnectedAt !== null) {
      return NextResponse.json({
        ok: false,
        error:
          "Tu conexión con Microsoft está desconectada. " +
          "Reconectá tu cuenta en Configuración → Seguridad.",
        needsReconnect: true,
      });
    }
    // Nunca conectó.
    return NextResponse.json({
      ok: false,
      error:
        "No tenés Microsoft conectado. Conectalo en Configuración → Seguridad.",
      needsReconnect: true,
    });
  }

  try {
    const summary = await pullCalendarFromProvider(user.userId);
    // Si hubo errores, leemos lastError de la row más recientemente actualizada.
    let lastError: string | null = null;
    let needsReconnect = false;
    if (summary.errors > 0) {
      const row = await getLatestIntegration(user.userId);
      if (row?.lastError) {
        const h = humanizeError(row.lastError);
        lastError = h.message;
        needsReconnect = h.needsReconnect;
      } else {
        // Fallback genérico
        lastError =
          "El sync falló pero no quedó detalle del error. Probá reconectar tu cuenta de Microsoft.";
        needsReconnect = true;
      }
    }
    revalidatePath("/calendario");
    return NextResponse.json({ ok: true, summary, lastError, needsReconnect });
  } catch (err) {
    if (err instanceof IntegrationTokenUndecryptableError) {
      return NextResponse.json({
        ok: false,
        error:
          "La conexión con Microsoft expiró por un cambio de seguridad. " +
          "Reconectá tu cuenta en Configuración → Seguridad.",
        needsReconnect: true,
      });
    }
    const msg = err instanceof Error ? err.message : "unknown";
    const h = humanizeError(msg);
    return NextResponse.json({
      ok: false,
      error: h.message,
      needsReconnect: h.needsReconnect,
    });
  }
}
