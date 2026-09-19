// OCR batch worker, disparado por Vercel Cron (vercel.json).
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
// Esto está OK porque el cron es un caller SYSTEM, no hay user session ni
// firm context. La auth se hace via secret compartido, no via session.
// El cron tampoco lee data ajena: solo procesa docs que el propio sistema
// dejó marcados como 'skipped'.

import { NextResponse } from "next/server";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { documents, users } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import { getOcr, OCR_MAX_BYTES_CLAUDE } from "@/lib/ocr";
import { isCronAuthorized } from "@/lib/cron/auth";

// Hobby plan: 10s function timeout. Pro: 60s. Procesamos pocos por
// invocación para no agotar el tiempo y darle margen al storage.get.
// 2 por invocación: en Hobby el function timeout es ajustado y cada doc
// escaneado puede tardar 5-20s en Claude Vision. Si el batch no alcanza a
// terminar no se corrompe nada (cada update commitea individual; el resto
// se reintenta al día siguiente). Bajamos de 3 a 2 para menos timeouts.
const BATCH_SIZE = 2;

// Tope efectivo del cron: 25 MB. Por encima, el OCR igual va a skip por
// los caps internos del módulo. Acá filtramos para ni descargar archivos
// imposibles de procesar.
const CRON_MAX_BYTES = 25 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron envía POST por default. Aceptamos también GET para
// triggers manuales desde curl.
async function handler(req: Request): Promise<Response> {
  // ── Auth ──
  // Usamos el helper compartido (mismo patrón que los otros crons).
  // timingSafeEqual evita timing side channels.
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Buscar candidatos ──
  // status='skipped' + size razonable + no soft-deleted, más recientes primero.
  // Traemos uploadedBy porque el OCR module necesita un userId REAL para
  // atribuir el costo de Claude Vision en ai_usage (FK a users.id). Pasar
  // el firmId como userId, como hacía la versión anterior, rompía el
  // insert de tracking (FK violation, swallowed pero perdía el registro
  // de costo). Ver fix abajo: resolveUserId().
  const candidates = await adminDb
    .select({
      id: documents.id,
      firmId: documents.firmId,
      storageKey: documents.storageKey,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      name: documents.name,
      uploadedBy: documents.uploadedBy,
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
    return NextResponse.json({ ok: true, attempted: 0, message: "No pending docs." });
  }

  // Cache firmId → userId real (cualquier usuario activo del firm), para no
  // hacer un lookup por doc cuando uploadedBy es null.
  const firmUserCache = new Map<string, string | null>();
  async function resolveUserId(
    firmId: string,
    uploadedBy: string | null,
  ): Promise<string | null> {
    if (uploadedBy) return uploadedBy;
    if (firmUserCache.has(firmId)) return firmUserCache.get(firmId)!;
    const [u] = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.firmId, firmId), isNull(users.deletedAt)))
      .limit(1);
    const resolved = u?.id ?? null;
    firmUserCache.set(firmId, resolved);
    return resolved;
  }

  const storage = getStorage();
  const ocr = await getOcr();
  let done = 0;
  let stillSkipped = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const doc of candidates) {
    try {
      // Si excede el cap interno del OCR provider, no descargamos,
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

      // Resolver un userId REAL del firm para atribución de costo correcta.
      // Si el firm no tiene ningún usuario (caso raro), userId queda null,
      // el OCR module skipea Claude Vision (necesita user para tracking) y
      // los PDFs con capa de texto / DOCX se procesan igual sin costo IA.
      const realUserId = await resolveUserId(doc.firmId, doc.uploadedBy);

      const bytes = await storage.get(doc.storageKey);
      const result = await ocr.recognize({
        mimeType: doc.mimeType,
        bytes,
        sizeBytes: doc.sizeBytes,
        filename: doc.name,
        firmId: doc.firmId,
        userId: realUserId ?? undefined,
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
        // result.status === "failed". Distinguir el caso "firma sin
        // presupuesto IA", ese NO es un fallo permanente del doc; cuando
        // el admin aumente el límite o resetee el mes, el doc debe poder
        // reintentarse. Por eso lo dejamos en 'skipped', no 'failed'.
        const reason = "reason" in result ? result.reason : "";
        const isBudget = /presupuesto|budget/i.test(reason);
        await adminDb
          .update(documents)
          .set({
            ocrStatus: isBudget ? "skipped" : "failed",
            updatedAt: new Date(),
          })
          .where(eq(documents.id, doc.id));
        if (isBudget) stillSkipped += 1;
        else failed += 1;
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
        .catch(() => {}); // no escalar, el cron sigue
    }
  }

  return NextResponse.json({
    ok: true,
    attempted: candidates.length,
    done,
    stillSkipped,
    failed,
    errors,
  });
}

// Vercel Cron usa POST por default; GET para curl manual.
export const POST = handler;
export const GET = handler;
