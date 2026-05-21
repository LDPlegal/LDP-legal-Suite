// F7+ Bloque 5 — Backfill: marca como 'private' todos los eventos que
// vinieron de OAuth sync antes de la migración 0020 (que añadió la
// columna con default 'firm').
//
// Uso: pnpm tsx scripts/backfill-event-visibility.ts
//
// Idempotente: si ya está private no toca nada.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env" });

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNotNull } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const url = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

async function main() {
  // Cuántos eventos hay sincronizados desde OAuth que aún están como 'firm'?
  const candidates = await db
    .select({
      id: schema.events.id,
      title: schema.events.title,
      createdBy: schema.events.createdBy,
      firmId: schema.events.firmId,
    })
    .from(schema.events)
    .where(
      and(
        isNotNull(schema.events.oauthIntegrationId),
        eq(schema.events.visibility, "firm"),
      ),
    );

  console.log(`[backfill] candidatos para flipear: ${candidates.length}`);
  for (const r of candidates.slice(0, 20)) {
    console.log(`  - ${r.title} (createdBy=${r.createdBy})`);
  }
  if (candidates.length > 20) {
    console.log(`  … y ${candidates.length - 20} más`);
  }

  if (candidates.length === 0) {
    console.log("[backfill] nada que hacer.");
    await pool.end();
    return;
  }

  const result = await db
    .update(schema.events)
    .set({ visibility: "private", updatedAt: new Date() })
    .where(
      and(
        isNotNull(schema.events.oauthIntegrationId),
        eq(schema.events.visibility, "firm"),
      ),
    )
    .returning({ id: schema.events.id });

  console.log(`[backfill] ✅ flipeados a 'private': ${result.length} eventos`);
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill] FATAL:", err);
  pool.end().finally(() => process.exit(1));
});
