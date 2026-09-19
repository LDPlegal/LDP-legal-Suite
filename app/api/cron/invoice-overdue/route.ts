// Detector diario de facturas vencidas, disparado por Vercel Cron.
//
// Qué hace:
//   1. Busca invoices con status en ('sent', 'partial') cuyo dueOn < now()
//      y que no estén borradas. Las marca como 'overdue'.
//   2. Notifica al `createdBy` (el emisor de la factura) cada vez que
//      DETECTA por primera vez una factura vencida, es decir, solo cuando
//      pasa de sent/partial a overdue. Una vez en overdue no re-notifica
//      al día siguiente (evita spam diario por una misma factura).
//
// Auth: Authorization: Bearer <CRON_SECRET>. Mismo patrón que ocr-batch.
//
// EXCEPCIÓN documentada: usamos adminDb (bypass RLS) porque el caller es
// SYSTEM y no hay user/firm context. El payload de la notificación se
// construye solo con datos de la propia factura.

import { NextResponse } from "next/server";
import { and, inArray, isNull, lt } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { invoices, clients } from "@/lib/db/schema";
import { isCronAuthorized } from "@/lib/cron/auth";
import { notify } from "@/lib/db/queries/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: Request): Promise<Response> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Buscar candidatos ANTES del update, necesitamos el firmId/clientId/
  // createdBy para notificar. status IN ('sent', 'partial') porque draft
  // todavía no se "envió" y paid/void/overdue no aplican.
  const candidates = await adminDb
    .select({
      id: invoices.id,
      firmId: invoices.firmId,
      number: invoices.number,
      total: invoices.total,
      balance: invoices.balance,
      currency: invoices.currency,
      dueOn: invoices.dueOn,
      createdBy: invoices.createdBy,
      clientId: invoices.clientId,
    })
    .from(invoices)
    .where(
      and(
        inArray(invoices.status, ["sent", "partial"]),
        lt(invoices.dueOn, now),
        isNull(invoices.deletedAt),
      ),
    );

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, marked: 0, notified: 0 });
  }

  // Resolver nombres de clientes para los títulos de notificación.
  const clientIds = [...new Set(candidates.map((c) => c.clientId))];
  const clientRows = await adminDb
    .select({ id: clients.id, displayName: clients.displayName })
    .from(clients)
    .where(inArray(clients.id, clientIds));
  const clientNameById = new Map(clientRows.map((c) => [c.id, c.displayName]));

  // Marcar como overdue.
  await adminDb
    .update(invoices)
    .set({ status: "overdue", updatedAt: now })
    .where(
      inArray(
        invoices.id,
        candidates.map((c) => c.id),
      ),
    );

  // Notificar al creador. Si createdBy es null (usuario removido del firm),
  // skipea esa factura, no tenemos a quién avisarle de manera precisa.
  let notified = 0;
  for (const inv of candidates) {
    if (!inv.createdBy) continue;
    const clientName = clientNameById.get(inv.clientId) ?? "cliente";
    const daysOverdue = Math.max(
      1,
      Math.floor((now.getTime() - new Date(inv.dueOn).getTime()) / 86400000),
    );
    try {
      await notify({
        firmId: inv.firmId,
        userId: inv.createdBy,
        type: "invoice_overdue",
        title: `Factura vencida: ${inv.number}, ${clientName}`,
        body: `Balance ${inv.balance} ${inv.currency}. Vencida hace ${daysOverdue} día(s).`,
        href: `/facturacion/${inv.id}`,
      });
      notified += 1;
    } catch (e) {
      console.error(`[invoice-overdue] notify failed for ${inv.id}:`, e);
    }
  }

  return NextResponse.json({ ok: true, marked: candidates.length, notified });
}

export const POST = handler;
export const GET = handler;
