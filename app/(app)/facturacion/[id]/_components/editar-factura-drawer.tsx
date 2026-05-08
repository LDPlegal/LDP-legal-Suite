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
import {
  editarFacturaAction,
  type EditarFacturaState,
} from "@/app/_actions/facturacion/editar";

const initial: EditarFacturaState = { ok: true };

export function EditarFacturaDrawer({
  trigger,
  invoiceId,
  initialDueOn,
  initialNotes,
  initialTerms,
}: {
  trigger: ReactNode;
  invoiceId: string;
  initialDueOn: Date;
  initialNotes: string | null;
  initialTerms: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<EditarFacturaState, FormData>(
    async (prev, fd) => {
      const result = await editarFacturaAction(prev, fd);
      if (result.ok) {
        toast.success("Factura actualizada");
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initial,
  );

  const dueIso = new Date(initialDueOn).toISOString().slice(0, 10);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Editar borrador</SheetTitle>
          <SheetDescription>
            Edita encabezado de la factura. Para cambiar líneas o tiempos/gastos incluidos,
            elimina el borrador y genera de nuevo.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("invoiceId", invoiceId);
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dueOn">Fecha de vencimiento *</Label>
              <Input
                id="dueOn"
                name="dueOn"
                type="date"
                required
                defaultValue={dueIso}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={initialNotes ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms">Términos</Label>
              <Textarea id="terms" name="terms" rows={3} defaultValue={initialTerms ?? ""} />
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
              Guardar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
