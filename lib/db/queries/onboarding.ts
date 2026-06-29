// Progreso de onboarding del firm.
//
// Un firm recién creado cae en el dashboard sin clientes, sin casos, sin
// nada — y todos los widgets se ven vacíos sin guía de qué hacer primero.
// Esta query cuenta los hitos clave para decidir si mostramos el checklist
// de onboarding y cuáles pasos ya están completos.
//
// Eficiencia: 5 count(*) en paralelo dentro de una sola transacción withFirm.
// Cada uno es un index scan trivial filtrado por firm (RLS) — en un firm
// nuevo las tablas están casi vacías, y en uno maduro igual son count
// indexados. Se llama solo desde el dashboard.

import { and, isNull, ne, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { cases, clients, documents, events, users } from "../schema";

export type OnboardingProgress = {
  clients: number;
  cases: number;
  documents: number;
  events: number;
  /** Miembros del equipo SIN contar al admin que creó la firma. >0 = invitó. */
  teammates: number;
  /** True cuando los hitos mínimos (cliente + caso) están hechos. */
  coreDone: boolean;
};

export async function getFirmOnboardingProgress(
  firmId: string,
  userId: string,
): Promise<OnboardingProgress> {
  return withFirm(firmId, userId, async (tx) => {
    const countOf = async (
      table: typeof clients | typeof cases | typeof documents | typeof events,
    ): Promise<number> => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(isNull(table.deletedAt));
      return row?.n ?? 0;
    };

    const [clientsN, casesN, docsN, eventsN, teamRow] = await Promise.all([
      countOf(clients),
      countOf(cases),
      countOf(documents),
      countOf(events),
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(
          and(
            isNull(users.deletedAt),
            ne(users.role, "client"),
            // No contar al usuario actual (el admin fundador) — queremos
            // saber si invitó a ALGUIEN MÁS.
            ne(users.id, userId),
          ),
        ),
    ]);

    const teammates = teamRow[0]?.n ?? 0;

    return {
      clients: clientsN,
      cases: casesN,
      documents: docsN,
      events: eventsN,
      teammates,
      coreDone: clientsN > 0 && casesN > 0,
    };
  });
}
