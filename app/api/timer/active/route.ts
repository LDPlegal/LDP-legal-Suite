// GET /api/timer/active
// Returns the active timer for the current user (one or none). Used by the
// header client component to render the live timer badge — opening a new
// tab calls this on mount and shows the SAME timer (no duplication, § 9.4).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveTimer, isStale } from "@/lib/db/queries/timers";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ active: null }, { status: 401 });
  const timer = await getActiveTimer(user.firmId, user.userId);
  if (!timer) return NextResponse.json({ active: null });
  return NextResponse.json({
    active: {
      caseId: timer.caseId,
      caseCode: timer.caseCode,
      caseTitle: timer.caseTitle,
      description: timer.description,
      startedAt: timer.startedAt,
      lastHeartbeatAt: timer.lastHeartbeatAt,
      stale: isStale(timer),
    },
  });
}
