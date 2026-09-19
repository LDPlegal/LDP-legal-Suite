// lib/invoicing/pdf.tsx
//
// Plantilla react-pdf para facturas. El renderer corre server-side en un route
// handler (`/api/facturacion/[id]/pdf`) y stremea los bytes. Tres modos:
//   - proforma: "FACTURA PROFORMA, documento sin valor fiscal".
//   - interna (standard sin NCF): "FACTURA INTERNA, no válida fines fiscales".
//   - fiscal (standard con NCF): muestra NCF + disclaimer DGII.
//
// Rediseño (Fase 10): cabecera navy con acento dorado, tarjetas de partes,
// tabla con header navy + filas zebra, bloque de totales tipo recibo.

import {
  Document as PdfDocument,
  Image as PdfImage,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { formatMoney } from "./calculate";

// Helvetica (built-in) para evitar cargar fuentes en serverless.
Font.register({ family: "Helvetica", fonts: [{ src: "Helvetica" }] });

// Paleta de marca LDP.
const NAVY = "#0F4C81";
const NAVY_DEEP = "#051D33";
const GOLD = "#B89254";
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const ZEBRA = "#F8FAFC";
const TH_BG = "#0F4C81";

const styles = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 44, paddingHorizontal: 0, fontSize: 10, fontFamily: "Helvetica", color: INK },

  // Banda de aviso (proforma / interna)
  band: {
    color: "#FFFFFF",
    paddingVertical: 6,
    paddingHorizontal: 40,
    fontSize: 9,
    textAlign: "center",
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  // Cabecera navy
  header: {
    backgroundColor: NAVY_DEEP,
    paddingHorizontal: 40,
    paddingTop: 26,
    paddingBottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  goldRule: { height: 3, backgroundColor: GOLD },
  brandRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  brand: { fontSize: 17, fontWeight: "bold", color: "#FFFFFF" },
  brandSub: { fontSize: 8.5, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  docLabel: { fontSize: 9, color: GOLD, fontWeight: "bold", letterSpacing: 1, textAlign: "right" },
  docNumber: { fontSize: 18, fontWeight: "bold", color: "#FFFFFF", textAlign: "right", marginTop: 2 },
  docMeta: { fontSize: 8.5, color: "rgba(255,255,255,0.8)", textAlign: "right", marginTop: 4 },

  body: { paddingHorizontal: 40, paddingTop: 18 },

  // Tarjetas de partes
  twoCol: { flexDirection: "row", gap: 14, marginBottom: 16 },
  partyCard: {
    flex: 1,
    borderWidth: 0.7,
    borderColor: LINE,
    borderRadius: 6,
    padding: 10,
    backgroundColor: ZEBRA,
  },
  partyTitle: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  partyName: { fontSize: 11, fontWeight: "bold", color: INK },
  partySub: { fontSize: 8.5, color: MUTED, marginTop: 1.5 },

  // Tabla
  table: { marginTop: 4, borderWidth: 0.7, borderColor: LINE, borderRadius: 6, overflow: "hidden" },
  th: {
    flexDirection: "row",
    backgroundColor: TH_BG,
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontWeight: "bold",
    fontSize: 8.5,
    color: "#FFFFFF",
  },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, fontSize: 9.5 },
  trZebra: { backgroundColor: ZEBRA },
  cellDesc: { flex: 5 },
  cellQty: { flex: 1, textAlign: "right" },
  cellPrice: { flex: 1.6, textAlign: "right" },
  cellTax: { flex: 1, textAlign: "right" },
  cellAmt: { flex: 1.6, textAlign: "right" },

  // Totales tipo recibo
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: 240, borderWidth: 0.7, borderColor: LINE, borderRadius: 6, padding: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  totalLabel: { color: MUTED },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 6,
    borderTopWidth: 1.2,
    borderTopColor: NAVY,
    fontSize: 13,
    fontWeight: "bold",
    color: NAVY,
  },
  balancePill: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FEF3C7",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 9.5,
    fontWeight: "bold",
    color: "#92400E",
  },

  noteBlock: { marginTop: 16, fontSize: 9, color: MUTED },
  noteTitle: { fontWeight: "bold", color: INK, marginBottom: 2, fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.5 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    paddingTop: 10,
    borderTopWidth: 0.7,
    borderTopColor: LINE,
    fontSize: 7.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export type InvoicePdfData = {
  firm: {
    name: string;
    rnc: string | null;
    address: string | null;
    logoUrl: string | null;
    invoiceHeader: string | null;
    invoiceFooter: string | null;
  };
  invoice: {
    number: string;
    kind?: "standard" | "proforma";
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
  const isProforma = data.invoice.kind === "proforma";
  const isFiscal = !isProforma && !!data.invoice.ncf;
  const isInternal = !isProforma && !data.invoice.ncf;

  const docLabel = isProforma ? "PROFORMA" : "FACTURA";

  return (
    <PdfDocument>
      <Page size="LETTER" style={styles.page}>
        {/* Banda de aviso según tipo */}
        {isProforma ? (
          <Text style={[styles.band, { backgroundColor: GOLD }]}>
            FACTURA PROFORMA, DOCUMENTO SIN VALOR FISCAL · NO ES COMPROBANTE DE PAGO
          </Text>
        ) : isInternal ? (
          <Text style={[styles.band, { backgroundColor: "#D97706" }]}>
            FACTURA INTERNA, NO VÁLIDA PARA FINES FISCALES
          </Text>
        ) : null}

        {/* Cabecera navy */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            {data.firm.logoUrl ? (
              <PdfImage
                src={data.firm.logoUrl}
                style={{ width: 52, height: 52, objectFit: "contain" }}
              />
            ) : null}
            <View>
              <Text style={styles.brand}>{data.firm.name}</Text>
              {data.firm.rnc ? <Text style={styles.brandSub}>RNC {data.firm.rnc}</Text> : null}
              {data.firm.address ? <Text style={styles.brandSub}>{data.firm.address}</Text> : null}
            </View>
          </View>
          <View>
            <Text style={styles.docLabel}>{docLabel}</Text>
            <Text style={styles.docNumber}>{data.invoice.number}</Text>
            {data.invoice.ncf ? <Text style={styles.docMeta}>NCF: {data.invoice.ncf}</Text> : null}
            <Text style={styles.docMeta}>Emitida: {fmtDate(data.invoice.issuedOn)}</Text>
            <Text style={styles.docMeta}>
              {isProforma ? "Válida hasta" : "Vence"}: {fmtDate(data.invoice.dueOn)}
            </Text>
          </View>
        </View>
        <View style={styles.goldRule} />

        <View style={styles.body}>
          {data.firm.invoiceHeader ? (
            <Text style={{ fontSize: 9, color: MUTED, marginBottom: 12 }}>
              {data.firm.invoiceHeader}
            </Text>
          ) : null}

          {/* Partes */}
          <View style={styles.twoCol}>
            <View style={styles.partyCard}>
              <Text style={styles.partyTitle}>Facturado a</Text>
              <Text style={styles.partyName}>{data.client.legalName ?? data.client.name}</Text>
              {data.client.taxId ? (
                <Text style={styles.partySub}>RNC/Cédula: {data.client.taxId}</Text>
              ) : null}
              {data.client.address ? <Text style={styles.partySub}>{data.client.address}</Text> : null}
            </View>
            {data.case ? (
              <View style={styles.partyCard}>
                <Text style={styles.partyTitle}>Caso</Text>
                <Text style={styles.partyName}>{data.case.code}</Text>
                <Text style={styles.partySub}>{data.case.title}</Text>
              </View>
            ) : null}
          </View>

          {/* Tabla de conceptos */}
          <View style={styles.table}>
            <View style={styles.th}>
              <Text style={styles.cellDesc}>Concepto</Text>
              <Text style={styles.cellQty}>Cant.</Text>
              <Text style={styles.cellPrice}>P. unit.</Text>
              <Text style={styles.cellTax}>ITBIS</Text>
              <Text style={styles.cellAmt}>Total</Text>
            </View>
            {data.items.map((it, idx) => (
              <View key={idx} style={idx % 2 === 1 ? [styles.tr, styles.trZebra] : styles.tr}>
                <Text style={styles.cellDesc}>{it.description}</Text>
                <Text style={styles.cellQty}>{it.quantity.toFixed(2)}</Text>
                <Text style={styles.cellPrice}>{formatMoney(it.unitPrice, data.invoice.currency)}</Text>
                <Text style={styles.cellTax}>{(it.taxRate * 100).toFixed(0)}%</Text>
                <Text style={styles.cellAmt}>{formatMoney(it.amount, data.invoice.currency)}</Text>
              </View>
            ))}
          </View>

          {/* Totales */}
          <View style={styles.totalsWrap}>
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
              {!isProforma && data.invoice.balance > 0 && data.invoice.balance < data.invoice.total ? (
                <View style={styles.balancePill}>
                  <Text>Balance pendiente</Text>
                  <Text>{formatMoney(data.invoice.balance, data.invoice.currency)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {data.invoice.notes ? (
            <View style={styles.noteBlock}>
              <Text style={styles.noteTitle}>Notas</Text>
              <Text>{data.invoice.notes}</Text>
            </View>
          ) : null}
          {data.invoice.terms ? (
            <View style={styles.noteBlock}>
              <Text style={styles.noteTitle}>Términos</Text>
              <Text>{data.invoice.terms}</Text>
            </View>
          ) : null}

          {/* Disclaimers según tipo */}
          {isProforma ? (
            <View style={styles.noteBlock}>
              <Text style={{ fontSize: 8, color: MUTED }}>
                Este documento es una PROFORMA con fines de cotización. No constituye
                comprobante fiscal ni recibo de pago, no genera crédito fiscal y no
                ampara obligaciones tributarias. La factura definitiva se emitirá al
                confirmarse la operación.
              </Text>
            </View>
          ) : isFiscal ? (
            <View style={styles.noteBlock}>
              <Text style={{ fontSize: 8, color: MUTED }}>
                Comprobante Fiscal emitido al amparo del Código Tributario y la Ley 32-23
                de Facturación Electrónica. NCF {data.invoice.ncf} · RNC emisor{" "}
                {data.firm.rnc ?? "-"}.
              </Text>
            </View>
          ) : null}

          {data.firm.invoiceFooter ? (
            <View style={styles.noteBlock}>
              <Text style={{ fontSize: 8.5, color: MUTED }}>{data.firm.invoiceFooter}</Text>
            </View>
          ) : null}
        </View>

        {/* Footer fijo */}
        <View style={styles.footer} fixed>
          <Text>{data.firm.name}{data.firm.rnc ? ` · RNC ${data.firm.rnc}` : ""}</Text>
          <Text>{docLabel} {data.invoice.number}</Text>
        </View>
      </Page>
    </PdfDocument>
  );
}
