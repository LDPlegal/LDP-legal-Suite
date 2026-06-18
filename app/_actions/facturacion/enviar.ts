"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { markInvoiceSent } from "@/lib/db/queries/invoices";
import { logAuditStandalone } from "@/lib/audit/log";
import { notify } from "@/lib/db/queries/notifications";

const Schema = z.object({ invoiceId: z.string().uuid() });

export async function marcarFacturaEnviadaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    throw new Error("Solo admins y socios pueden marcar facturas como enviadas.");
  }
  const parsed = Schema.parse({ invoiceId: formData.get("invoiceId") });
  const inv = await markInvoiceSent(user.firmId, user.userId, parsed.invoiceId);
  if (inv) {
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "invoice",
      entityId: inv.id,
      caseId: inv.caseId ?? undefined,
      action: "sent",
      summary: `Marcó factura ${inv.number} como enviada`,
    });
    // Notificar al creador de la factura (si no es quien la envió).
    if (inv.createdBy && inv.createdBy !== user.userId) {
      await notify({
        firmId: user.firmId,
        userId: inv.createdBy,
        type: "invoice_sent",
        title: `Factura ${inv.number} enviada`,
        body: "La factura se marcó como enviada al cliente.",
        href: `/facturacion/${inv.id}`,
      });
    }
  }
  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${parsed.invoiceId}`);
}
