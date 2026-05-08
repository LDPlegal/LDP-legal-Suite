"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
  editarFacturaAction,
  type EditarFacturaState,
} from "@/app/_actions/facturacion/editar";
import { computeTotals, formatMoney, type LineInput } from "@/lib/invoicing/calculate";

const initial: EditarFacturaState = { ok: true };

type DraftLine = LineInput & { uiKey: string };

export type EditableLine = {
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  taxRate: string | number;
  sourceType: "time_entry" | "expense" | "manual";
  sourceId: string | null;
};

export function EditarFacturaDrawer({
  trigger,
  invoiceId,
  initialDueOn,
  initialNotes,
  initialTerms,
  initialIsr,
  initialLines,
}: {
  trigger: ReactNode;
  invoiceId: string;
  initialDueOn: Date;
  initialNotes: string | null;
  initialTerms: string | null;
  initialIsr: boolean;
  initialLines: EditableLine[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [isr, setIsr] = useState(initialIsr);
  const [lines, setLines] = useState<DraftLine[]>(() =>
    initialLines.map((l, i) => ({
      uiKey: `i:${i}`,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      description: l.description,
      quantity: typeof l.quantity === "string" ? Number(l.quantity) : l.quantity,
      unitPrice: typeof l.unitPrice === "string" ? Number(l.unitPrice) : l.unitPrice,
      taxRate: typeof l.taxRate === "string" ? Number(l.taxRate) : l.taxRate,
    })),
  );

  const includedLines = useMemo<LineInput[]>(
    () =>
      lines
        .filter((l) => l.quantity > 0 && l.description.trim().length > 0)
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

  const [state, action, pending] = useActionState<EditarFacturaState, FormData>(
    async (prev, fd) => {
      const result = await editarFacturaAction(prev, fd);
      if (result.ok) {
        toast.success("Factura actualizada");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
      return result;
    },
    initial,
  );

  const dueIso = new Date(initialDueOn).toISOString().slice(0, 10);

  function patch(uiKey: string, p: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.uiKey === uiKey ? { ...l, ...p } : l)));
  }
  function remove(uiKey: string) {
    setLines((prev) => prev.filter((l) => l.uiKey !== uiKey));
  }
  function addManual() {
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
      },
    ]);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Editar borrador</SheetTitle>
          <SheetDescription>
            Modifica líneas, vencimiento, notas y términos. Los tiempos / gastos que quites
            vuelven a estado «aprobado» para usarlos en otra factura.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("invoiceId", invoiceId);
            fd.set("lines", JSON.stringify(includedLines));
            fd.set("isrWithholding", isr ? "true" : "false");
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Líneas</Label>
                <Button type="button" variant="outline" size="sm" onClick={addManual}>
                  <Plus className="h-3.5 w-3.5" />
                  Línea manual
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
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
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          Sin líneas. Agrega una manual.
                        </td>
                      </tr>
                    ) : null}
                    {lines.map((l) => {
                      const lineAmt = Math.round(l.quantity * l.unitPrice * 100) / 100;
                      return (
                        <tr key={l.uiKey}>
                          <td className="p-2">
                            <Input
                              value={l.description}
                              onChange={(e) => patch(l.uiKey, { description: e.target.value })}
                              className="h-8"
                            />
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {l.sourceType === "time_entry"
                                ? "Tiempo"
                                : l.sourceType === "expense"
                                  ? "Gasto"
                                  : "Manual"}
                            </p>
                          </td>
                          <td className="p-2 align-top">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.quantity}
                              onChange={(e) =>
                                patch(l.uiKey, { quantity: Number(e.target.value) || 0 })
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
                                patch(l.uiKey, { unitPrice: Number(e.target.value) || 0 })
                              }
                              className="h-8 text-right"
                            />
                          </td>
                          <td className="p-2 align-top">
                            <select
                              value={l.taxRate}
                              onChange={(e) => patch(l.uiKey, { taxRate: Number(e.target.value) })}
                              className="h-8 w-full rounded-md border border-input bg-background px-1 text-sm"
                            >
                              <option value={0}>0%</option>
                              <option value={0.18}>18%</option>
                            </select>
                          </td>
                          <td className="p-2 text-right align-top font-mono tabular-nums">
                            {formatMoney(lineAmt)}
                          </td>
                          <td className="p-2 align-top">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => remove(l.uiKey)}
                              aria-label="Quitar"
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
                <Input id="dueOn" name="dueOn" type="date" required defaultValue={dueIso} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Retención ISR (10%)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Cliente retiene y paga a DGII por ti.
                  </p>
                </div>
                <Switch checked={isr} onCheckedChange={setIsr} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={3} defaultValue={initialNotes ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="terms">Términos</Label>
                <Textarea id="terms" name="terms" rows={3} defaultValue={initialTerms ?? ""} />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatMoney(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>ITBIS</span>
                <span className="font-mono tabular-nums">{formatMoney(totals.itbisAmount)}</span>
              </div>
              {totals.isrWithholdingAmount > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>− Retención ISR (10%)</span>
                  <span className="font-mono tabular-nums">
                    − {formatMoney(totals.isrWithholdingAmount)}
                  </span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                <span>Total a cobrar</span>
                <span className="font-mono tabular-nums">{formatMoney(totals.total)}</span>
              </div>
            </div>

            {!state.ok && state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || includedLines.length === 0}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Guardar cambios
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
