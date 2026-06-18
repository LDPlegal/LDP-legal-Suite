// GET /api/facturacion/<id>/pdf
// Renders the invoice as a PDF stream using react-pdf.

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentUser } from "@/lib/auth/session";
import { getInvoiceById } from "@/lib/db/queries/invoices";
import { getCurrentFirm } from "@/lib/db/queries/firms";
import { InvoicePdf, type InvoicePdfData } from "@/lib/invoicing/pdf";
import { num } from "@/lib/invoicing/calculate";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const inv = await getInvoiceById(user.firmId, user.userId, id);
  if (!inv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Portal-cliente users may only download PDFs of invoices belonging to
  // their own client. Without this guard a curious /portal user could enum
  // other clients' invoice IDs and pull their PDFs.
  if (user.role === "client" && inv.invoice.clientId !== user.clientId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const firm = await getCurrentFirm(user.firmId, user.userId);

  const settings = (firm?.settings ?? {}) as Record<string, unknown>;
  const data: InvoicePdfData = {
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
      number: inv.invoice.number,
      kind: inv.invoice.kind === "proforma" ? "proforma" : "standard",
      ncf: inv.invoice.ncf,
      issuedOn: inv.invoice.issuedOn,
      dueOn: inv.invoice.dueOn,
      status: inv.invoice.status,
      subtotal: num(inv.invoice.subtotal),
      itbisAmount: num(inv.invoice.itbisAmount),
      isrWithholdingAmount: num(inv.invoice.isrWithholdingAmount),
      itbisWithholdingAmount: num(inv.invoice.itbisWithholdingAmount),
      total: num(inv.invoice.total),
      balance: num(inv.invoice.balance),
      currency: inv.invoice.currency,
      notes: inv.invoice.notes,
      terms: inv.invoice.terms,
    },
    client: {
      name: inv.client?.displayName ?? "",
      legalName: inv.client?.legalName ?? null,
      taxId: inv.client?.taxId ?? null,
      address: inv.client?.billingAddress ?? inv.client?.address ?? null,
    },
    case: inv.case ? { code: inv.case.code, title: inv.case.title } : null,
    items: inv.items.map((it) => ({
      description: it.description,
      quantity: num(it.quantity),
      unitPrice: num(it.unitPrice),
      taxRate: num(it.taxRate),
      taxAmount: num(it.taxAmount),
      amount: num(it.amount),
    })),
  };

  const buffer = await renderToBuffer(<InvoicePdf data={data} />);
  const filename = `${inv.invoice.number}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
