"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  actualizarFirmAction,
  type FirmFormState,
} from "@/app/_actions/configuracion/firm";

const initial: FirmFormState = { ok: true };

export function FirmForm({
  firm,
  canEdit,
}: {
  firm: {
    name: string;
    rnc: string | null;
    address: string | null;
    timezone: string;
    defaultCurrency: string;
  };
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<FirmFormState, FormData>(
    async (prev, fd) => {
      const result = await actualizarFirmAction(prev, fd);
      if (result.ok) toast.success("Datos del firm actualizados");
      else toast.error(result.error);
      return result;
    },
    initial,
  );

  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nombre del firm *</Label>
            <Input name="name" required defaultValue={firm.name} />
          </div>
          <div className="space-y-1.5">
            <Label>RNC</Label>
            <Input
              name="rnc"
              defaultValue={firm.rnc ?? ""}
              placeholder="XXX-XXXXX-X"
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Dirección</Label>
          <Textarea name="address" rows={2} defaultValue={firm.address ?? ""} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Zona horaria *</Label>
            <Input
              name="timezone"
              required
              defaultValue={firm.timezone}
              placeholder="America/Santo_Domingo"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              IANA timezone. Afecta la presentación de fechas en toda la app.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Moneda por defecto *</Label>
            <Input
              name="defaultCurrency"
              required
              defaultValue={firm.defaultCurrency}
              placeholder="DOP"
              maxLength={3}
              className="font-mono uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Código ISO 4217 (DOP, USD, EUR…).
            </p>
          </div>
        </div>

        {!state.ok ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </fieldset>
      {!canEdit ? (
        <p className="text-xs text-muted-foreground">
          Solo admin y socios pueden modificar estos datos.
        </p>
      ) : null}
    </form>
  );
}
