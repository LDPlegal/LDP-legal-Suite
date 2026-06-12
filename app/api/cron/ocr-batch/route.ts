// OCR batch worker — disparado por Vercel Cron (vercel.json).
//
// Procesa un lote de documentos cuyo OCR no se pudo correr al momento de
// subir (status='skipped'). Tipicamente: archivos entre 10 y 25 MB que
// excedían el cap sync. El cron tiene un timeout más generoso (60s en Pro,
// 10s en Hobby) y procesa de a uno o dos por invocación; eventualmente el
// backlog se vacía.
//
// Auth: header `Authorization: Bearer <CRON_SECRET>`. Vercel Cron lo
// inyecta automáticamente cuando agregás CRON_SECRET en env vars.
//
// EXCEPCIÓN documentada: importamos `adminDb` (BYPASS RLS) directamente.
// Esto está OK porque el cron es un caller SYSTEM — no hay user session ni
// firm context. La auth se hace via secret compartido, no via session.
// El cron tampoco lee data ajena: solo procesa docs que el propio sistema
// dejó marcados como 'skipped'.

import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { documents } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import { getOcr, OCR_MAX_BYTES_CLAUDE } from "@/lib/ocr";

// Hobby plan: 10s function timeout. Pro: 60s. Procesamos pocos por
// invocación para no agotar el tiempo y darle margen al storage.get.
const BATCH_SIZE = 3;

// Tope efectivo del cron: 25 MB. Por encima, el OCR igual va a skip por
// los caps internos del módulo. Acá filtramos para ni descargar archivos
// imposibles de procesar.
const CRON_MAX_BYTES = 25 * 1024 * 1024;

export const runtime = "nodejs";
// Function timeout configurable — el default es 10s en Hobby. Vercel.json
// permite extender por path con `functions` config. Lo dejamos default
// por ahora.

export async function GET(req: Request): Promise<Response> {
  // ── Auth ──
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Buscar candidatos ──
  // status='skipped' + size razonable + no soft-deleted, más recientes primero.
  const candidates = await adminDb
    .select({
      id: documents.id,
      firmId: documents.firmId,
      storageKey: documents.storageKey,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      name: documents.name,
    })
    .from(documents)
    .where(
      and(
        eq(documents.ocrStatus, "skipped"),
        lte(documents.sizeBytes, CRON_MAX_BYTES),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(BATCH_SIZE);

  if (candidates.length === 0) {
    return Response.json({ ok: true, attempted: 0, message: "No pending docs." });
  }

  const storage = getStorage();
  const ocr = await getOcr();
  let done = 0;
  let stillSkipped = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const doc of candidates) {
    try {
      // Si excede el cap interno del OCR provider, no descargamos —
      // ahorramos memoria y bandwidth.
      if (doc.sizeBytes > OCR_MAX_BYTES_CLAUDE) {
        // Lo dejamos en skipped pero actualizamos updated_at para que
        // no sea el primero la próxima vez.
        await adminDb
          .update(documents)
          .set({ updatedAt: new Date() })
          .where(eq(documents.id, doc.id));
        stillSkipped += 1;
        continue;
      }

      const bytes = await storage.get(doc.storageKey);
      const result = await ocr.recognize({
        mimeType: doc.mimeType,
        bytes,
        sizeBytes: doc.sizeBytes,
        filename: doc.name,
        firmId: doc.firmId,
        userId: doc.firmId, // user del firm — no tenemos uno real acá
      });

      if (result.status === "done") {
        await adminDb
          .update(documents)
          .set({
            ocrStatus: "done",
            ocrText: result.text,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, doc.id));
        done += 1;
      } else if (result.status === "skipped") {
        await adminDb
          .update(documents)
          .set({ ocrStatus: "skipped", updatedAt: new Date() })
          .where(eq(documents.id, doc.id));
        stillSkipped += 1;
      } else {
        await adminDb
          .update(documents)
          .set({ ocrStatus: "failed", updatedAt: new Date() })
          .where(eq(documents.id, doc.id));
        failed += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ocr-batch] doc ${doc.id} excepción:`, msg);
      errors.push({ id: doc.id, error: msg });
      failed += 1;
      await adminDb
        .update(documents)
        .set({ ocrStatus: "failed", updatedAt: new Date() })
        .where(eq(documents.id, doc.id))
        .catch(() => {}); // no escalar — el cron sigue
    }
  }

  return Response.json({
    ok: true,
    attempted: candidates.length,
    done,
    stillSkipped,
    failed,
    errors,
  });
}
