"use client";

// Sección de honorarios dentro del formulario del caso. Permite agregar
// N honorarios, cada uno con tipo + descripción + monto + moneda.
// Internamente mantiene el array en state y serializa a JSON en un input
// hidden `fees` que el server action parsea con Zod.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CURRENCIES } from "@/lib/currencies";
import {
  CASE_FEE_TYPE_LABEL,
  type CaseFeeInput,
  type CaseFeeType,
} from "@/lib/schemas/caso";

const FEE_TYPES: CaseFeeType[] = ["flat_fee", "retainer", "success_fee", "other"];

export function CaseFeesInput({
  defaultValue,
  error,
}: {
  defaultValue?: CaseFeeInput[];
  /** Mensaje de error de validación del schema (si hay). */
  error?: string;
}) {
  const [fees, setFees] = useState<CaseFeeInput[]>(defaultValue ?? []);

  function add() {
    setFees((curr) => [
      ...curr,
      { feeType: "flat_fee", description: "", amount: "", currency: "DOP" },
    ]);
  }

  function remove(idx: number) {
    setFees((curr) => curr.filter((_, i) => i !== idx));
  }

  function update(idx: number, patch: Partial<CaseFeeInput>) {
    setFees((curr) => curr.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Honorarios (multi-moneda)</label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
          Agregar honorario
        </Button>
      </div>

      {fees.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 p-3 text-[12px] text-muted-foreground">
          Sin honorarios cargados. Si el caso es por hora, podés dejarlo vacío.
          Para tarifa plana o iguala, agregá al menos un honorario.
        </p>
      ) : (
        <ul className="space-y-2">
          {fees.map((f, idx) => (
            <li
              key={idx}
              className="grid grid-cols-12 gap-2 rounded-md border bg-card p-2"
            >
              <select
                aria-label="Tipo de honorario"
                value={f.feeType}
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

              <Input
                aria-label="Descripción"
                placeholder="Descripción (opcional)"
                value={f.description ?? ""}
                onChange={(e) => update(idx, { description: e.target.value })}
                className="col-span-4 h-9"
              />

              <Input
                aria-label="Monto"
                placeholder="0.00"
                inputMode="decimal"
                value={f.amount}
                onChange={(e) => update(idx, { amount: e.target.value })}
                className="col-span-3 h-9 text-right font-mono"
              />

              <select
                aria-label="Moneda"
                value={f.currency}
                onChange={(e) => update(idx, { currency: e.target.value })}
                className="col-span-1 h-9 rounded-md border border-input bg-background px-1 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>

              <button
                type="button"
                aria-label="Quitar honorario"
                onClick={() => remove(idx)}
                className="col-span-1 grid h-9 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}

      {/* Hidden input que el form submit pasa al server. */}
      <input type="hidden" name="fees" value={JSON.stringify(fees)} />
    </div>
  );
}
