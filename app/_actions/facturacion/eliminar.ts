"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getInvoiceById, softDeleteInvoice } from "@/lib/db/queries/invoices";

const Schema = z.object({ invoiceId: z.string().uuid() });

export async function eliminarFacturaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    throw new Error("Solo admins y socios pueden eliminar facturas.");
  }
  const parsed = Schema.parse({ invoiceId: formData.get("invoiceId") });

  // Only drafts. Sent/paid invoices must be voided (anularFacturaAction)
  // because once the client has the document the audit trail must be preserved.
  const inv = await getInvoiceById(user.firmId, user.userId, parsed.invoiceId);
  if (!inv) throw new Error("Factura no encontrada.");
  if (inv.invoice.status !== "draft") {
    throw new Error("Solo borradores pueden eliminarse. Anula la factura en su lugar.");
  }

  await softDeleteInvoice(user.firmId, user.userId, parsed.invoiceId);
  revalidatePath("/facturacion");
  redirect("/facturacion");
}
