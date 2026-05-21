// F7+ Bloque 5 — Wrapper de Microsoft Graph API.
//
// Maneja:
//   - Obtener access token válido (auto-refresh si expiró).
//   - Calls a /me/* (delegated) con bearer.
//   - Retry de 1 vez en 401 (token revocado mid-request).
//   - Throttle handling (429 → respect Retry-After).
//   - Paginación (@odata.nextLink).
//
// Endpoints que usamos:
//   - GET /me → perfil del usuario.
//   - GET /me/calendar/events?$filter=... → listar eventos.
//   - POST /me/calendar/events → crear evento.
//   - PATCH /me/events/{id} → actualizar evento.
//   - DELETE /me/events/{id} → eliminar evento.
//   - POST /me/sendMail → enviar correo.
//   - GET /me/messages → leer inbox (opt-in).

import "server-only";
import { getValidAccessToken } from "./persistence";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class MicrosoftGraphError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "MicrosoftGraphError";
  }
}

// Low-level fetch. Maneja auth + retry de 401. NO maneja paginación —
// los helpers de arriba la implementan según el endpoint.
async function graphFetch(
  userId: string,
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const tokens = await getValidAccessToken(userId, "microsoft");
  if (!tokens) {
    throw new MicrosoftGraphError(401, "not_connected", "El usuario no tiene Microsoft conectado.");
  }
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${tokens.accessToken}`,
    Accept: "application/json",
    ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
  let res = await fetch(url, { ...init, headers, body });
  // Si el token fue revocado entre que lo leímos y la call, intentamos
  // refresh y un retry. getValidAccessToken ya refresca cuando faltan <2min,
  // pero alguna race window puede dejar pasar un token muerto.
  if (res.status === 401) {
    const retried = await getValidAccessToken(userId, "microsoft");
    if (retried && retried.accessToken !== tokens.accessToken) {
      headers.Authorization = `Bearer ${retried.accessToken}`;
      res = await fetch(url, { ...init, headers, body });
    }
  }
  // Throttling: respect Retry-After si la API lo manda.
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "1", 10);
    throw new MicrosoftGraphError(
      429,
      "throttled",
      `Microsoft Graph throttled — wait ${retryAfter}s`,
      retryAfter,
    );
  }
  return res;
}

async function graphFetchJson<T>(
  userId: string,
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const res = await graphFetch(userId, path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let code = "unknown";
    let message = `Graph ${res.status}`;
    try {
      const json = JSON.parse(text) as { error?: { code?: string; message?: string } };
      code = json.error?.code ?? code;
      message = json.error?.message ?? message;
    } catch {
      // not JSON — keep raw text in message
      message = text.slice(0, 300) || message;
    }
    throw new MicrosoftGraphError(res.status, code, message);
  }
  // 204 No Content (DELETE, etc.) → null
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

// ============================================================================
// Profile
// ============================================================================

export type GraphUserProfile = {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
};

export async function getProfile(userId: string): Promise<GraphUserProfile> {
  return graphFetchJson<GraphUserProfile>(userId, "/me");
}

// ============================================================================
// Calendar
// ============================================================================

export type GraphCalendarEvent = {
  id: string;
  subject: string;
  bodyPreview: string;
  body?: { contentType: "html" | "text"; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  isAllDay: boolean;
  isCancelled: boolean;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  attendees?: Array<{
    type: string;
    status: { response: string; time: string };
    emailAddress: { name?: string; address?: string };
  }>;
  iCalUId: string;
  lastModifiedDateTime: string;
  changeKey: string;
};

// Lista eventos del calendario entre start y end. Usa /me/calendarView
// en vez de /me/events porque:
//   1. calendarView funciona igual en cuentas work y personal de
//      Microsoft (events tiene quirks de filtro en personal).
//   2. Expande series recurrentes (cada instancia se devuelve por
//      separado), que es lo que un calendario espera mostrar.
//   3. Maneja zona horaria via header Prefer.
export async function listCalendarEvents(
  userId: string,
  range: { from: Date; to: Date },
): Promise<GraphCalendarEvent[]> {
  const params = new URLSearchParams({
    startDateTime: range.from.toISOString(),
    endDateTime: range.to.toISOString(),
    $orderby: "start/dateTime",
    $top: "100",
  });
  const events: GraphCalendarEvent[] = [];
  let url: string | null = `/me/calendarView?${params.toString()}`;
  while (url) {
    const page: {
      value: GraphCalendarEvent[];
      "@odata.nextLink"?: string;
    } = await graphFetchJson(userId, url, {
      headers: { Prefer: 'outlook.timezone="UTC"' },
    });
    events.push(...page.value);
    url = page["@odata.nextLink"] ?? null;
    if (events.length > 500) break; // safety cap
  }
  return events;
}

export type CreateEventInput = {
  subject: string;
  body?: string;
  startUtc: Date;
  endUtc: Date;
  location?: string;
  attendees?: Array<{ email: string; name?: string }>;
  allDay?: boolean;
};

export async function createCalendarEvent(
  userId: string,
  input: CreateEventInput,
): Promise<GraphCalendarEvent> {
  const payload: Record<string, unknown> = {
    subject: input.subject,
    body: input.body
      ? { contentType: "text", content: input.body }
      : undefined,
    start: { dateTime: input.startUtc.toISOString(), timeZone: "UTC" },
    end: { dateTime: input.endUtc.toISOString(), timeZone: "UTC" },
    location: input.location ? { displayName: input.location } : undefined,
    attendees: input.attendees?.map((a) => ({
      emailAddress: { address: a.email, name: a.name },
      type: "required",
    })),
    isAllDay: input.allDay ?? false,
  };
  return graphFetchJson<GraphCalendarEvent>(userId, "/me/calendar/events", {
    method: "POST",
    json: payload,
  });
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  patch: Partial<CreateEventInput>,
): Promise<GraphCalendarEvent> {
  const payload: Record<string, unknown> = {};
  if (patch.subject !== undefined) payload.subject = patch.subject;
  if (patch.body !== undefined) payload.body = { contentType: "text", content: patch.body };
  if (patch.startUtc) payload.start = { dateTime: patch.startUtc.toISOString(), timeZone: "UTC" };
  if (patch.endUtc) payload.end = { dateTime: patch.endUtc.toISOString(), timeZone: "UTC" };
  if (patch.location !== undefined) payload.location = { displayName: patch.location };
  return graphFetchJson<GraphCalendarEvent>(userId, `/me/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    json: payload,
  });
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  await graphFetchJson(userId, `/me/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}

// ============================================================================
// Mail
// ============================================================================

export type SendMailInput = {
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject: string;
  bodyHtml: string;
  // Cuando true, Graph guarda el correo en la carpeta "Sent Items" del
  // usuario. Default true — los socios necesitan ver lo enviado en Outlook.
  saveToSentItems?: boolean;
};

export async function sendMail(
  userId: string,
  input: SendMailInput,
): Promise<void> {
  const message: Record<string, unknown> = {
    subject: input.subject,
    body: { contentType: "HTML", content: input.bodyHtml },
    toRecipients: input.to.map((r) => ({
      emailAddress: { address: r.email, name: r.name },
    })),
    ccRecipients: input.cc?.map((r) => ({
      emailAddress: { address: r.email, name: r.name },
    })),
    bccRecipients: input.bcc?.map((r) => ({
      emailAddress: { address: r.email, name: r.name },
    })),
  };
  await graphFetchJson(userId, "/me/sendMail", {
    method: "POST",
    json: {
      message,
      saveToSentItems: input.saveToSentItems ?? true,
    },
  });
}

// ============================================================================
// Inbox (opt-in)
// ============================================================================

export type GraphMailMessage = {
  id: string;
  subject: string;
  bodyPreview: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime: string;
  hasAttachments: boolean;
  isRead: boolean;
  internetMessageId: string;
};

export async function listInboxMessages(
  userId: string,
  opts: { since?: Date; top?: number } = {},
): Promise<GraphMailMessage[]> {
  const params = new URLSearchParams({
    $select: "id,subject,bodyPreview,from,toRecipients,receivedDateTime,hasAttachments,isRead,internetMessageId",
    $orderby: "receivedDateTime desc",
    $top: String(opts.top ?? 50),
  });
  if (opts.since) {
    params.set("$filter", `receivedDateTime ge ${opts.since.toISOString()}`);
  }
  const res = await graphFetchJson<{ value: GraphMailMessage[] }>(
    userId,
    `/me/mailFolders/inbox/messages?${params.toString()}`,
  );
  return res.value;
}
