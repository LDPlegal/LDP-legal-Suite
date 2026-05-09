// Minimal RFC 5545 parser sufficient for ingesting external calendars.
// We DON'T support recurrence (RRULE), VTIMEZONE, alarms, or attachments —
// those are out of scope for Fase 4.3. If a feed contains them, we ignore
// the unsupported properties and keep the simple events.
//
// Why hand-rolled instead of pulling `ical.js` / `node-ical`: those add 400KB+
// to a serverless bundle for ~30 lines of useful logic. We accept some
// limitations in exchange for zero dependency cost.

export type ParsedIcsEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
};

// RFC 5545 line unfolding: a CRLF followed by a single space/tab is a soft
// break. Reverse it before parsing properties.
function unfold(text: string): string[] {
  // Normalise CRLF / LF / CR.
  const normalised = text.replace(/\r\n|\r/g, "\n");
  const out: string[] = [];
  for (const line of normalised.split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] = (out[out.length - 1] ?? "") + line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.filter((l) => l.length > 0);
}

// Strip TZID/VALUE prefixes from property keys: "DTSTART;TZID=America/...:..." -> "DTSTART"
function propKey(line: string): { key: string; params: Record<string, string>; value: string } | null {
  const colonAt = line.indexOf(":");
  if (colonAt === -1) return null;
  const lhs = line.slice(0, colonAt);
  const value = line.slice(colonAt + 1);
  const parts = lhs.split(";");
  const key = (parts[0] ?? "").toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { key, params, value };
}

function unescapeIcs(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Parse "20260513T140000Z" (UTC), "20260513T140000" (floating local —
// treated as UTC; users can fix tzs from the UI), or "20260513" (all-day).
function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  const v = value.trim();
  // Date-only: YYYYMMDD
  if (/^\d{8}$/u.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    return { date: new Date(Date.UTC(y, m, d, 0, 0, 0)), allDay: true };
  }
  // Date-time: YYYYMMDDTHHMMSS[Z]
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/u);
  if (m) {
    const [, ys, mo, ds, hs, mi, ss] = m;
    const date = new Date(
      Date.UTC(
        Number(ys),
        Number(mo) - 1,
        Number(ds),
        Number(hs),
        Number(mi),
        Number(ss),
      ),
    );
    return { date, allDay: false };
  }
  return null;
}

export function parseIcs(text: string): ParsedIcsEvent[] {
  const lines = unfold(text);
  const out: ParsedIcsEvent[] = [];
  let inEvent = false;
  let cur: Partial<ParsedIcsEvent> & {
    start?: Date;
    end?: Date;
    allDay?: boolean;
  } = {};
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      if (
        cur.uid &&
        cur.summary &&
        cur.start instanceof Date &&
        cur.end instanceof Date
      ) {
        out.push({
          uid: cur.uid,
          summary: cur.summary,
          description: cur.description ?? null,
          location: cur.location ?? null,
          start: cur.start,
          end: cur.end,
          allDay: cur.allDay ?? false,
        });
      }
      continue;
    }
    if (!inEvent) continue;
    const parsed = propKey(line);
    if (!parsed) continue;
    const { key, value } = parsed;
    switch (key) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.summary = unescapeIcs(value);
        break;
      case "DESCRIPTION":
        cur.description = unescapeIcs(value);
        break;
      case "LOCATION":
        cur.location = unescapeIcs(value);
        break;
      case "DTSTART": {
        const d = parseIcsDate(value);
        if (d) {
          cur.start = d.date;
          cur.allDay = d.allDay;
        }
        break;
      }
      case "DTEND": {
        const d = parseIcsDate(value);
        if (d) cur.end = d.date;
        break;
      }
    }
  }
  return out;
}
