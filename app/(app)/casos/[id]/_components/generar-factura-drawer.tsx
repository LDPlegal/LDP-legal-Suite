"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  generarFacturaAction,
  type GenerarFacturaState,
} from "@/app/_actions/facturacion/generar";
import { computeTotals, formatMoney, num, type LineInput } from "@/lib/invoicing/calculate";
import { NCF_TYPE_LABEL, type NcfType } from "@/lib/invoicing/ncf";

const initial: GenerarFacturaState = { ok: true, invoiceId: "" };

type TimeBillable = {
  id: string;
  description: string | null;
  startedAt: Date;
  durationSeconds: number;
  hourlyRateSnapshot: string | null;
  userName: string | null;
};

type ExpenseBillable = {
  id: string;
  description: string;
  incurredOn: Date;
  amount: string;
  currency: string;
  userName: string | null;
};

type DraftLine = LineInput & {
  uiKey: string;
  included: boolean;
  hint: string | null;
};

function buildInitialLines(b: { timeEntries: TimeBillable[]; expenses: ExpenseBillable[] }): DraftLine[] {
  const out: DraftLine[] = [];
  for (const t of b.timeEntries) {
    const hours = Math.round((t.durationSeconds / 3600) * 100) / 100;
    const rate = num(t.hourlyRateSnapshot);
    out.push({
      uiKey: `t:${t.id}`,
      sourceType: "time_entry",
      sourceId: t.id,
      description: t.description ?? `Honorarios profesionales (${hours.toFixed(2)}h)`,
      quantity: hours,
      unitPrice: rate,
      taxRate: 0.18,
      included: true,
      hint: t.userName ? `${t.userName} · ${hours.toFixed(2)}h` : `${hours.toFixed(2)}h`,
    });
  }
  for (const e of b.expenses) {
    out.push({
      uiKey: `e:${e.id}`,
      sourceType: "expense",
      sourceId: e.id,
      description: `Gasto: ${e.description}`,
      quantity: 1,
      unitPrice: num(e.amount),
      taxRate: 0,
      included: true,
      hint: e.userName,
    });
  }
  return out;
}

