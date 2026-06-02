"use client";

// Sección de honorarios dentro del formulario del caso. Permite agregar
// N honorarios, cada uno con tipo + descripción + monto(s).
//
// Moneda simplificada a 3 opciones:
//   - Dólar (USD)  → muestra un solo input USD
//   - Peso  (DOP)  → muestra un solo input DOP
//   - Dólar y Peso → muestra DOS inputs (US$ + RD$ en la misma línea)

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CASE_FEE_CURRENCY_MODE_LABEL,
  CASE_FEE_CURRENCY_MODES,
  type CaseFeeCurrencyMode,
} from "@/lib/currencies";
import {
  CASE_FEE_TYPE_LABEL,
  type CaseFeeType,
} from "@/lib/schemas/caso";

const FEE_TYPES: CaseFeeType[] = ["flat_fee", "retainer", "success_fee", "other"];

/** Estado interno por fila — incluye el modo seleccionado para que la UI
 *  recuerde si el user eligió "Ambos" aunque solo haya cargado un monto.
 *  Al serializar al server, solo mandamos amountUsd / amountDop según el modo. */
type Row = {
  feeType: CaseFeeType;
  description: string;
  currencyMode: CaseFeeCurrencyMode;
  amountUsd: string;
  amountDop: string;
};

function defaultRow(): Row {
  return {
    feeType: "flat_fee",
    description: "",
    currencyMode: "DOP",
    amountUsd: "",
    amountDop: "",
  };
}

/** Convierte el estado interno al payload que va al server. Solo manda los
 *  montos relevantes según el modo seleccionado. */
function rowToPayload(r: Row) {
  return {
    feeType: r.feeType,
    description: r.description.trim() || undefined,
    amountUsd: r.currencyMode === "DOP" ? "" : r.amountUsd.trim(),
    amountDop: r.currencyMode === "USD" ? "" : r.amountDop.trim(),
  };
}

export function CaseFeesInput({
  defaultValue,
  error,
}: {
  defaultValue?: Row[];
  error?: string;
}) {
  const [rows, setRows] = useState<Row[]>(defaultValue ?? []);

  function add() {
    setRows((curr) => [...curr, defaultRow()]);
  }

  function remove(idx: number) {
    setRows((curr) => curr.filter((_, i) => i !== idx));
  }

  function update(idx: number, patch: Partial<Row>) {
    setRows((curr) => curr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Honorarios</label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
          Agregar honorario
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 p-3 text-[12px] text-muted-foreground">
          Sin honorarios cargados. Si el caso es por hora, podés dejarlo vacío.
          Para tarifa plana o iguala, agregá al menos un honorario.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, idx) => (
            <li key={idx} className="rounded-md border bg-card p-2">
              <div className="grid grid-cols-12 gap-2">
                {/* Tipo */}
                <select
                  aria-label="Tipo de honorario"
                  value={r.feeType}
                  onChange={(e) =>
                    update(idx, { feeType: e.target.value as CaseFeeType })
                  }
                  className="col-span-3 h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {FEE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CASE_FEE_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>

                {/* Descripción */}
                <Input
                  aria-label="Descripción"
                  placeholder="Descripción (opcional)"
                  value={r.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  className="col-span-5 h-9"
                />

                {/* Moneda — modo */}
                <select
                  aria-label="Moneda"
                  value={r.currencyMode}
                  onChange={(e) =>
                    update(idx, {
                      currencyMode: e.target.value as CaseFeeCurrencyMode,
                    })
                  }
                  className="col-span-3 h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {CASE_FEE_CURRENCY_MODES.map((m) => (
                    <option key={m} value={m}>
                      {CASE_FEE_CURRENCY_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>

                {/* Quitar */}
                <button
                  type="button"
                  aria-label="Quitar honorario"
                  onClick={() => remove(idx)}
                  className="col-span-1 grid h-9 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Montos — uno o dos según el modo */}
              <div className="mt-2 grid grid-cols-12 gap-2">
                {r.currencyMode !== "DOP" ? (
                  <div
                    className={
                      r.currencyMode === "BOTH"
                        ? "col-span-6 flex items-center gap-2"
                        : "col-span-12 flex items-center gap-2"
                    }
                  >
                    <span className="text-[11px] font-mono text-muted-foreground w-9 text-right">
                      US$
                    </span>
                    <Input
                      aria-label="Monto en dólares"
                      placeholder="0.00"
                      inputMode="decimal"
                      value={r.amountUsd}
                      onChange={(e) => update(idx, { amountUsd: e.target.value })}
                      className="h-9 text-right font-mono"
                    />
                  </div>
                ) : null}

                {r.currencyMode !== "USD" ? (
                  <div
                    className={
                      r.currencyMode === "BOTH"
                        ? "col-span-6 flex items-center gap-2"
                        : "col-span-12 flex items-center gap-2"
                    }
                  >
                    <span className="text-[11px] font-mono text-muted-foreground w-9 text-right">
                      RD$
                    </span>
                    <Input
                      aria-label="Monto en pesos"
                      placeholder="0.00"
                      inputMode="decimal"
                      value={r.amountDop}
                      onChange={(e) => update(idx, { amountDop: e.target.value })}
                      className="h-9 text-right font-mono"
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}

      {/* Hidden input que el form submit pasa al server. Mandamos solo los
          montos relevantes según el modo — el modo en sí no se guarda. */}
      <input
        type="hidden"
        name="fees"
        value={JSON.stringify(rows.map(rowToPayload))}
      />
    </div>
  );
}
