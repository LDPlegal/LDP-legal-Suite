// Diagnóstico — qué columnas/tablas tiene REALMENTE la DB de producción.
// Útil cuando sospechamos que schema.ts está fuera de sync con la DB
// (por migraciones nunca aplicadas, drift, etc.).
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env" });
const { Pool } = pg;

const url = process.env.DATABASE_MIGRATE_URL;
if (!url) {
  console.error("DATABASE_MIGRATE_URL no set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

try {
  // 1. Columnas claves que el schema.ts referencia
  const colsRes = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN (
        'confidential_tier', 'ai_generated', 'ai_original_prompt', 'review_status',
        'encryption_meta', 'ical_token', 'client_id', 'two_factor_enabled',
        'email_signature', 'folder_id', 'registro_mercantil', 'scan_id',
        'shared_with_client', 'ai_skill_ids', 'ai_chat_message_id',
        'reviewed_by', 'reviewed_at', 'visibility', 'event_type',
        'created_by_ai', 'original_prompt', 'alert_policy'
      )
    ORDER BY table_name, column_name
  `);

  console.log("=== COLUMNAS PRESENTES EN PROD ===");
  const byTable = {};
  for (const r of colsRes.rows) {
    if (!byTable[r.table_name]) byTable[r.table_name] = [];
    byTable[r.table_name].push(r.column_name);
  }
  for (const [t, cols] of Object.entries(byTable)) {
    console.log(`\n${t}:`);
    cols.forEach((c) => console.log(`  ✓ ${c}`));
  }

  // 2. Comparar con lo que schema.ts EXPECTA
  const expected = {
    cases: ["confidential_tier"],
    documents: [
      "folder_id", "shared_with_client", "scan_id", "ai_generated",
      "ai_original_prompt", "ai_skill_ids", "ai_chat_message_id",
      "review_status", "reviewed_by", "reviewed_at", "encryption_meta",
    ],
    users: ["ical_token", "client_id", "two_factor_enabled", "email_signature"],
    clients: ["registro_mercantil"],
    events: ["visibility", "event_type", "created_by_ai", "original_prompt", "alert_policy"],
  };

  console.log("\n=== COLUMNAS FALTANTES (lo que schema.ts espera) ===");
  let missing = 0;
  for (const [table, cols] of Object.entries(expected)) {
    const present = new Set(byTable[table] ?? []);
    for (const c of cols) {
      if (!present.has(c)) {
        console.log(`  ✗ ${table}.${c}  ← FALTA`);
        missing++;
      }
    }
  }
  if (missing === 0) {
    console.log("  ✅ Todas las columnas esperadas están en la DB.");
  } else {
    console.log(`\n⚠️  ${missing} columna(s) faltan — esto puede explicar errores SSR.`);
  }

  // 3. Tablas
  const tabRes = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log("\n=== TABLAS EN PROD ===");
  console.log(tabRes.rows.map((r) => r.table_name).join(", "));

  await pool.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await pool.end();
  process.exit(1);
}
