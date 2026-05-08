"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { voidInvoice } from "@/lib/db/queries/invoices";

const Schema = z.object({ invoiceId: z.string().uuid() });

export async function anularFacturaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    throw new Error("Solo admins y socios pueden anular facturas.");
  }
  const parsed = Schema.parse({ invoiceId: formData.get("invoiceId") });
  await voidInvoice(user.firmId, user.userId, parsed.invoiceId);
  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${parsed.invoiceId}`);
}
