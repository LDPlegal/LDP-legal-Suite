// GET /api/calendario/feed/<token>.ics
//
// Public ICS feed for external calendar clients to subscribe (Outlook, Google,
// Apple Calendar). Anyone with the token URL can read; we treat the token as
// a bearer secret. Users can rotate it from /calendario when they suspect
// leakage.
//
// We DO NOT require a session here (subscribers are headless cal clients,
// not authenticated browsers). We DO use the admin connection to look up
// the user, then pass through withFirm using THAT user's identity to
// enforce RLS on the actual event read.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { listEventsInRange } from "@/lib/db/queries/events";
import { buildIcs } from "@/lib/db/queries/expenses";
import { users } from "@/lib/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: tokenParam } = await params;
  // The route file is named [token] but Outlook subscriptions typically
  // append `.ics`; accept both /feed/<tok> and /feed/<tok>.ics.
  const token = tokenParam.endsWith(".ics") ? tokenParam.slice(0, -4) : tokenParam;
  if (!token || token.length < 16) {
    return new NextResponse("invalid token", { status: 400 });
  }

  // Look up the user by token via admin connection (no session context).
  const [user] = await adminDb
    .select({ id: users.id, firmId: users.firmId })
    .from(users)
    .where(eq(users.icalToken, token))
    .limit(1);
  if (!user) return new NextResponse("not found", { status: 404 });

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 90);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 365);

  const evts = await listEventsInRange(user.firmId, user.id, { start, end });
  const ics = buildIcs(
    evts.map((e) => ({
      icalUid: `${e.id}@ldp-legal-suite`,
      title: e.title,
      description: e.description,
      location: e.location,
      startAt: e.startAt,
      endAt: e.endAt,
      allDay: e.allDay,
    })),
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Cache 5 min, most clients respect this and back off, reducing load.
      "Cache-Control": "public, max-age=300",
    },
  });
}
