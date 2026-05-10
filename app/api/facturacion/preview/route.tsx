// POST /api/facturacion/preview
// Renders an invoice PDF *without* persisting anything. The drawer's "Vista
// previa" button posts the same data it would submit to generate, opens the
// response in a new tab, and the user can decide whether to commit. This
// avoids needing to create a draft invoice in the DB just to inspect the PDF.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentFirm } from "@/lib/db/queries/firms";
import { getClientById } from "@/lib/db/queries/clients";
import { getCaseById } from "@/lib/db/queries/cases";
import { computeTotals } from "@/lib/invoicing/calculate";
import { InvoicePdf, type InvoicePdfData } from "@/lib/invoicing/pdf";

const LineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).max(1),
  sourceType: z.enum(["time_entry", "expense", "manual"]),
  sourceId: z.string().uuid().nullable(),
});

const Schema = z.object({
  caseId: z.string().uuid(),
  clientId: z.string().uuid(),
  lines: z.array(LineSchema).min(1),
  isrWithholding: z.boolean(),
  dueOn: z.string().min(1),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Invoice generation preview is a staff-only operation.
  if (user.role === "client") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const totals = computeTotals(data.lines, { isrWithholding: data.isrWithholding });
  const [firm, client, kase] = await Promise.all([
    getCurrentFirm(user.firmId, user.userId),
    getClientById(user.firmId, user.userId, data.clientId),
    getCaseById(user.firmId, user.userId, data.caseId),
  ]);

  const settings = (firm?.settings ?? {}) as Record<string, unknown>;
  const pdfData: InvoicePdfData = {
    firm: {
      name: firm?.name ?? "",
      rnc: firm?.rnc ?? null,
      address: firm?.address ?? null,
      logoUrl: typeof firm?.logoUrl === "string" ? firm.logoUrl : null,
      invoiceHeader:
        typeof settings.invoiceHeader === "string" ? settings.invoiceHeader : null,
      invoiceFooter:
        typeof settings.invoiceFooter === "string" ? settings.invoiceFooter : null,
    },
    invoice: {
      number: "VISTA PREVIA",
      ncf: null,
      issuedOn: new Date(),
      dueOn: new Date(data.dueOn),
      status: "draft",
      subtotal: totals.subtotal,
      itbisAmount: totals.itbisAmount,
      isrWithholdingAmount: totals.isrWithholdingAmount,
      itbisWithholdingAmount: totals.itbisWithholdingAmount,
      total: totals.total,
      balance: totals.total,
      currency: "DOP",
      notes: data.notes ?? null,
      terms: data.terms ?? null,
    },
    client: {
      name: client?.displayName ?? "",
      legalName: client?.legalName ?? null,
      taxId: client?.taxId ?? null,
      address: client?.billingAddress ?? client?.address ?? null,
    },
    case: kase ? { code: kase.case.code, title: kase.case.title } : null,
    items: totals.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      taxAmount: l.taxAmount,
      amount: l.amount,
    })),
  };

  const buffer = await renderToBuffer(<InvoicePdf data={pdfData} />);
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="vista-previa.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
