"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getInvoiceById, recordPayment } from "@/lib/db/queries/invoices";
import { logAuditStandalone } from "@/lib/audit/log";

const Schema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/u),
  method: z.enum(["cash", "transfer", "check", "card", "other"]),
  paidOn: z.string().min(1),
  reference: z.string().trim().max(100).optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});

export type PagoFormState =
  | { ok: true }
  | { ok: false; error: string };

export async function registrarPagoAction(
  _prev: PagoFormState | undefined,
  formData: FormData,
): Promise<PagoFormState> {
  const user = await requireUser();
  const parsed = Schema.safeParse({
    invoiceId: formData.get("invoiceId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    paidOn: formData.get("paidOn"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }
  const amount = Number(parsed.data.amount);
  if (amount <= 0) return { ok: false, error: "El monto debe ser mayor a cero." };

  await recordPayment(user.firmId, user.userId, {
    invoiceId: parsed.data.invoiceId,
    amount,
    method: parsed.data.method,
    paidOn: new Date(parsed.data.paidOn),
    reference: parsed.data.reference ?? null,
    notes: parsed.data.notes ?? null,
  });
  // Resolve caseId so the case detail's Bitácora can correlate this payment
  // event with the case (the action targets the invoice, not the case).
  const inv = await getInvoiceById(user.firmId, user.userId, parsed.data.invoiceId);
  await logAuditStandalone({
    firmId: user.firmId,
    userId: user.userId,
    entityType: "invoice",
    entityId: parsed.data.invoiceId,
    caseId: inv?.invoice.caseId ?? undefined,
    action: "paid",
    summary: `Registró pago de DOP ${amount.toFixed(2)} (${parsed.data.method})`,
    diff: { amount, method: parsed.data.method, reference: parsed.data.reference ?? null },
  });
  revalidatePath(`/facturacion/${parsed.data.invoiceId}`);
  revalidatePath("/facturacion");
  return { ok: true };
}
