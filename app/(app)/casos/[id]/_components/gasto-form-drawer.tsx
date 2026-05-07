"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
import { crearGastoAction, type GastoFormState } from "@/app/_actions/gastos/crear";

const initial: GastoFormState = { ok: true };

function isoLocal(d: Date) {
  const pad = (n: number) => Math.abs(n).toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function GastoFormDrawer({
  trigger,
  caseId,
  defaultCurrency = "DOP",
}: {
  trigger: ReactNode;
  caseId: string;
  defaultCurrency?: string;
}) {
  const [open, setOpen] = useState(false);
  const [billable, setBillable] = useState(true);
  const [state, action, pending] = useActionState<GastoFormState, FormData>(
    async (prev, fd) => {
      const result = await crearGastoAction(prev, fd);
      if (result.ok) {
        toast.success("Gasto registrado");
        setOpen(false);
      }
      return result;
    },
    initial,
  );

  function err(field: string): string | undefined {
    if (state.ok) return undefined;
    return state.fieldErrors?.[field]?.[0];
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuevo gasto</SheetTitle>
          <SheetDescription>
            Captura un gasto del caso. Upload de recibo llega en Fase 2; por ahora
            puedes pegar la URL del archivo si lo tienes en la nube.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("caseId", caseId);
            const incurred = fd.get("incurredOn") as string | null;
            if (incurred) fd.set("incurredOn", new Date(incurred).toISOString());
            fd.set("billable", billable ? "true" : "false");
            return action(fd);
          }}
          className="flex h-full flex-col"
        >
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción *</Label>
              <Textarea id="description" name="description" required rows={2} />
              {err("description") ? (
                <p className="text-xs text-destructive">{err("description")}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Monto *</Label>
                <Input
                  id="amount"
                  name="amount"
                  required
                  placeholder="0.00"
                  inputMode="decimal"
                />
                {err("amount") ? (
                  <p className="text-xs text-destructive">{err("amount")}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Moneda</Label>
                <select
                  id="currency"
                  name="currency"
                  defaultValue={defaultCurrency}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="DOP">DOP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="incurredOn">Fecha del gasto *</Label>
              <Input
                id="incurredOn"
                name="incurredOn"
                type="datetime-local"
                required
                defaultValue={isoLocal(new Date())}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="receiptUrl">URL del recibo</Label>
              <Input
                id="receiptUrl"
                name="receiptUrl"
                type="url"
                placeholder="https://..."
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Facturable al cliente</Label>
                <p className="text-xs text-muted-foreground">
                  Si no, es un gasto interno de la firma.
                </p>
              </div>
              <Switch checked={billable} onCheckedChange={setBillable} />
            </div>

            {!state.ok && state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Guardar gasto
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
