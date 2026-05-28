// GET /api/debug/my-integrations
//
// Endpoint TEMPORAL de diagnóstico — devuelve qué ve el server cuando
// pregunta "¿qué integraciones tiene este usuario?". Usado para destrabar
// el caso donde la DB tiene una integración activa pero el sync route
// dice "No tenés Microsoft conectado".
//
// QUITAR este endpoint una vez resuelto.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/admin";
import { calendarIntegrations } from "@/lib/db/schema";

export async function GET() {
  const user = await requireUser();

  // 1. Qué ve requireUser() en la sesión
  const session = {
    userId: user.userId,
    firmId: user.firmId,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  // 2. TODAS las integraciones de este userId (con o sin disconnected_at)
  const allRows = await adminDb
    .select()
    .from(calendarIntegrations)
    .where(eq(calendarIntegrations.userId, user.userId));

  // 3. La query exacta que usa el sync route
  const syncQueryResult = await adminDb
    .select({
      id: calendarIntegrations.id,
      provider: calendarIntegrations.provider,
      externalAccountId: calendarIntegrations.externalAccountId,
      disconnectedAt: calendarIntegrations.disconnectedAt,
    })
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, user.userId),
        eq(calendarIntegrations.provider, "microsoft"),
        isNull(calendarIntegrations.disconnectedAt),
      ),
    );

  return NextResponse.json({
    session,
    allIntegrationsForThisUser: allRows.map((r) => ({
      id: r.id,
      provider: r.provider,
      externalAccountId: r.externalAccountId,
      disconnectedAt: r.disconnectedAt,
      hasAccessToken: r.accessToken !== null,
      hasRefreshToken: r.refreshToken !== null,
      hasCipher: r.accessTokenCipher !== null,
      lastSyncAt: r.lastSyncAt,
      lastError: r.lastError,
      updatedAt: r.updatedAt,
    })),
    syncRouteWouldFind: syncQueryResult,
  });
}
