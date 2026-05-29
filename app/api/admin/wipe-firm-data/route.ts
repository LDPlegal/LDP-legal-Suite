// POST /api/admin/wipe-firm-data
//
// Endpoint TEMPORAL para borrar todos los datos test del firm del usuario
// logueado. Corre EN VERCEL donde las credenciales R2 (S3_*) están
// disponibles sin tener que copiarlas a una máquina local.
//
// Salvaguardas:
//   1. Solo admin puede llamarlo (requireAdmin).
//   2. Por default es dry-run: devuelve qué borraría sin ejecutar.
//   3. Para ejecutar de verdad, hay que pasar un confirmation phrase
//      que incluye el firmId — no se puede ejecutar por accidente
//      ni con una request malformada.
//   4. Borra SOLO datos del firmId del usuario logueado — un admin no
//      puede borrar datos de otro firm aunque mande otro firmId.
//
// Borra:
//   - cases (cascade: tasks, notes, events, time_entries, expenses,
//     matter_chats, matter_chat_messages, ai_suggestions, etc.)
//   - documents (incluyendo los archivos en R2)
//   - invoices + invoice_items + payments
//   - sent_emails
//   - clients
//   - notifications
//   - active_timers
//   - marketing_photos (incluyendo archivos en R2)
//   - case_counters / invoice_counters (reset numeración a 001)
//   - audit_log
//
// NO toca:
//   - users, firms, templates, rates, branding, NCFs, settings
//   - calendar_integrations (conexión Microsoft del user)
//   - marketing_presets (plantillas guardadas — configuración valiosa)
//   - ai_usage (histórico de costos)
//
// Uso desde el browser, estando logueado como admin:
//   fetch("/api/admin/wipe-firm-data", { method: "POST" })
//     .then(r => r.json()).then(console.log)   // dry-run
//
//   fetch("/api/admin/wipe-firm-data", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ confirm: "WIPE-FIRM-<TU-FIRM-ID>" })
//   }).then(r => r.json()).then(console.log)   // ejecuta de verdad
//
// REMOVER este endpoint una vez completada la limpieza inicial.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/admin";
import {
  activeTimers,
  aiSuggestions,
  auditLog,
  caseCounters,
  cases,
  clients,
  documents,
  events,
  expenses,
  invoiceCounters,
  invoices,
  marketingPhotos,
  matterChats,
  notes,
  notifications,
  sentEmails,
  tasks,
  timeEntries,
} from "@/lib/db/schema";

