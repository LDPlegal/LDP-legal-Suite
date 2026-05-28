// Wipe COMPLETO de los datos test de un firm.
//
// Borra (en este orden, respetando FK constraints):
//   1. Objetos en R2 referenciados por documents + marketing_photos
//   2. Cases (cascade: tasks, notes, events, time_entries, expenses,
//      matter_chats, matter_chat_messages, ai_suggestions, event_alerts,
//      event_reminders, case_assignees, notification_subscriptions
//      relacionados al caso)
//   3. Documents que sobrevivieron (no tenían caseId)
//   4. Invoices + invoice_lines + invoice_payments (clientes son refs)
//   5. Sent emails
//   6. Conflicts
//   7. Clients
//   8. Audit log entries del firm
//   9. Marketing photos (los archivos en R2 ya se fueron en paso 1)
//
// NO toca:
//   - users (staff)
//   - firms (la firma misma)
//   - templates, rates, branding, NCFs, settings de firm
//   - calendar_integrations (conexión Microsoft del user)
//   - marketing_presets (plantillas guardadas — son útiles)
//   - notifications/in_app_notifications (las dejamos — ya están leídas)
//   - 2FA settings
//
// Uso:
//   npx tsx scripts/wipe-firm-test-data.ts <firmId>             # dry-run
//   npx tsx scripts/wipe-firm-test-data.ts <firmId> --execute    # de verdad

import "dotenv/config";
import { Pool } from "pg";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

