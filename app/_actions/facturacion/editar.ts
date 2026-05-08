"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { updateInvoiceDraft } from "@/lib/db/queries/invoices";

const LineSchema = z.object({
  description: z.string().trim().min(1).max(400),
  quantity: z.number().positive().finite(),
  unitPrice: z.number().finite().min(0),
  taxRate: z.number().finite().min(0).max(1),
  sourceType: z.enum(["time_entry", "expense", "manual"]),
  sourceId: z.string().uuid().nullable(),
});

const Schema = z.object({
  invoiceId: z.string().uuid(),
  dueOn: z.string().min(1),
  notes: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
  terms: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
  isrWithholding: z.boolean(),
  lines: z.array(LineSchema).min(1, "Debe haber al menos una línea."),
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

  let lines: unknown[] = [];
  try {
    const raw = formData.get("lines");
    if (typeof raw === "string" && raw) lines = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Líneas inválidas." };
  }

  const parsed = Schema.safeParse({
    invoiceId: formData.get("invoiceId"),
    dueOn: formData.get("dueOn"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
    isrWithholding:
      formData.get("isrWithholding") === "true" || formData.get("isrWithholding") === "on",
    lines,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  const updated = await updateInvoiceDraft(user.firmId, user.userId, parsed.data.invoiceId, {
    dueOn: new Date(parsed.data.dueOn),
    notes: parsed.data.notes ?? null,
    terms: parsed.data.terms ?? null,
    isrWithholding: parsed.data.isrWithholding,
    lines: parsed.data.lines,
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
