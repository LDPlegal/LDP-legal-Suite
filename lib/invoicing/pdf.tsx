// lib/invoicing/pdf.tsx
//
// react-pdf template for invoices. The renderer runs server-side in a route
// handler (`/api/facturacion/[id]/pdf`) and streams the bytes back. Modo
// interno (sin NCF) muestra explícitamente "Factura interna — no válida para
// fines fiscales" en el header, como manda el maestro § 3.9.

import {
  Document as PdfDocument,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { formatMoney } from "./calculate";

// Use Helvetica (built-in) to avoid loading custom fonts in serverless contexts.
Font.register({ family: "Helvetica", fonts: [{ src: "Helvetica" }] });

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#0F172A" },
  band: {
    backgroundColor: "#F59E0B",
    color: "#FFFFFF",
    padding: 6,
    fontSize: 9,
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "bold",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  brand: { fontSize: 16, fontWeight: "bold", color: "#0F4C81" },
  sub: { fontSize: 9, color: "#64748B", marginTop: 2 },
  rightAligned: { textAlign: "right" },
  invoiceMeta: { fontSize: 11, fontWeight: "bold" },
  twoCol: { flexDirection: "row", gap: 24, marginBottom: 18 },
  partyTitle: { fontSize: 8, color: "#64748B", textTransform: "uppercase", marginBottom: 2 },
  partyName: { fontSize: 11, fontWeight: "bold" },
  table: { marginTop: 10 },
  th: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontWeight: "bold",
    fontSize: 9,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E2E8F0",
  },
  cellDesc: { flex: 5 },
  cellQty: { flex: 1, textAlign: "right" },
  cellPrice: { flex: 1.5, textAlign: "right" },
  cellTax: { flex: 1, textAlign: "right" },
  cellAmt: { flex: 1.5, textAlign: "right" },
  totals: {
    marginTop: 14,
    marginLeft: "auto",
    width: 220,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: { color: "#64748B" },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#0F172A",
    fontSize: 12,
    fontWeight: "bold",
  },
  footer: {
    marginTop: 30,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#E2E8F0",
    fontSize: 9,
    color: "#64748B",
  },
});

export type InvoicePdfData = {
  firm: {
    name: string;
    rnc: string | null;
    address: string | null;
  };
  invoice: {
    number: string;
    ncf: string | null;
    issuedOn: Date;
    dueOn: Date;
    status: string;
    subtotal: number;
    itbisAmount: number;
    isrWithholdingAmount: number;
    itbisWithholdingAmount: number;
    total: number;
    balance: number;
    currency: string;
    notes: string | null;
    terms: string | null;
  };
  client: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    address: string | null;
  };
  case: { code: string; title: string } | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    amount: number;
  }>;
};

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("es-DO", { dateStyle: "medium" });

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const isInternal = !data.invoice.ncf;
  return (
    <PdfDocument>
      <Page size="LETTER" style={styles.page}>
        {isInternal ? (
          <Text style={styles.band}>
            FACTURA INTERNA — NO VÁLIDA PARA FINES FISCALES
          </Text>
        ) : null}

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>{data.firm.name}</Text>
            {data.firm.rnc ? <Text style={styles.sub}>RNC {data.firm.rnc}</Text> : null}
            {data.firm.address ? <Text style={styles.sub}>{data.firm.address}</Text> : null}
          </View>
          <View style={styles.rightAligned}>
            <Text style={styles.invoiceMeta}>FACTURA {data.invoice.number}</Text>
            {data.invoice.ncf ? (
              <Text style={styles.sub}>NCF: {data.invoice.ncf}</Text>
            ) : null}
            <Text style={styles.sub}>Emitida: {fmtDate(data.invoice.issuedOn)}</Text>
            <Text style={styles.sub}>Vence: {fmtDate(data.invoice.dueOn)}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.partyTitle}>Facturado a</Text>
            <Text style={styles.partyName}>{data.client.legalName ?? data.client.name}</Text>
            {data.client.taxId ? <Text style={styles.sub}>RNC/Cédula: {data.client.taxId}</Text> : null}
            {data.client.address ? <Text style={styles.sub}>{data.client.address}</Text> : null}
          </View>
          {data.case ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.partyTitle}>Caso</Text>
              <Text style={styles.partyName}>{data.case.code}</Text>
              <Text style={styles.sub}>{data.case.title}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.cellDesc}>Concepto</Text>
            <Text style={styles.cellQty}>Cant.</Text>
            <Text style={styles.cellPrice}>P. unit.</Text>
            <Text style={styles.cellTax}>ITBIS</Text>
            <Text style={styles.cellAmt}>Total</Text>
          </View>
          {data.items.map((it, idx) => (
            <View key={idx} style={styles.tr}>
              <Text style={styles.cellDesc}>{it.description}</Text>
              <Text style={styles.cellQty}>{it.quantity.toFixed(2)}</Text>
              <Text style={styles.cellPrice}>{formatMoney(it.unitPrice, data.invoice.currency)}</Text>
              <Text style={styles.cellTax}>{(it.taxRate * 100).toFixed(0)}%</Text>
              <Text style={styles.cellAmt}>{formatMoney(it.amount, data.invoice.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text>{formatMoney(data.invoice.subtotal, data.invoice.currency)}</Text>
          </View>
          {data.invoice.itbisAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>ITBIS (18%)</Text>
              <Text>{formatMoney(data.invoice.itbisAmount, data.invoice.currency)}</Text>
            </View>
          ) : null}
          {data.invoice.isrWithholdingAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Retención ISR (10%)</Text>
              <Text>− {formatMoney(data.invoice.isrWithholdingAmount, data.invoice.currency)}</Text>
            </View>
          ) : null}
          {data.invoice.itbisWithholdingAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Retención ITBIS</Text>
              <Text>− {formatMoney(data.invoice.itbisWithholdingAmount, data.invoice.currency)}</Text>
            </View>
          ) : null}
          <View style={styles.grandTotal}>
            <Text>TOTAL</Text>
            <Text>{formatMoney(data.invoice.total, data.invoice.currency)}</Text>
          </View>
          {data.invoice.balance < data.invoice.total ? (
            <View style={[styles.totalRow, { marginTop: 6 }]}>
              <Text style={styles.totalLabel}>Balance pendiente</Text>
              <Text>{formatMoney(data.invoice.balance, data.invoice.currency)}</Text>
            </View>
          ) : null}
        </View>

        {data.invoice.notes ? (
          <View style={styles.footer}>
            <Text style={{ fontWeight: "bold", marginBottom: 2 }}>Notas</Text>
            <Text>{data.invoice.notes}</Text>
          </View>
        ) : null}
        {data.invoice.terms ? (
          <View style={styles.footer}>
            <Text style={{ fontWeight: "bold", marginBottom: 2 }}>Términos</Text>
            <Text>{data.invoice.terms}</Text>
          </View>
        ) : null}

        {/* DGII fiscal disclaimer when this is a fiscal invoice (has NCF). */}
        {!isInternal ? (
          <View style={[styles.footer, { marginTop: 18 }]}>
            <Text style={{ fontSize: 8, color: "#64748B" }}>
              Este documento es un Comprobante Fiscal emitido al amparo del Código
              Tributario y la Ley 32-23 de Facturación Electrónica. NCF{" "}
              {data.invoice.ncf} · RNC emisor {data.firm.rnc ?? "—"}.
            </Text>
          </View>
        ) : null}
      </Page>
    </PdfDocument>
  );
}
