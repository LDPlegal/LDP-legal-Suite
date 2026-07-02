// scripts/migrate-deploy.ts
//
// Aplica SOLO las migraciones drizzle pendientes usando DATABASE_MIGRATE_URL.
// Pensado para correr en el build de Vercel ANTES de `next build`, de modo que
// el esquema de producción esté actualizado antes de que el código nuevo sirva
// tráfico (Vercel no aplica migraciones por su cuenta; ver DECISIONS/infra).
//
// Diferencias con scripts/migrate.ts (bootstrap local/manual):
//   - NO crea la base de datos, ni el rol app_user, ni hace GRANTs. Eso ya
//     existe en producción; aquí solo corremos el migrator (idempotente: drizzle
//     salta las migraciones ya registradas en __drizzle_migrations).
//   - Lee de process.env directamente (Vercel inyecta las env vars; no hay .env
//     en el build). En local, dotenv carga .env si existe.
//   - Fail-safe: si no hay DATABASE_MIGRATE_URL, no aborta el build (útil para
//     builds locales/CI sin BD). Si la migración falla, sí sale con código 1
//     para que el deploy falle antes de publicar código incompatible.

import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Carga .env en local; en Vercel las vars ya están en process.env (no-op).
config({ path: ".env" });

async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATE_URL;
  if (!url) {
    console.warn(
      "[migrate-deploy] DATABASE_MIGRATE_URL no está definida — se omiten migraciones (build local/CI sin BD).",
    );
    return;
  }

  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle(pool);
    console.log("[migrate-deploy] Aplicando migraciones pendientes...");
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    console.log("[migrate-deploy] Migraciones al día ✓");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[migrate-deploy] FALLÓ:", err);
  process.exit(1);
});
