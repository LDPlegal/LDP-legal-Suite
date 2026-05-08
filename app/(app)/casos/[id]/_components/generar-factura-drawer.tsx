"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatMoney, num } from "@/lib/invoicing/calculate";

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

export function GenerarFacturaDrawer({
  trigger,
  caseId,
  clientId,
  isCorporate,
  billables,
}: {
  trigger: ReactNode;
  caseId: string;
  clientId: string;
  isCorporate: boolean;
  billables: { timeEntries: TimeBillable[]; expenses: ExpenseBillable[] };
}) {
  const [open, setOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<Set<string>>(
    new Set(billables.timeEntries.map((t) => t.id)),
  );
  const [selectedExp, setSelectedExp] = useState<Set<string>>(
    new Set(billables.expenses.map((e) => e.id)),
  );
  const [isr, setIsr] = useState(isCorporate);
  const [state, action, pending] = useActionState<GenerarFacturaState, FormData>(
    generarFacturaAction,
    initial,
  );

  const subtotal = useMemo(() => {
    let s = 0;
    for (const t of billables.timeEntries) {
      if (!selectedTime.has(t.id)) continue;
      const hours = t.durationSeconds / 3600;
      s += hours * num(t.hourlyRateSnapshot);
    }
    for (const e of billables.expenses) {
      if (!selectedExp.has(e.id)) continue;
      s += num(e.amount);
    }
    return Math.round(s * 100) / 100;
  }, [billables, selectedTime, selectedExp]);

  const itbis = useMemo(() => {
    // Approximate: ITBIS only on time entries (services); expenses pass-through.
    let s = 0;
    for (const t of billables.timeEntries) {
      if (!selectedTime.has(t.id)) continue;
      const hours = t.durationSeconds / 3600;
      s += hours * num(t.hourlyRateSnapshot) * 0.18;
    }
    return Math.round(s * 100) / 100;
  }, [billables, selectedTime]);

  const isrAmount = isr ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total = Math.round((subtotal + itbis - isrAmount) * 100) / 100;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueIso = dueDate.toISOString().slice(0, 10);

  function toggleTime(id: string) {
    setSelectedTime((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleExp(id: string) {
    setSelectedExp((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const nothing = billables.timeEntries.length === 0 && billables.expenses.length === 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Generar factura</SheetTitle>
          <SheetDescription>
            Selecciona los tiempos y gastos aprobados a incluir. Sólo aparecen los que aún no están
            facturados.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("caseId", caseId);
            fd.set("clientId", clientId);
            fd.set("timeEntryIds", JSON.stringify(Array.from(selectedTime)));
            fd.set("expenseIds", JSON.stringify(Array.from(selectedExp)));
            fd.set("isrWithholding", isr ? "true" : "false");
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-5">
            {nothing ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No hay tiempos ni gastos aprobados pendientes de facturar en este caso.
                Aprueba primero las entradas relevantes desde la pestaña Tiempos / Gastos.
              </p>
            ) : null}

            {billables.timeEntries.length > 0 ? (
              <div className="space-y-1">
                <Label>Tiempos aprobados ({billables.timeEntries.length})</Label>
                <div className="rounded-md border">
                  {billables.timeEntries.map((t) => {
                    const hours = t.durationSeconds / 3600;
                    const amt = hours * num(t.hourlyRateSnapshot);
                    return (
                      <label
                        key={t.id}
                        className="flex cursor-pointer items-center gap-3 border-b p-2 last:border-b-0 hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={selectedTime.has(t.id)}
                          onCheckedChange={() => toggleTime(t.id)}
                        />
                        <div className="flex-1 text-sm">
                          <p className="font-medium">{t.description ?? "(Sin descripción)"}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {t.userName ?? "—"} · {hours.toFixed(2)}h × {formatMoney(num(t.hourlyRateSnapshot))}
                          </p>
                        </div>
                        <span className="font-mono text-sm tabular-nums">{formatMoney(amt)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {billables.expenses.length > 0 ? (
              <div className="space-y-1">
                <Label>Gastos aprobados ({billables.expenses.length})</Label>
                <div className="rounded-md border">
                  {billables.expenses.map((e) => (
                    <label
                      key={e.id}
                      className="flex cursor-pointer items-center gap-3 border-b p-2 last:border-b-0 hover:bg-muted/30"
                    >
                      <Checkbox
                        checked={selectedExp.has(e.id)}
                        onCheckedChange={() => toggleExp(e.id)}
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-medium">{e.description}</p>
                        <p className="text-[11px] text-muted-foreground">{e.userName ?? "—"}</p>
                      </div>
                      <span className="font-mono text-sm tabular-nums">
                        {formatMoney(num(e.amount), e.currency)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

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

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <Row label="Subtotal" value={formatMoney(subtotal)} />
              <Row label="ITBIS (18% sobre tiempos)" value={formatMoney(itbis)} />
              {isr ? (
                <Row label="Retención ISR (10%)" value={`− ${formatMoney(isrAmount)}`} />
              ) : null}
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatMoney(total)}</span>
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
            <Button
              type="submit"
              disabled={pending || nothing || (selectedTime.size + selectedExp.size === 0)}
            >
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
