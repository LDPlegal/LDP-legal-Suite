// Test del schema de events para sync OAuth. Verifica que:
//   1. La nueva columna oauth_integration_id existe + FK funciona.
//   2. El unique constraint (oauth_integration_id, external_uid) deduplica.
//   3. icalUid únicos por fila (cada randomUUID@sync-microsoft distinto)
//      pasan sin chocar.
//   4. Insertar varias instancias del mismo "recurrente" (mismo
//      external_uid base pero distinto id REST) NO viola constraints.
//
// Uso: pnpm tsx --env-file=.env scripts/test-calendar-sync.ts
//
// Limpia los rastros al final.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env" });

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "../lib/db/schema";

const url = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL / DATABASE_MIGRATE_URL is required");
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

async function main() {
  console.log("[test] iniciando…");

  // Tomamos firstFirm + firstUser.
  const [firm] = await db.select().from(schema.firms).limit(1);
  if (!firm) throw new Error("No firm found in DB.");
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.firmId, firm.id))
    .limit(1);
  if (!user) throw new Error("No user found in firm.");
  console.log(`[test] firm=${firm.id} user=${user.email}`);

  // Insertamos una integration de prueba.
  const fakeMeta = {
    iv: "test",
    aad: "test",
    keyId: "test",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  const [integration] = await db
    .insert(schema.calendarIntegrations)
    .values({
      firmId: firm.id,
      userId: user.id,
      provider: "microsoft",
      externalAccountId: `test-${randomUUID()}@example.com`,
      accessTokenCipher: "test-cipher",
      refreshTokenCipher: null,
      tokenMeta: fakeMeta,
      scopes: ["openid", "Calendars.ReadWrite"],
    })
    .returning({ id: schema.calendarIntegrations.id });
  if (!integration) throw new Error("could not insert integration");
  console.log(`[test] integration creada: ${integration.id}`);

  // Mock events: 1 individual + 3 instancias recurrentes.
  const mockEvents = [
    {
      restId: "AAMkAGI1AAA-test1",
      iCalUId: "ical-uid-test1@outlook.com",
      subject: "Reunión con cliente",
      start: new Date("2026-05-25T14:00:00Z"),
      end: new Date("2026-05-25T15:00:00Z"),
    },
    {
      restId: "AAMkAGI1AAA-rec1",
      iCalUId: "ical-uid-recurring@outlook.com",
      subject: "Daily standup",
      start: new Date("2026-05-25T09:00:00Z"),
      end: new Date("2026-05-25T09:15:00Z"),
    },
    {
      restId: "AAMkAGI1AAA-rec2",
      iCalUId: "ical-uid-recurring@outlook.com", // mismo iCalUId — el bug viejo
      subject: "Daily standup",
      start: new Date("2026-05-26T09:00:00Z"),
      end: new Date("2026-05-26T09:15:00Z"),
    },
    {
      restId: "AAMkAGI1AAA-rec3",
      iCalUId: "ical-uid-recurring@outlook.com",
      subject: "Daily standup",
      start: new Date("2026-05-27T09:00:00Z"),
      end: new Date("2026-05-27T09:15:00Z"),
    },
  ];

  let ok = true;
  try {
    for (const e of mockEvents) {
      await db.insert(schema.events).values({
        firmId: firm.id,
        caseId: null,
        title: e.subject,
        startAt: e.start,
        endAt: e.end,
        allDay: false,
        icalUid: `${randomUUID()}@sync-microsoft`, // único por fila
        oauthIntegrationId: integration.id,
        externalUid: e.restId,
        createdBy: user.id,
      });
    }
    console.log("[test] ✅ los 4 eventos insertados sin constraint violation");

    // Verificá que estén las 4 filas.
    const rows = await db
      .select({
        id: schema.events.id,
        title: schema.events.title,
        externalUid: schema.events.externalUid,
      })
      .from(schema.events)
      .where(eq(schema.events.oauthIntegrationId, integration.id));
    console.log(`[test] filas en DB: ${rows.length}`);
    for (const r of rows) console.log(`  - ${r.externalUid}: ${r.title}`);
    if (rows.length !== 4) {
      console.error(`[test] ❌ esperaba 4 filas, hay ${rows.length}`);
      ok = false;
    }

    // Idempotencia: intentar insertar el mismo restId 2x debería violar
    // el unique parcial events_oauth_unique.
    try {
      await db.insert(schema.events).values({
        firmId: firm.id,
        caseId: null,
        title: "Duplicado",
        startAt: new Date("2026-05-25T14:00:00Z"),
        endAt: new Date("2026-05-25T15:00:00Z"),
        allDay: false,
        icalUid: `${randomUUID()}@sync-microsoft`,
        oauthIntegrationId: integration.id,
        externalUid: "AAMkAGI1AAA-test1", // mismo que arriba
        createdBy: user.id,
      });
      console.error("[test] ❌ unique events_oauth_unique NO bloqueó duplicado");
      ok = false;
    } catch (err) {
      console.log("[test] ✅ unique events_oauth_unique bloqueó duplicado correctamente");
      void err;
    }

    if (ok) console.log("\n[test] 🎉 TODO PASÓ");
    else console.log("\n[test] ❌ HUBO FALLAS");
  } finally {
    // Cleanup.
    await db
      .delete(schema.events)
      .where(eq(schema.events.oauthIntegrationId, integration.id));
    await db
      .delete(schema.calendarIntegrations)
      .where(eq(schema.calendarIntegrations.id, integration.id));
    console.log("[test] cleanup completo.");
    await pool.end();
  }

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[test] FATAL:", err);
  pool.end().finally(() => process.exit(1));
});

void and;
