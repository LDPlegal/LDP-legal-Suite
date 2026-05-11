"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import {
  getInvoiceById,
  softDeleteInvoice,
  voidInvoice,
} from "@/lib/db/queries/invoices";

const Schema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1),
  operation: z.enum(["delete", "void"]),
});

export type BulkResult = {
  ok: boolean;
  processed: number;
  skipped: Array<{ id: string; reason: string }>;
};

export async function bulkInvoiceAction(formData: FormData): Promise<BulkResult> {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    throw new Error("Solo admins y socios pueden ejecutar acciones en bulk.");
  }
  const parsed = Schema.parse({
    invoiceIds: JSON.parse((formData.get("invoiceIds") as string) || "[]"),
    operation: formData.get("operation"),
  });

  let processed = 0;
  const skipped: BulkResult["skipped"] = [];
  for (const id of parsed.invoiceIds) {
    const inv = await getInvoiceById(user.firmId, user.userId, id);
    if (!inv) {
      skipped.push({ id, reason: "no encontrada" });
      continue;
    }
    if (parsed.operation === "delete") {
      if (inv.invoice.status !== "draft") {
        skipped.push({
          id,
          reason: `${inv.invoice.number}: solo borradores se eliminan; está ${inv.invoice.status}`,
        });
        continue;
      }
      await softDeleteInvoice(user.firmId, user.userId, id);
      processed++;
    } else if (parsed.operation === "void") {
      if (inv.invoice.status === "void" || inv.invoice.status === "paid") {
        skipped.push({
          id,
          reason: `${inv.invoice.number}: no se puede anular en estado ${inv.invoice.status}`,
        });
        continue;
      }
      await voidInvoice(user.firmId, user.userId, id);
      processed++;
    }
  }

  revalidatePath("/facturacion");
  return { ok: true, processed, skipped };
}
