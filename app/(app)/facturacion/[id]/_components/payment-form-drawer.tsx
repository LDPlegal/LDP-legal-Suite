"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { registrarPagoAction, type PagoFormState } from "@/app/_actions/facturacion/pago";

const initial: PagoFormState = { ok: true };

function isoLocal(d: Date) {
  const pad = (n: number) => Math.abs(n).toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PaymentFormDrawer({
  trigger,
  invoiceId,
  outstanding,
  currency,
}: {
  trigger: ReactNode;
  invoiceId: string;
  outstanding: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<PagoFormState, FormData>(
    async (prev, fd) => {
      const result = await registrarPagoAction(prev, fd);
      if (result.ok) {
        toast.success("Pago registrado");
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initial,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Registrar pago</SheetTitle>
          <SheetDescription>
            Saldo pendiente: <span className="font-mono">{currency} {outstanding.toFixed(2)}</span>
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("invoiceId", invoiceId);
            const paidOn = fd.get("paidOn") as string | null;
            if (paidOn) fd.set("paidOn", new Date(paidOn).toISOString());
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Monto *</Label>
              <Input
                id="amount"
                name="amount"
                required
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={outstanding > 0 ? outstanding.toFixed(2) : ""}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="method">Método *</Label>
                <select
                  id="method"
                  name="method"
                  required
                  defaultValue="transfer"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="transfer">Transferencia</option>
                  <option value="cash">Efectivo</option>
                  <option value="check">Cheque</option>
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paidOn">Fecha *</Label>
                <Input
                  id="paidOn"
                  name="paidOn"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(new Date())}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reference">Referencia</Label>
              <Input id="reference" name="reference" placeholder="Núm. de cheque, transacción..." />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={2} />
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
              Registrar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
