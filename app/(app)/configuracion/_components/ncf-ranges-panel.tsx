"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  guardarNcfRangoAction,
  eliminarNcfRangoAction,
  type NcfRangoState,
} from "@/app/_actions/configuracion/ncf-rango";
import { NCF_TYPE_LABEL, NCF_TYPE_SHORT, formatNcf, type NcfType } from "@/lib/invoicing/ncf";

const initial: NcfRangoState = { ok: true };

type Range = {
  ncfType: NcfType;
  rangeStart: number;
  rangeEnd: number;
  lastSeq: number;
  expiresOn: Date | null;
};

const ALL_TYPES: NcfType[] = ["B01", "B02", "E31", "E32"];

export function NcfRangesPanel({
  ranges,
  canEdit,
}: {
  ranges: Range[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Inicio</TableHead>
            <TableHead>Fin</TableHead>
            <TableHead>Próximo</TableHead>
            <TableHead>Restantes</TableHead>
            <TableHead>Vence</TableHead>
            <TableHead>Estado</TableHead>
            {canEdit ? <TableHead className="w-24" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ALL_TYPES.map((type) => {
            const r = ranges.find((x) => x.ncfType === type);
            return (
              <TableRow key={type}>
                <TableCell>
                  <p className="font-medium">{type}</p>
                  <p className="text-[10px] text-muted-foreground">{NCF_TYPE_SHORT[type]}</p>
                </TableCell>
                {r ? (
                  <>
                    <TableCell className="font-mono text-xs">{formatNcf(type, r.rangeStart)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatNcf(type, r.rangeEnd)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.lastSeq < r.rangeEnd ? formatNcf(type, r.lastSeq + 1) : "—"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {Math.max(0, r.rangeEnd - r.lastSeq)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.expiresOn
                        ? new Date(r.expiresOn).toLocaleDateString("es-DO", {
                            dateStyle: "medium",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <RangeStatus range={r} />
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell colSpan={6} className="text-xs text-muted-foreground italic">
                      Sin rango configurado
                    </TableCell>
                  </>
                )}
                {canEdit ? (
                  <TableCell>
                    <RangeFormDialog existing={r} ncfType={type} />
                    {r ? (
                      <ConfirmButton
                        action={eliminarNcfRangoAction}
                        title={`¿Eliminar rango ${type}?`}
                        description="Si vuelves a emitir un comprobante de este tipo, la app exigirá configurar un rango nuevo. Las facturas ya emitidas no se afectan."
                        confirmLabel="Eliminar"
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            aria-label="Eliminar rango"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                      >
                        <input type="hidden" name="ncfType" value={type} />
                      </ConfirmButton>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RangeStatus({ range }: { range: Range }) {
  if (range.expiresOn && range.expiresOn.getTime() <= Date.now()) {
    return <Badge variant="destructive">Vencido</Badge>;
  }
  if (range.lastSeq >= range.rangeEnd) {
    return <Badge variant="destructive">Agotado</Badge>;
  }
  if (
    range.expiresOn &&
    range.expiresOn.getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000
  ) {
    return <Badge variant="warning">Vence pronto</Badge>;
  }
  return <Badge variant="success">Activo</Badge>;
}

function RangeFormDialog({
  existing,
  ncfType,
}: {
  existing?: Range;
  ncfType: NcfType;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<NcfRangoState, FormData>(
    async (prev, fd) => {
      const result = await guardarNcfRangoAction(prev, fd);
      if (result.ok) {
        toast.success(existing ? "Rango actualizado" : "Rango configurado");
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initial,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar rango">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Editar rango" : "Configurar rango"} {ncfType}
          </DialogTitle>
          <DialogDescription>{NCF_TYPE_LABEL[ncfType]}</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="ncfType" value={ncfType} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rangeStart">Inicio (número) *</Label>
              <Input
                id="rangeStart"
                name="rangeStart"
                type="number"
                min="1"
                max="99999999"
                required
                defaultValue={existing?.rangeStart ?? ""}
                placeholder="1"
              />
              <p className="text-[10px] text-muted-foreground">
                Sólo el número; el sistema antepone {ncfType}.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rangeEnd">Fin (número) *</Label>
              <Input
                id="rangeEnd"
                name="rangeEnd"
                type="number"
                min="1"
                max="99999999"
                required
                defaultValue={existing?.rangeEnd ?? ""}
                placeholder="1000"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expiresOn">Vencimiento (opcional)</Label>
            <Input
              id="expiresOn"
              name="expiresOn"
              type="date"
              defaultValue={
                existing?.expiresOn
                  ? new Date(existing.expiresOn).toISOString().slice(0, 10)
                  : ""
              }
            />
          </div>

          {!state.ok && state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
