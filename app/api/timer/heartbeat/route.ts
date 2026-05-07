// POST /api/timer/heartbeat
// Updates the active timer's `last_heartbeat_at` to NOW(). Called from the
// client every 30s while a timer is active. Per § 9.4, if no heartbeat for
// > 15min the timer is treated as stale at the next visit.
//
// Returns { ok: true } if a timer was updated, { ok: false } if there was no
// active timer (idempotent — safe to send heartbeats from a tab that lost
// the timer in the meantime).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { heartbeatTimer } from "@/lib/db/queries/timers";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await heartbeatTimer(user.firmId, user.userId);
  return NextResponse.json(result);
}
