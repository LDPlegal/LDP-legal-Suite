"use client";

// Panel de honorarios del caso en el Resumen — lista + agregar/editar/eliminar
// después de creado el caso (antes quedaban congelados al crear).
// Solo admin/partner (canEdit) ven los controles; el resto ve la lista.

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  agregarHonorarioAction,
  editarHonorarioAction,
  eliminarHonorarioAction,
  type HonorarioState,
} from "@/app/_actions/casos/honorarios";
import { CASE_FEE_TYPE_LABEL } from "@/lib/schemas/caso";
import { formatFeeAmounts } from "@/lib/currencies";

const initial: HonorarioState = { ok: true };

export type CaseFeeRow = {
  id: string;
  feeType: "flat_fee" | "retainer" | "success_fee" | "other";
  description: string | null;
  amountUsd: string | null;
  amountDop: string | null;
};

export function HonorariosPanel({
  caseId,
  fees,
  canEdit,
}: {
  caseId: string;
  fees: CaseFeeRow[];
  canEdit: boolean;
}) {
  // null = cerrado, "new" = agregar, CaseFeeRow = editar ese honorario.
  const [editing, setEditing] = useState<CaseFeeRow | "new" | null>(null);

  return (
    <div className="space-y-1.5">
      {fees.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin honorarios definidos.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {fees.map((h) => (
            <div key={h.id} className="group flex items-baseline gap-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                {CASE_FEE_TYPE_LABEL[h.feeType]}
              </span>
              <span className="font-mono">
                {formatFeeAmounts(h.amountUsd, h.amountDop)}
              </span>
              {h.description ? (
                <span className="text-[12px] text-muted-foreground">
                  · {h.description}
                </span>
              ) : null}
              {canEdit ? (
                <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconButton
                    className="h-6 w-6"
                    label="Editar honorario"
                    onClick={() => setEditing(h)}
                  >
                    <Pencil className="h-3 w-3" />
                  </IconButton>
                  <ConfirmButton
                    action={eliminarHonorarioAction}
                    title="¿Eliminar este honorario?"
                    description={`${CASE_FEE_TYPE_LABEL[h.feeType]} — ${formatFeeAmounts(h.amountUsd, h.amountDop)}. Las facturas ya emitidas no cambian.`}
                    confirmLabel="Eliminar"
                    trigger={
                      <IconButton
                        className="h-6 w-6 text-destructive"
                        label="Eliminar honorario"
                      >
                        <Trash2 className="h-3 w-3" />
                      </IconButton>
                    }
                  >
                    <input type="hidden" name="feeId" value={h.id} />
                    <input type="hidden" name="caseId" value={caseId} />
                  </ConfirmButton>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setEditing("new")}
        >
          <Plus className="h-3 w-3" />
          Agregar honorario
        </Button>
      ) : null}

      {editing !== null ? (
        <FeeDrawer
          caseId={caseId}
          fee={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function FeeDrawer({
  caseId,
  fee,
  onClose,
}: {
  caseId: string;
  /** null = crear nuevo */
  fee: CaseFeeRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = !!fee;
  const [state, action, pending] = useActionState<HonorarioState, FormData>(
    async (prev, fd) => {
      const r = isEdit
        ? await editarHonorarioAction(prev, fd)
        : await agregarHonorarioAction(prev, fd);
      if (r.ok) {
        toast.success(isEdit ? "Honorario actualizado" : "Honorario agregado");
        onClose();
        router.refresh();
      }
      return r;
    },
    initial,
  );

  function err(field: string): string | undefined {
    if (state.ok) return undefined;
    return state.fieldErrors?.[field]?.[0];
  }

  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (pending && !v) return;
        if (!v) onClose();
      }}
    >
      <SheetContent
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar honorario" : "Agregar honorario"}</SheetTitle>
          <SheetDescription>
            Podés cargar el monto en USD, en DOP, o en ambas monedas. Las
            facturas ya emitidas no se modifican.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          <input type="hidden" name="caseId" value={caseId} />
          {fee ? <input type="hidden" name="feeId" value={fee.id} /> : null}
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="hf-type">Tipo *</Label>
              <select
                id="hf-type"
                name="feeType"
                defaultValue={fee?.feeType ?? "flat_fee"}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.entries(CASE_FEE_TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hf-usd">Monto USD</Label>
                <Input
                  id="hf-usd"
                  name="amountUsd"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="font-mono"
                  defaultValue={fee?.amountUsd ?? ""}
                />
                {err("amountUsd") ? (
                  <p className="text-xs text-destructive">{err("amountUsd")}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hf-dop">Monto DOP</Label>
                <Input
                  id="hf-dop"
                  name="amountDop"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="font-mono"
                  defaultValue={fee?.amountDop ?? ""}
                />
                {err("amountDop") ? (
                  <p className="text-xs text-destructive">{err("amountDop")}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hf-desc">Descripción</Label>
              <Input
                id="hf-desc"
                name="description"
                maxLength={500}
                placeholder="Ej: iguala mensual, cuota inicial…"
                defaultValue={fee?.description ?? ""}
              />
            </div>

            {!state.ok && state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Guardar cambios" : "Agregar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
