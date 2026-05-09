"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { voidInvoice } from "@/lib/db/queries/invoices";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({ invoiceId: z.string().uuid() });

export async function anularFacturaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    throw new Error("Solo admins y socios pueden anular facturas.");
  }
  const parsed = Schema.parse({ invoiceId: formData.get("invoiceId") });
  const inv = await voidInvoice(user.firmId, user.userId, parsed.invoiceId);
  if (inv) {
    await logAuditStandalone({
      firmId: user.firmId,
      userId: user.userId,
      entityType: "invoice",
      entityId: inv.id,
      caseId: inv.caseId ?? undefined,
      action: "voided",
      summary: `Anuló factura ${inv.number}${inv.ncf ? ` (NCF ${inv.ncf})` : ""}`,
    });
  }
  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${parsed.invoiceId}`);
}
