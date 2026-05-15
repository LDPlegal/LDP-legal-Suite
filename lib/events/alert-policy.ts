// Default alert policy per event type (F7 spec, Gabriel).
//
// "audiencia": 7d, 1d, 0d ahead → email
// "plazo_procesal": 14d, 7d, 3d, 1d → email + inapp (más agresivo)
// "reunion_cliente"/"reunion_interna": 1d, 1h → inapp + email
// "vencimiento_administrativo": 30d, 7d, 1d → email
// "recordatorio": 1d → inapp
//
// All offsets in minutes BEFORE event.startAt. Negative offsets mean
// "after the event"; we don't use them but the type allows them.

export type EventTypeName =
  | "audiencia"
  | "plazo_procesal"
  | "reunion_cliente"
  | "reunion_interna"
  | "vencimiento_administrativo"
  | "recordatorio";

export type AlertPolicy = {
  offsetsMinutes: number[];
  channels: Array<"email" | "inapp">;
};

export const DEFAULT_ALERT_POLICY: Record<EventTypeName, AlertPolicy> = {
  audiencia: {
    offsetsMinutes: [7 * 24 * 60, 1 * 24 * 60, 0],
    channels: ["email", "inapp"],
  },
  plazo_procesal: {
    offsetsMinutes: [14 * 24 * 60, 7 * 24 * 60, 3 * 24 * 60, 1 * 24 * 60],
    channels: ["email", "inapp"],
  },
  reunion_cliente: {
    offsetsMinutes: [1 * 24 * 60, 60],
    channels: ["email", "inapp"],
  },
  reunion_interna: {
    offsetsMinutes: [60],
    channels: ["inapp"],
  },
  vencimiento_administrativo: {
    offsetsMinutes: [30 * 24 * 60, 7 * 24 * 60, 1 * 24 * 60],
    channels: ["email"],
  },
  recordatorio: {
    offsetsMinutes: [24 * 60],
    channels: ["inapp"],
  },
};

// Returns the policy for an event type, falling back to "recordatorio" if
// the type is unknown.
export function policyFor(eventType: string | null | undefined): AlertPolicy {
  if (!eventType) return DEFAULT_ALERT_POLICY.recordatorio;
  const known = DEFAULT_ALERT_POLICY[eventType as EventTypeName];
  return known ?? DEFAULT_ALERT_POLICY.recordatorio;
}

// Compute due dates for alerts. Filters out negatives (already past).
export function computeAlertDueDates(
  startAt: Date,
  policy: AlertPolicy,
): Date[] {
  const now = Date.now();
  return policy.offsetsMinutes
    .map((minutes) => new Date(startAt.getTime() - minutes * 60_000))
    .filter((d) => d.getTime() > now);
}
