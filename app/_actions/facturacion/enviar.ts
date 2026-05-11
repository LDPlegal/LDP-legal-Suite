"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { markInvoiceSent } from "@/lib/db/queries/invoices";
import { logAuditStandalone } from "@/lib/audit/log";

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
  }
  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${parsed.invoiceId}`);
}