export function GenerarFacturaDrawer({
  trigger,
  caseId,
  clientId,
  isCorporate,
  billables,
  availableNcfTypes,
}: {
  trigger: ReactNode;
  caseId: string;
  clientId: string;
  isCorporate: boolean;
  billables: { timeEntries: TimeBillable[]; expenses: ExpenseBillable[] };
  /** NCF types with a configured (non-exhausted, non-expired) range. */
  availableNcfTypes: NcfType[];
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>(() => buildInitialLines(billables));
  const [isr, setIsr] = useState(isCorporate);
  const [fiscal, setFiscal] = useState(false);
  const [ncfType, setNcfType] = useState<NcfType | "">(
    availableNcfTypes[0] ?? "",
  );
  const [previewing, setPreviewing] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<GenerarFacturaState, FormData>(
    async (prev, fd) => {
      const result = await generarFacturaAction(prev, fd);
      if (result.ok) {
        toast.success("Factura generada");
        setOpen(false);
        router.push(`/facturacion/${result.invoiceId}`);
      } else {
        // Bubble the server error as a toast too — the inline message inside
        // the drawer body can be hidden by scroll on a long form.
        toast.error(result.error);
      }
      return result;
    },
    initial,
  );

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueIso = dueDate.toISOString().slice(0, 10);

  const includedLines = useMemo<LineInput[]>(
    () =>
      lines
        .filter((l) => l.included && l.quantity > 0 && l.description.trim().length > 0)
        .map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
          sourceType: l.sourceType,
          sourceId: l.sourceId,
        })),
    [lines],
  );

  const totals = useMemo(
    () => computeTotals(includedLines, { isrWithholding: isr }),
    [includedLines, isr],
  );

  function patchLine(uiKey: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.uiKey === uiKey ? { ...l, ...patch } : l)));
  }

  function addManualLine() {
    setLines((prev) => [
      ...prev,
      {
        uiKey: `m:${crypto.randomUUID()}`,
        sourceType: "manual",
        sourceId: null,
        description: "",
        quantity: 1,
        unitPrice: 0,
        taxRate: 0.18,
        included: true,
        hint: "Línea manual",
      },
    ]);
  }

  function removeLine(uiKey: string) {
    setLines((prev) => prev.filter((l) => l.uiKey !== uiKey));
  }

  async function previewPdf(form: HTMLFormElement) {
    setPreviewing(true);
    try {
      const dueOn = (form.elements.namedItem("dueOn") as HTMLInputElement)?.value || dueIso;
      const notes = (form.elements.namedItem("notes") as HTMLTextAreaElement)?.value || null;
      const terms = (form.elements.namedItem("terms") as HTMLTextAreaElement)?.value || null;
      const res = await fetch("/api/facturacion/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          clientId,
          lines: includedLines,
          isrWithholding: isr,
          dueOn,
          notes,
          terms,
        }),
      });
      if (!res.ok) {
        toast.error("No se pudo generar la vista previa.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setPreviewing(false);
    }
  }

  const includedTimeIds = lines
    .filter((l) => l.included && l.sourceType === "time_entry" && l.sourceId)
    .map((l) => l.sourceId as string);
  const includedExpIds = lines
    .filter((l) => l.included && l.sourceType === "expense" && l.sourceId)
    .map((l) => l.sourceId as string);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Generar factura</SheetTitle>
          <SheetDescription>
            Edita descripciones, cantidades, precios e ITBIS por línea. Los tiempos y gastos
            que marques se cierran como facturados al confirmar.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("caseId", caseId);
            fd.set("clientId", clientId);
            fd.set("lines", JSON.stringify(includedLines));
            fd.set("timeEntryIds", JSON.stringify(includedTimeIds));
            fd.set("expenseIds", JSON.stringify(includedExpIds));
            fd.set("isrWithholding", isr ? "true" : "false");
            fd.set("fiscal", fiscal && ncfType ? "true" : "false");
            if (fiscal && ncfType) fd.set("ncfType", ncfType);
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Líneas de la factura</Label>
                <Button type="button" variant="outline" size="sm" onClick={addManualLine}>
                  <Plus className="h-3.5 w-3.5" />
                  Línea manual
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-8 p-2"></th>
                      <th className="p-2 text-left">Concepto</th>
                      <th className="w-20 p-2 text-right">Cant.</th>
                      <th className="w-32 p-2 text-right">P. unit.</th>
                      <th className="w-24 p-2 text-right">ITBIS</th>
                      <th className="w-28 p-2 text-right">Total</th>
                      <th className="w-8 p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          Sin líneas. Aprueba tiempos / gastos del caso o agrega una línea manual.
                        </td>
                      </tr>
                    ) : null}
                    {lines.map((l) => {
                      const lineAmount = Math.round(l.quantity * l.unitPrice * 100) / 100;
                      return (
                        <tr key={l.uiKey} className={l.included ? "" : "opacity-50"}>
                          <td className="p-2 align-top">
                            <input
                              type="checkbox"
                              checked={l.included}
                              onChange={(e) =>
                                patchLine(l.uiKey, { included: e.target.checked })
                              }
                              aria-label="Incluir en la factura"
                              className="mt-1"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              value={l.description}
                              onChange={(e) =>
                                patchLine(l.uiKey, { description: e.target.value })
                              }
                              className="h-8"
                            />
                            {l.hint ? (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {l.hint}
                              </p>
                            ) : null}
                          </td>
                          <td className="p-2 align-top">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.quantity}
                              onChange={(e) =>
                                patchLine(l.uiKey, { quantity: Number(e.target.value) || 0 })
                              }
                              className="h-8 text-right"
                            />
                          </td>
                          <td className="p-2 align-top">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.unitPrice}
                              onChange={(e) =>
                                patchLine(l.uiKey, { unitPrice: Number(e.target.value) || 0 })
                              }
                              className="h-8 text-right"
                            />
                          </td>
                          <td className="p-2 align-top">
                            <select
                              value={l.taxRate}
                              onChange={(e) =>
                                patchLine(l.uiKey, { taxRate: Number(e.target.value) })
                              }
                              className="h-8 w-full rounded-md border border-input bg-background px-1 text-sm"
                            >
                              <option value={0}>0%</option>
                              <option value={0.18}>18%</option>
                            </select>
                          </td>
                          <td className="p-2 text-right align-top font-mono tabular-nums">
                            {formatMoney(lineAmount)}
                          </td>
                          <td className="p-2 align-top">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeLine(l.uiKey)}
                              aria-label="Quitar línea"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dueOn">Fecha de vencimiento *</Label>
                <Input id="dueOn" name="dueOn" type="date" defaultValue={dueIso} required />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Retención ISR (10%)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Marca cuando el cliente es persona jurídica que retiene.
                  </p>
                </div>
                <Switch checked={isr} onCheckedChange={setIsr} />
              </div>
            </div>

            {/* Modo fiscal — asigna NCF de un rango configurado */}
            <div className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm">Modo fiscal (con NCF)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Asigna un NCF del rango configurado y oculta el banner «Factura interna»
                    en el PDF. Configura rangos en{" "}
                    <a
                      href="/configuracion"
                      target="_blank"
                      rel="noopener"
                      className="underline underline-offset-2"
                    >
                      Configuración → Fiscal
                    </a>
                    .
                  </p>
                </div>
                <Switch
                  checked={fiscal}
                  onCheckedChange={(v) => setFiscal(v && availableNcfTypes.length > 0)}
                  disabled={availableNcfTypes.length === 0}
                />
              </div>
              {fiscal && availableNcfTypes.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="ncfType">Tipo de NCF *</Label>
                  <select
                    id="ncfType"
                    name="ncfType"
                    value={ncfType}
                    onChange={(e) => setNcfType(e.target.value as NcfType)}
                    required
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {availableNcfTypes.map((t) => (
                      <option key={t} value={t}>
                        {NCF_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {availableNcfTypes.length === 0 ? (
                <p className="mt-3 rounded-sm border border-dashed bg-muted/30 p-2 text-[11px] text-muted-foreground">
                  No hay rangos NCF configurados. La factura se emitirá en{" "}
                  <strong>modo interno</strong> (proforma) hasta que cargues rangos en
                  Configuración → Fiscal.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="terms">Términos (opcional)</Label>
                <Textarea
                  id="terms"
                  name="terms"
                  rows={2}
                  placeholder="Ej. Pago a 30 días vía transferencia."
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <Row label="Subtotal honorarios" value={formatMoney(totals.subtotal)} />
              <Row label="ITBIS" value={formatMoney(totals.itbisAmount)} />
              <div className="mt-1 flex justify-between border-t pt-1 text-sm font-medium">
                <span>Total honorarios brutos</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(totals.subtotal + totals.itbisAmount)}
                </span>
              </div>
              {totals.isrWithholdingAmount > 0 ? (
                <Row
                  label="− Retención ISR (10%) — paga el cliente a DGII por ti"
                  value={`− ${formatMoney(totals.isrWithholdingAmount)}`}
                />
              ) : null}
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                <span>Recibirás del cliente</span>
                <span className="font-mono tabular-nums">{formatMoney(totals.total)}</span>
              </div>
              {totals.isrWithholdingAmount > 0 ? (
                <p className="mt-2 rounded-sm bg-success/10 p-2 text-[10px] leading-relaxed text-foreground">
                  <strong>Tu honorario sigue siendo {formatMoney(totals.subtotal + totals.itbisAmount)}.</strong>{" "}
                  El cliente te transfiere {formatMoney(totals.total)} y deposita los{" "}
                  {formatMoney(totals.isrWithholdingAmount)} restantes a la DGII como anticipo de
                  tu ISR (Anexo A del 606). Esos {formatMoney(totals.isrWithholdingAmount)} son un
                  crédito que descuentas al pagar tu IR-2 anual — no son una rebaja a tu
                  honorario.
                </p>
              ) : null}
            </div>

            {!state.ok && state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={previewing || includedLines.length === 0}
              onClick={(e) => {
                const form = (e.currentTarget as HTMLButtonElement).form;
                if (form) void previewPdf(form);
              }}
            >
              {previewing ? <Loader2 className="animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Vista previa PDF
            </Button>
            <Button type="submit" disabled={pending || includedLines.length === 0}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Generar factura
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
