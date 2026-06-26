"use client";

// Drawer para crear o editar un gasto del caso. Si recibe `expense` arranca
// en modo edit y usa editarGastoAction; si no, modo create con crearGastoAction.

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
import { editarGastoAction, type EditarGastoState } from "@/app/_actions/gastos/editar";

const initialCreate: GastoFormState = { ok: true };
const initialEdit: EditarGastoState = { ok: true };

function isoLocal(d: Date) {
  const pad = (n: number) => Math.abs(n).toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type EditableExpense = {
  id: string;
  description: string;
  amount: string;
  currency: string;
  incurredOn: Date;
  billable: boolean;
  receiptUrl: string | null;
};

export function GastoFormDrawer({
  trigger,
  caseId,
  defaultCurrency = "DOP",
  expense,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  trigger?: ReactNode;
  caseId: string;
  defaultCurrency?: string;
  /** Si viene, el drawer está en modo edición. */
  expense?: EditableExpense;
  /** Soporta tanto controlled (parent maneja open) como uncontrolled (con trigger). */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? !!controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(v);
    if (!isControlled) setInternalOpen(v);
  };
  const [billable, setBillable] = useState(expense?.billable ?? true);

  const isEdit = !!expense;

  // useActionState con dos shapes — distinguimos por modo.
  const [createState, createAction, createPending] = useActionState<GastoFormState, FormData>(
    async (prev, fd) => {
      const result = await crearGastoAction(prev, fd);
      if (result.ok) {
        toast.success("Gasto registrado");
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initialCreate,
  );
  const [editState, editAction, editPending] = useActionState<EditarGastoState, FormData>(
    async (prev, fd) => {
      if (!expense) return { ok: false, error: "Gasto no encontrado." };
      const result = await editarGastoAction(expense.id, prev, fd);
      if (result.ok) {
        toast.success("Gasto actualizado");
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initialEdit,
  );

  const state = isEdit ? editState : createState;
  const action = isEdit ? editAction : createAction;
  const pending = isEdit ? editPending : createPending;

  function err(field: string): string | undefined {
    if (state.ok) return undefined;
    return (state as { fieldErrors?: Record<string, string[]> }).fieldErrors?.[field]?.[0];
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (pending && !v) return;
        setOpen(v);
      }}
    >
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar gasto" : "Nuevo gasto"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Cambios aplican al registro existente. Gastos ya facturados no se pueden editar (anulá la factura primero)."
              : "Capturá un gasto del caso. Si tenés el recibo en la nube, pegá la URL."}
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
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción *</Label>
              <Textarea
                id="description"
                name="description"
                required
                rows={2}
                defaultValue={expense?.description ?? ""}
              />
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
                  defaultValue={expense?.amount ?? ""}
                />
                {err("amount") ? <p className="text-xs text-destructive">{err("amount")}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Moneda</Label>
                <select
                  id="currency"
                  name="currency"
                  defaultValue={expense?.currency ?? defaultCurrency}
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
                defaultValue={isoLocal(expense?.incurredOn ?? new Date())}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="receiptUrl">URL del recibo</Label>
              <Input
                id="receiptUrl"
                name="receiptUrl"
                type="url"
                placeholder="https://..."
                defaultValue={expense?.receiptUrl ?? ""}
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
              {isEdit ? "Guardar cambios" : "Guardar gasto"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
