// Eventos del sistema, fallos silenciosos hechos visibles (Fase 12).
//
// logSystemEvent() reemplaza el patron `catch { console.error(...) }` en los
// puntos criticos: envio de email, sync de calendario, Graph sendMail, OCR.
// Es best-effort: si el INSERT del evento falla, NO escalamos (no queremos
// que el log de un fallo cause otro fallo). Usa adminDb porque muchos
// callers corren fuera de una sesion con firm context (crons, after()).

import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { adminDb } from "../admin";
import { withFirm } from "../with-firm";
import { systemEvents, type SystemEvent } from "../schema";

export type SystemEventInput = {
  firmId: string;
  kind: string;
  message: string;
  severity?: "info" | "warning" | "error";
  context?: Record<string, unknown> | null;
  userId?: string | null;
};

export async function logSystemEvent(input: SystemEventInput): Promise<void> {
  try {
    await adminDb.insert(systemEvents).values({
      firmId: input.firmId,
      kind: input.kind,
      severity: input.severity ?? "error",
      message: input.message.slice(0, 2000),
      context: input.context ?? null,
      userId: input.userId ?? null,
    });
  } catch (e) {
    // No escalar, el registro de un fallo no debe romper nada. Dejamos
    // rastro en los logs del runtime como ultimo recurso.
    console.error("[system-events] no se pudo registrar el evento:", e);
  }
}

export async function listSystemEvents(
  firmId: string,
  userId: string,
  opts: { limit?: number; onlyUnresolved?: boolean } = {},
): Promise<SystemEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return withFirm(firmId, userId, async (tx) => {
    const conds = [eq(systemEvents.firmId, firmId)];
    if (opts.onlyUnresolved) conds.push(isNull(systemEvents.resolvedAt));
    return tx
      .select()
      .from(systemEvents)
      .where(and(...conds))
      .orderBy(desc(systemEvents.createdAt))
      .limit(limit);
  });
}

export async function countUnresolvedSystemEvents(
  firmId: string,
  userId: string,
): Promise<number> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(systemEvents)
      .where(
        and(eq(systemEvents.firmId, firmId), isNull(systemEvents.resolvedAt)),
      );
    return row?.n ?? 0;
  });
}

export async function markSystemEventResolved(
  firmId: string,
  userId: string,
  eventId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(systemEvents)
      .set({ resolvedAt: new Date(), resolvedBy: userId })
      .where(
        and(
          eq(systemEvents.id, eventId),
          isNull(systemEvents.resolvedAt),
        ),
      )
      .returning({ id: systemEvents.id });
    return !!row;
  });
}

export async function markAllSystemEventsResolved(
  firmId: string,
  userId: string,
): Promise<number> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .update(systemEvents)
      .set({ resolvedAt: new Date(), resolvedBy: userId })
      .where(
        and(eq(systemEvents.firmId, firmId), isNull(systemEvents.resolvedAt)),
      )
      .returning({ id: systemEvents.id });
    return rows.length;
  });
}
