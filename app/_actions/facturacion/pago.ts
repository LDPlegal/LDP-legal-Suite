"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { recordPayment } from "@/lib/db/queries/invoices";

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
  revalidatePath(`/facturacion/${parsed.data.invoiceId}`);
  revalidatePath("/facturacion");
  return { ok: true };
}
