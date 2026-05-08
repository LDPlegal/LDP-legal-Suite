"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateInvoiceFromCase } from "@/lib/db/queries/invoices";
import { getClientById } from "@/lib/db/queries/clients";

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
  fiscal: z.boolean().default(false),
  ncfType: z.enum(["B01", "B02", "E31", "E32"]).optional(),
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

  const fiscalRaw = formData.get("fiscal");
  const fiscal = fiscalRaw === "true" || fiscalRaw === "on";

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
    fiscal,
    ncfType: formData.get("ncfType") || undefined,
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }
  if (parsed.data.fiscal && !parsed.data.ncfType) {
    return { ok: false, error: "Modo fiscal requiere seleccionar el tipo de NCF." };
  }

  // DGII: B01 y E31 (crédito fiscal) sólo se emiten a personas jurídicas con RNC.
  // Validamos antes de tomar el siguiente NCF del rango (evita gastar uno y luego rollback).
  if (
    parsed.data.fiscal &&
    (parsed.data.ncfType === "B01" || parsed.data.ncfType === "E31")
  ) {
    const client = await getClientById(user.firmId, user.userId, parsed.data.clientId);
    if (!client?.taxId || client.taxIdType !== "rnc") {
      return {
        ok: false,
        error: `El tipo ${parsed.data.ncfType} (crédito fiscal) requiere que el cliente tenga RNC. Edita el cliente y vuelve a intentar.`,
      };
    }
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
      fiscal: parsed.data.fiscal,
      ncfType: parsed.data.ncfType,
    });
    revalidatePath("/facturacion");
    revalidatePath(`/casos/${parsed.data.caseId}`);
    // Returning ok:true (instead of redirect()) lets the drawer toast,
    // close itself, and call router.push to /facturacion/[id]. Redirect
    // from here was opaque to useActionState — the drawer thought the
    // call was still pending, never showed success.
    return { ok: true, invoiceId: inv.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo generar la factura.",
    };
  }
}
