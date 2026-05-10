// GET /api/calendario/export.ics
// Streams an .ics calendar of upcoming events the current user can see.
// Per maestro § 9.5: dates emitted in UTC (DTSTAMP / DTSTART / DTEND end with Z).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listEventsInRange } from "@/lib/db/queries/events";
import { buildIcs } from "@/lib/db/queries/expenses";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Portal-cliente users get only the events of their own cases via
  // /portal/casos/[id] (event lists) and would see far too much here. Block
  // them; they have no equivalent firm-wide export.
  if (user.role === "client") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Range: 90 days back to 365 days forward — matches a typical cal client window.
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 90);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 365);

  const evts = await listEventsInRange(user.firmId, user.userId, { start, end });
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
      "Content-Disposition": 'attachment; filename="ldp-legal-suite.ics"',
    },
  });
}
