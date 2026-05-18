// POST /api/oauth/google/disconnect
// POST /api/oauth/microsoft/disconnect
//
// Botón rojo que pide Gabriel: cualquier socio puede desconectar su
// integración OAuth en un clic, sin pedir permiso al admin.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { disconnectIntegration } from "@/lib/oauth/persistence";
import { requireUser } from "@/lib/auth/session";
import { logAuditStandalone } from "@/lib/audit/log";

export async function POST(
  _req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
  }
  const user = await requireUser();
  await disconnectIntegration(user.userId, provider);
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "user",
    entityId: user.userId,
    action: "updated",
    summary: `Desconectó integración ${provider}`,
    diff: { provider, disconnected: true },
  });
  return NextResponse.json({ ok: true });
}
