"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateInvoiceFromCase } from "@/lib/db/queries/invoices";

const LineSchema = z.object({
  description: z.string().trim().min(1).max(400),
  quantity: z.number().positive().finite(),
  unitPrice: z.number().finite().min(0),
  taxRate: z.number().finite().min(0).max(1),
  sourceType: z.enum(["time_entry", "expense", "manual"]),
  sourceId: z.string().uuid().nullable(),
});

const Schema = z.object({
  caseId: z.string().uuid(),
  clientId: z.string().uuid(),
  lines: z.array(LineSchema).min(1, "Selecciona al menos una línea"),
  timeEntryIds: z.array(z.string().uuid()).default([]),
  expenseIds: z.array(z.string().uuid()).default([]),
  isrWithholding: z.boolean().default(false),
  dueOn: z.string().min(1),
  notes: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
  terms: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
});

export type GenerarFacturaState =
  | { ok: true; invoiceId: string }
  | { ok: false; error: string };

export async function generarFacturaAction(
  _prev: GenerarFacturaState | undefined,
  formData: FormData,
): Promise<GenerarFacturaState> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "partner") {
    return { ok: false, error: "Solo admins y socios pueden generar facturas." };
  }

  const linesJson = formData.get("lines");
  const timeJson = formData.get("timeEntryIds");
  const expJson = formData.get("expenseIds");
  let lines: unknown[] = [];
  let timeEntryIds: string[] = [];
  let expenseIds: string[] = [];
  try {
    if (typeof linesJson === "string" && linesJson) lines = JSON.parse(linesJson);
    if (typeof timeJson === "string" && timeJson) timeEntryIds = JSON.parse(timeJson);
    if (typeof expJson === "string" && expJson) expenseIds = JSON.parse(expJson);
  } catch {
    return { ok: false, error: "Datos inválidos en el formulario." };
  }

  const parsed = Schema.safeParse({
    caseId: formData.get("caseId"),
    clientId: formData.get("clientId"),
    lines,
    timeEntryIds,
    expenseIds,
    isrWithholding:
      formData.get("isrWithholding") === "on" ||
      formData.get("isrWithholding") === "true",
    dueOn: formData.get("dueOn"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  try {
    const inv = await generateInvoiceFromCase(user.firmId, user.userId, {
      caseId: parsed.data.caseId,
      clientId: parsed.data.clientId,
      lines: parsed.data.lines,
      timeEntryIds: parsed.data.timeEntryIds,
      expenseIds: parsed.data.expenseIds,
      isrWithholding: parsed.data.isrWithholding,
      dueOn: new Date(parsed.data.dueOn),
      notes: parsed.data.notes ?? null,
      terms: parsed.data.terms ?? null,
    });
    revalidatePath("/facturacion");
    revalidatePath(`/casos/${parsed.data.caseId}`);
    redirect(`/facturacion/${inv.id}`);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo generar la factura.",
    };
  }
}