export async function POST(req: Request) {
  const user = await requireAdmin();
  const firmId = user.firmId;

  let confirm: string | undefined;
  try {
    const body = (await req.json()) as { confirm?: string };
    confirm = body.confirm;
  } catch {
    // Body vacío → dry-run.
  }

  // ============================================================================
  // 1. Conteos actuales (también es el dry-run output)
  // ============================================================================
  const countsRaw = await adminDb.execute(sql`
    SELECT 'cases' AS table_name, count(*)::int AS n FROM cases WHERE firm_id = ${firmId}
    UNION ALL SELECT 'documents', count(*)::int FROM documents WHERE firm_id = ${firmId}
    UNION ALL SELECT 'tasks', count(*)::int FROM tasks WHERE firm_id = ${firmId}
    UNION ALL SELECT 'notes', count(*)::int FROM notes WHERE firm_id = ${firmId}
    UNION ALL SELECT 'events', count(*)::int FROM events WHERE firm_id = ${firmId}
    UNION ALL SELECT 'time_entries', count(*)::int FROM time_entries WHERE firm_id = ${firmId}
    UNION ALL SELECT 'expenses', count(*)::int FROM expenses WHERE firm_id = ${firmId}
    UNION ALL SELECT 'invoices', count(*)::int FROM invoices WHERE firm_id = ${firmId}
    UNION ALL SELECT 'matter_chats', count(*)::int FROM matter_chats WHERE firm_id = ${firmId}
    UNION ALL SELECT 'ai_suggestions', count(*)::int FROM ai_suggestions WHERE firm_id = ${firmId}
    UNION ALL SELECT 'clients', count(*)::int FROM clients WHERE firm_id = ${firmId}
    UNION ALL SELECT 'sent_emails', count(*)::int FROM sent_emails WHERE firm_id = ${firmId}
    UNION ALL SELECT 'audit_log', count(*)::int FROM audit_log WHERE firm_id = ${firmId}
    UNION ALL SELECT 'notifications', count(*)::int FROM notifications WHERE firm_id = ${firmId}
    UNION ALL SELECT 'active_timers', count(*)::int FROM active_timers WHERE firm_id = ${firmId}
    UNION ALL SELECT 'marketing_photos', count(*)::int FROM marketing_photos WHERE firm_id = ${firmId}
    UNION ALL SELECT 'case_counters', count(*)::int FROM case_counters WHERE firm_id = ${firmId}
    UNION ALL SELECT 'invoice_counters', count(*)::int FROM invoice_counters WHERE firm_id = ${firmId}
  `);
  const counts: Record<string, number> = {};
  for (const row of countsRaw.rows as Array<{ table_name: string; n: number }>) {
    if (row.n > 0) counts[row.table_name] = row.n;
  }

  // Lista de storageKeys (docs + marketing photos)
  const docKeys = await adminDb
    .select({ storageKey: documents.storageKey })
    .from(documents)
    .where(eq(documents.firmId, firmId));
  const photoKeys = await adminDb
    .select({ storageKey: marketingPhotos.storageKey })
    .from(marketingPhotos)
    .where(eq(marketingPhotos.firmId, firmId));
  const allStorageKeys = [
    ...docKeys.map((d) => d.storageKey),
    ...photoKeys.map((p) => p.storageKey),
  ].filter(Boolean);

  // ============================================================================
  // 2. Si no hay confirmación → dry-run
  // ============================================================================
  const expectedConfirm = `WIPE-FIRM-${firmId}`;
  if (confirm !== expectedConfirm) {
    return NextResponse.json({
      mode: "dry-run",
      firmId,
      counts,
      storageKeysCount: allStorageKeys.length,
      sampleStorageKeys: allStorageKeys.slice(0, 5),
      message:
        "Esto es un DRY-RUN. Para ejecutar de verdad, repetí la request con body " +
        `{"confirm": "${expectedConfirm}"}`,
    });
  }

  // ============================================================================
  // 3. EJECUTAR — R2 primero (para no perder storageKeys), después DB
  // ============================================================================
  const log: string[] = [];

  // R2
  let r2Removed = 0;
  let r2Skipped = 0;
  let r2OrphansRemoved = 0;
  if (
    process.env.S3_BUCKET &&
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  ) {
    const s3 = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
    const bucket = process.env.S3_BUCKET;

    // 3a. Borrar los keys conocidos en batches de 1000
    if (allStorageKeys.length > 0) {
      for (let i = 0; i < allStorageKeys.length; i += 1000) {
        const batch = allStorageKeys.slice(i, i + 1000);
        try {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: batch.map((k) => ({ Key: k })) },
            }),
          );
          r2Removed += batch.length;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes("nosuchkey")) {
            r2Skipped += batch.length;
          } else {
            throw err;
          }
        }
      }
      log.push(
        `R2: ${r2Removed} objetos borrados${r2Skipped > 0 ? `, ${r2Skipped} no existían (seed)` : ""}`,
      );
    }

    // 3b. Limpieza extra — borrar huérfanos del prefix firmId/
    let continuationToken: string | undefined;
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
        r2OrphansRemoved += orphanKeys.length;
      }
      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined;
    } while (continuationToken);
    if (r2OrphansRemoved > 0) {
      log.push(`R2: ${r2OrphansRemoved} huérfanos extra del prefix firmId/`);
    }
  } else {
    log.push("R2: skip — env vars S3_* no configuradas en este deploy");
  }

  // DB — en orden, respetando FK constraints
  const deleted: Record<string, number> = {};

  const d1 = await adminDb.delete(cases).where(eq(cases.firmId, firmId));
  deleted.cases = d1.rowCount ?? 0;

  // Eventos firm-level (sin caseId, no cascadearon desde cases) y los que
  // quedaron sueltos por otra razón.
  const dEvents = await adminDb.delete(events).where(eq(events.firmId, firmId));
  deleted.events = dEvents.rowCount ?? 0;

  // AI suggestions firm-level — pueden no tener caseId.
  const dAi = await adminDb
    .delete(aiSuggestions)
    .where(eq(aiSuggestions.firmId, firmId));
  deleted.ai_suggestions = dAi.rowCount ?? 0;

  const d2 = await adminDb.delete(documents).where(eq(documents.firmId, firmId));
  deleted.documents = d2.rowCount ?? 0;

  const d3 = await adminDb.delete(invoices).where(eq(invoices.firmId, firmId));
  deleted.invoices = d3.rowCount ?? 0;

  const d4 = await adminDb.delete(sentEmails).where(eq(sentEmails.firmId, firmId));
  deleted.sent_emails = d4.rowCount ?? 0;

  const d5 = await adminDb.delete(clients).where(eq(clients.firmId, firmId));
  deleted.clients = d5.rowCount ?? 0;

  const d6 = await adminDb
    .delete(marketingPhotos)
    .where(eq(marketingPhotos.firmId, firmId));
  deleted.marketing_photos = d6.rowCount ?? 0;

  const d7 = await adminDb
    .delete(notifications)
    .where(eq(notifications.firmId, firmId));
  deleted.notifications = d7.rowCount ?? 0;

  const d8 = await adminDb
    .delete(activeTimers)
    .where(eq(activeTimers.firmId, firmId));
  deleted.active_timers = d8.rowCount ?? 0;

  const d9 = await adminDb
    .delete(caseCounters)
    .where(eq(caseCounters.firmId, firmId));
  deleted.case_counters = d9.rowCount ?? 0;

  const d10 = await adminDb
    .delete(invoiceCounters)
    .where(eq(invoiceCounters.firmId, firmId));
  deleted.invoice_counters = d10.rowCount ?? 0;

  // Audit log last — las deletes anteriores podrían (en teoría) escribir entries
  const d11 = await adminDb.delete(auditLog).where(eq(auditLog.firmId, firmId));
  deleted.audit_log = d11.rowCount ?? 0;

  // Las tablas que cascadean desde cases (tasks/notes/events/time_entries/
  // expenses/matter_chats/ai_suggestions) ya se borraron solas — pero igual
  // las contamos para el reporte (deberían estar en 0).
  const remainingRaw = await adminDb.execute(sql`
    SELECT 'tasks' AS table_name, count(*)::int AS n FROM tasks WHERE firm_id = ${firmId}
    UNION ALL SELECT 'notes', count(*)::int FROM notes WHERE firm_id = ${firmId}
    UNION ALL SELECT 'events', count(*)::int FROM events WHERE firm_id = ${firmId}
    UNION ALL SELECT 'time_entries', count(*)::int FROM time_entries WHERE firm_id = ${firmId}
    UNION ALL SELECT 'expenses', count(*)::int FROM expenses WHERE firm_id = ${firmId}
    UNION ALL SELECT 'matter_chats', count(*)::int FROM matter_chats WHERE firm_id = ${firmId}
    UNION ALL SELECT 'ai_suggestions', count(*)::int FROM ai_suggestions WHERE firm_id = ${firmId}
  `);
  const stillThere: Record<string, number> = {};
  for (const row of remainingRaw.rows as Array<{ table_name: string; n: number }>) {
    if (row.n > 0) stillThere[row.table_name] = row.n;
  }

  // Silenciar TS sobre imports que solo se usan en sql raw o conteo
  void tasks; void notes; void timeEntries; void expenses; void matterChats;

  return NextResponse.json({
    mode: "executed",
    firmId,
    counts_before: counts,
    deleted,
    r2: { removed: r2Removed, skipped: r2Skipped, orphans: r2OrphansRemoved },
    log,
    stillThere: Object.keys(stillThere).length > 0 ? stillThere : "all clean",
    message: "✅ Wipe completado. Recargá la app para ver el estado limpio.",
  });
}
