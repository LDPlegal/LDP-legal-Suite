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
import {
  crearTiempoManualAction,
  type TiempoManualFormState,
} from "@/app/_actions/tiempos/crear-manual";

const initial: TiempoManualFormState = { ok: true };

type Caso = { id: string; code: string; title: string };

export function ManualTimeEntryDrawer({
  trigger,
  casos,
  defaultCaseId,
}: {
  trigger: ReactNode;
  casos: Caso[];
  defaultCaseId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [billable, setBillable] = useState(true);
  const [state, action, pending] = useActionState<TiempoManualFormState, FormData>(
    async (prev, fd) => {
      const result = await crearTiempoManualAction(prev, fd);
      if (result.ok) {
        toast.success("Tiempo registrado");
        setOpen(false);
      }
      return result;
    },
    initial,
  );

  // Default times: now-1h to now, ISO with offset
  const now = new Date();
  const onehourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const isoLocal = (d: Date) => {
    const pad = (n: number) => Math.abs(n).toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  function err(field: string): string | undefined {
    if (state.ok) return undefined;
    return state.fieldErrors?.[field]?.[0];
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Entrada manual de tiempo</SheetTitle>
          <SheetDescription>
            Registra tiempo trabajado fuera del timer (ej. tiempo en corte).
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            // datetime-local inputs return values without timezone; append :00 + local offset to round-trip as ISO with offset.
            const start = fd.get("startedAt") as string | null;
            const end = fd.get("endedAt") as string | null;
            if (start) fd.set("startedAt", new Date(start).toISOString());
            if (end) fd.set("endedAt", new Date(end).toISOString());
            fd.set("billable", billable ? "true" : "false");
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="caseId">Caso *</Label>
              <select
                id="caseId"
                name="caseId"
                required
                defaultValue={defaultCaseId ?? ""}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  Seleccionar caso...
                </option>
                {casos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
              {err("caseId") ? <p className="text-xs text-destructive">{err("caseId")}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startedAt">Inicio *</Label>
                <Input
                  id="startedAt"
                  name="startedAt"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(onehourAgo)}
                />
                {err("startedAt") ? <p className="text-xs text-destructive">{err("startedAt")}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endedAt">Fin *</Label>
                <Input
                  id="endedAt"
                  name="endedAt"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(now)}
                />
                {err("endedAt") ? <p className="text-xs text-destructive">{err("endedAt")}</p> : null}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Facturable</Label>
                <p className="text-xs text-muted-foreground">El tiempo cuenta para la factura del caso.</p>
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
              Guardar entrada
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
