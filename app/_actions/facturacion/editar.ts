"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateInvoiceDraft } from "@/lib/db/queries/invoices";

const Schema = z.object({
  invoiceId: z.string().uuid(),
  dueOn: z.string().min(1),
  notes: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
  terms: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
});

export type EditarFacturaState =
  | { ok: true }
  | { ok: false; error: string };

export async function editarFacturaAction(
  _prev: EditarFacturaState | undefined,
  formData: FormData,
): Promise<EditarFacturaState> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    return { ok: false, error: "Solo admins y socios pueden editar facturas." };
  }
  const parsed = Schema.safeParse({
    invoiceId: formData.get("invoiceId"),
    dueOn: formData.get("dueOn"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos." };
  }

  const updated = await updateInvoiceDraft(user.firmId, user.userId, parsed.data.invoiceId, {
    dueOn: new Date(parsed.data.dueOn),
    notes: parsed.data.notes ?? null,
    terms: parsed.data.terms ?? null,
  });
  if (!updated) {
    return {
      ok: false,
      error: "No se pudo actualizar. Solo facturas en borrador pueden editarse.",
    };
  }

  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${parsed.data.invoiceId}`);
  return { ok: true };
}