async function main() {
  const firmId = process.argv[2];
  const execute = process.argv.includes("--execute");
  if (!firmId) {
    console.error("Uso: npx tsx scripts/wipe-firm-test-data.ts <firmId> [--execute]");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_MIGRATE_URL;
  if (!dbUrl) {
    console.error("Falta DATABASE_MIGRATE_URL en .env");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: dbUrl });

  console.log(`\n${execute ? "🔥 EJECUTANDO" : "🔍 DRY-RUN"} wipe para firmId=${firmId}\n`);

  // ============================================================================
  // 1. Resumen — qué hay actualmente
  // ============================================================================
  const counts = await pool.query<{ table: string; n: number }>(
    `
    SELECT 'cases' AS table, count(*)::int AS n FROM cases WHERE firm_id = $1
    UNION ALL SELECT 'documents', count(*)::int FROM documents WHERE firm_id = $1
    UNION ALL SELECT 'tasks', count(*)::int FROM tasks WHERE firm_id = $1
    UNION ALL SELECT 'notes', count(*)::int FROM notes WHERE firm_id = $1
    UNION ALL SELECT 'events', count(*)::int FROM events WHERE firm_id = $1
    UNION ALL SELECT 'time_entries', count(*)::int FROM time_entries WHERE firm_id = $1
    UNION ALL SELECT 'expenses', count(*)::int FROM expenses WHERE firm_id = $1
    UNION ALL SELECT 'invoices', count(*)::int FROM invoices WHERE firm_id = $1
    UNION ALL SELECT 'matter_chats', count(*)::int FROM matter_chats WHERE firm_id = $1
    UNION ALL SELECT 'ai_suggestions', count(*)::int FROM ai_suggestions WHERE firm_id = $1
    UNION ALL SELECT 'clients', count(*)::int FROM clients WHERE firm_id = $1
    UNION ALL SELECT 'sent_emails', count(*)::int FROM sent_emails WHERE firm_id = $1
    UNION ALL SELECT 'audit_log', count(*)::int FROM audit_log WHERE firm_id = $1
    UNION ALL SELECT 'marketing_photos', count(*)::int FROM marketing_photos WHERE firm_id = $1
    UNION ALL SELECT 'notifications', count(*)::int FROM notifications WHERE firm_id = $1
    UNION ALL SELECT 'active_timers', count(*)::int FROM active_timers WHERE firm_id = $1
    UNION ALL SELECT 'case_counters', count(*)::int FROM case_counters WHERE firm_id = $1
    UNION ALL SELECT 'invoice_counters', count(*)::int FROM invoice_counters WHERE firm_id = $1
    `,
    [firmId],
  );

  console.log("Conteo actual:");
  for (const row of counts.rows) {
    if (row.n > 0) console.log(`  ${row.table.padEnd(22)} ${row.n}`);
  }
  console.log();

  // ============================================================================
  // 2. Storage keys (para borrar de R2)
  // ============================================================================
  const docStorageKeys = await pool.query<{ storage_key: string }>(
    `SELECT storage_key FROM documents WHERE firm_id = $1`,
    [firmId],
  );
  const photoStorageKeys = await pool.query<{ storage_key: string }>(
    `SELECT storage_key FROM marketing_photos WHERE firm_id = $1`,
    [firmId],
  );
  const allKeys = [
    ...docStorageKeys.rows.map((r) => r.storage_key),
    ...photoStorageKeys.rows.map((r) => r.storage_key),
  ].filter(Boolean);
  console.log(`Storage keys a borrar de R2: ${allKeys.length}`);
  if (allKeys.length > 0 && allKeys.length <= 10) {
    for (const k of allKeys) console.log(`  - ${k}`);
  } else if (allKeys.length > 10) {
    console.log(`  (mostrando primeros 5)`);
    for (const k of allKeys.slice(0, 5)) console.log(`  - ${k}`);
    console.log(`  ... y ${allKeys.length - 5} más`);
  }
  console.log();

  if (!execute) {
    console.log("✋ DRY-RUN. Si esto es lo que querés borrar, corré:");
    console.log(`   npx tsx scripts/wipe-firm-test-data.ts ${firmId} --execute\n`);
    await pool.end();
    return;
  }

  // ============================================================================
  // 3. R2 — borrar objetos
  // ============================================================================
  if (allKeys.length > 0) {
    const bucket = process.env.S3_BUCKET;
    const endpoint = process.env.S3_ENDPOINT;
    const akid = process.env.S3_ACCESS_KEY_ID;
    const secret = process.env.S3_SECRET_ACCESS_KEY;
    if (!bucket || !endpoint || !akid || !secret) {
      console.error(
        "❌ Falta config S3 en .env (S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).",
      );
      console.error("   Copialas TEMPORALMENTE desde Vercel a tu .env para correr esto.");
      await pool.end();
      process.exit(1);
    }
    const s3 = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: akid, secretAccessKey: secret },
    });

    // Microsoft DeleteObjects acepta hasta 1000 keys por call.
    let removed = 0;
    let skipped = 0;
    for (let i = 0; i < allKeys.length; i += 1000) {
      const batch = allKeys.slice(i, i + 1000);
      try {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((k) => ({ Key: k })) },
          }),
        );
        removed += batch.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Algunos seeds tienen keys que nunca subimos — los ignoramos.
        if (msg.toLowerCase().includes("nosuchkey")) {
          skipped += batch.length;
        } else {
          throw err;
        }
      }
    }
    console.log(`✓ R2: ${removed} objetos borrados${skipped > 0 ? `, ${skipped} no existían (seed)` : ""}\n`);

    // Bonus: limpieza extra — listar y borrar TODO lo que queda bajo el prefix firmId
    // (por si quedaron huérfanos de uploads cancelados, drafts, etc).
    let continuationToken: string | undefined;
    let orphansRemoved = 0;
    do {
      const listed = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `${firmId}/`,
          ContinuationToken: continuationToken,
        }),
      );
      const orphanKeys = (listed.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => !!k);
      if (orphanKeys.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: orphanKeys.map((k) => ({ Key: k })) },
          }),
        );
        orphansRemoved += orphanKeys.length;
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
    if (orphansRemoved > 0) {
      console.log(`✓ R2: limpieza extra del prefix '${firmId}/' — ${orphansRemoved} huérfanos borrados\n`);
    }
  } else {
    console.log("✓ R2: nada que borrar\n");
  }

  // ============================================================================
  // 4. DB — borrar en orden
  // ============================================================================
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // a) Cases — cascade nukea: tasks, notes, events, time_entries, expenses,
    //    matter_chats (+ messages), ai_suggestions, event_alerts, event_reminders,
    //    case_assignees, notifications relacionadas
    const r1 = await client.query("DELETE FROM cases WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r1.rowCount ?? 0} cases borrados (cascade nukea sus hijos)`);

    // b) Documents que no estaban tied a caseId (firm-level docs)
    const r2 = await client.query("DELETE FROM documents WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r2.rowCount ?? 0} documents firm-level borrados`);

    // c) Invoices que no se fueron via case cascade (suelta a clientes)
    const r3 = await client.query("DELETE FROM invoices WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r3.rowCount ?? 0} invoices borradas`);

    // d) Sent emails
    const r4 = await client.query("DELETE FROM sent_emails WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r4.rowCount ?? 0} sent_emails borrados`);

    // e) Clients (ya nada los referencia tras borrar cases)
    const r5 = await client.query("DELETE FROM clients WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r5.rowCount ?? 0} clients borrados`);

    // f) Marketing photos (las plantillas/presets se mantienen — son
    //    configuración valiosa)
    const r6 = await client.query("DELETE FROM marketing_photos WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r6.rowCount ?? 0} marketing_photos borradas`);

    // g) Notifications (campanita header) — referencian casos/clientes que
    //    ya borramos pero podrían tener entries firm-scoped sueltas.
    const r7 = await client.query("DELETE FROM notifications WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r7.rowCount ?? 0} notifications borradas`);

    // h) Active timers (timer corriendo) — probablemente vacío pero por si acaso.
    const r8 = await client.query("DELETE FROM active_timers WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r8.rowCount ?? 0} active_timers borrados`);

    // i) Counters — reseteamos numeración de casos y facturas para que
    //    arranquen desde 001 con datos reales. NCF NO se toca: esos números
    //    son de la DGII y deben mantener su secuencia oficial.
    const r9 = await client.query("DELETE FROM case_counters WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r9.rowCount ?? 0} case_counters reseteados (próximos casos empiezan en 001)`);
    const r10 = await client.query("DELETE FROM invoice_counters WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r10.rowCount ?? 0} invoice_counters reseteados`);

    // j) Audit log — último porque las deletes anteriores podrían (en teoría)
    //    haber agregado entries. Lo limpiamos al final.
    const r11 = await client.query("DELETE FROM audit_log WHERE firm_id = $1", [firmId]);
    console.log(`✓ DB: ${r11.rowCount ?? 0} audit_log entries borradas`);

    await client.query("COMMIT");
    console.log("\n✅ Wipe completado.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Error — transaction rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
