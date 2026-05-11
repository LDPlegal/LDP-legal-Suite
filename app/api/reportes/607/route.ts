// GET /api/reportes/607?year=2026&month=5
//
// DGII 607 (ventas con NCF). Una línea por factura con NCF emitida en el
// período, pipe-delimited, formato estándar DGII. El contador sube este
// archivo a la oficina virtual.

import { NextResponse } from "next/server";
import { requireUser, hasAdminPowers } from "@/lib/auth/session";
import { dgii607Report } from "@/lib/db/queries/audit";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function digitsOnly(s: string | null): string {
  return (s ?? "").replace(/\D+/gu, "");
}

function fmtDate(d: Date): string {
  // DGII espera AAAAMMDD
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
}

function fmtAmount(s: string): string {
  // DGII espera decimales con punto y 2 dígitos
  return Number(s).toFixed(2);
}

// Mapeo de tipo NCF a "Tipo de Ingreso" del 607. Para una firma legal todas
// las facturas suelen ser ingresos por servicios (tipo 03).
const TIPO_INGRESO = "03";

// Mapeo tax_id_type del cliente al "Tipo Identificación" del 607.
// 1 = RNC, 2 = Cédula, 3 = Pasaporte.
function taxIdTypeCode(t: string | null): string {
  if (t === "rnc") return "1";
  if (t === "cedula") return "2";
  if (t === "passport") return "3";
  return "1";
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!hasAdminPowers(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
  const month = Number(url.searchParams.get("month")) || new Date().getUTCMonth() + 1;

  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const rows = await dgii607Report(user.firmId, user.userId, { from, to });

  // Header DGII estilo simple: RNC del emisor, periodo, cantidad de registros.
  // El formato exacto varía por versión; usamos la estructura más usada
  // (la oficina virtual acepta el archivo plano sin header, con un registro
  // por línea, separado por pipes). Si tu contador necesita variante,
  // ajustar aquí.
  const lines = rows.map((r) => {
    const taxIdDigits = digitsOnly(r.client_tax_id);
    return [
      taxIdTypeCode(r.client_tax_id_type),
      taxIdDigits,
      TIPO_INGRESO,
      r.ncf,
      "", // NCF Modificado (no aplica)
      fmtDate(new Date(r.issued_on)),
      fmtDate(new Date(r.issued_on)), // Fecha retención (= emisión para servicios)
      fmtAmount(r.total),
      fmtAmount(r.itbis),
      "0.00", // ITBIS retenido
      "0.00", // ITBIS percibido
      fmtAmount(r.isr_withholding), // Retención renta
      "0.00", // ISR percibido
      "0.00", // Impuesto selectivo
      "0.00", // Otros impuestos
      "0.00", // Propina legal
      "00", // Forma de pago (00 = no aplica)
    ].join("|");
  });

  const body = lines.join("\r\n");
  const filename = `607_${year}${pad(month, 2)}.txt`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
