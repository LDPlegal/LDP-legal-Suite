// Date/time formatting helpers (§ 9.5).
// All timestamps are stored as `timestamptz` in UTC. Render conversions go
// through `formatInFirmTz` so the firm's configured timezone (default
// `America/Santo_Domingo`) is the only place tz lives in the UI layer.

import { format } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";

export const DEFAULT_TZ = "America/Santo_Domingo";

export function formatInFirmTz(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TZ,
  pattern = "dd/MM/yyyy HH:mm",
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return formatInTimeZone(d, timezone, pattern, { locale: es });
}

export function formatDateOnly(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TZ,
): string {
  return formatInFirmTz(date, timezone, "dd 'de' MMMM 'de' yyyy");
}

export function formatRelative(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TZ,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const zoned = toZonedTime(d, timezone);
  return format(zoned, "PP p", { locale: es });
}
