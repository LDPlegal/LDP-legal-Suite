"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { IconButton } from "@/components/ui/icon-button";
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
} from "@/components/ui/sheet";
import { formatInFirmTz } from "@/lib/datetime/format";
import { TIME_ENTRY_STATUS_LABEL } from "@/lib/schemas/fase1";
import { eliminarTiempoAction } from "@/app/_actions/tiempos/eliminar";
import {
  editarTiempoAction,
  type EditarTiempoState,
} from "@/app/_actions/tiempos/editar";

function isoLocal(d: Date) {
  const pad = (n: number) => Math.abs(n).toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export type EditableTimeEntry = {
  id: string;
  description: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  billable: boolean;
  userName: string | null;
  status: "draft" | "approved" | "invoiced";
};

const initial: EditarTiempoState = { ok: true };

export function TiempoRowActions({
  entry,
  caseId,
}: {
  entry: EditableTimeEntry;
  caseId: string;
}) {
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const locked = entry.status === "invoiced";

  return (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton
        className="h-8 w-8"
        label="Ver detalle del tiempo"
        onClick={() => setViewOpen(true)}
      >
        <Eye className="h-4 w-4" />
      </IconButton>
      <IconButton
        className="h-8 w-8"
        label={locked ? "Tiempo ya facturado — no se puede editar" : "Editar tiempo"}
        onClick={() => setEditOpen(true)}
        disabled={locked}
      >
        <Pencil className="h-4 w-4" />
      </IconButton>
      {!locked ? (
        <ConfirmButton
          action={eliminarTiempoAction}
          title="¿Eliminar esta entrada de tiempo?"
          description="Queda archivada (reversible)."
          confirmLabel="Eliminar"
          trigger={
            <IconButton
              className="h-8 w-8 text-destructive"
              label="Eliminar tiempo (archivar)"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          }
        >
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="caseId" value={caseId} />
        </ConfirmButton>
      ) : null}

      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Entrada de tiempo</SheetTitle>
            <SheetDescription>Solo lectura.</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3 text-sm">
            <DetailRow label="Quién">
              {entry.userName ?? <span className="text-muted-foreground">—</span>}
            </DetailRow>
            <DetailRow label="Inicio">
              {formatInFirmTz(entry.startedAt, undefined, "dd/MM/yyyy HH:mm")}
            </DetailRow>
            <DetailRow label="Fin">
              {formatInFirmTz(entry.endedAt, undefined, "dd/MM/yyyy HH:mm")}
            </DetailRow>
            <DetailRow label="Duración">
              <span className="font-mono">{fmtDuration(entry.durationSeconds)}</span>
            </DetailRow>
            <DetailRow label="Facturable">
              <Badge variant={entry.billable ? "outline" : "secondary"}>
                {entry.billable ? "Sí" : "No"}
              </Badge>
            </DetailRow>
            <DetailRow label="Estado">
              <Badge
                variant={
                  entry.status === "approved"
                    ? "success"
                    : entry.status === "invoiced"
                      ? "default"
                      : "warning"
                }
              >
                {TIME_ENTRY_STATUS_LABEL[entry.status]}
              </Badge>
            </DetailRow>
            {entry.description ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Descripción
                </p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {entry.description}
                </p>
              </div>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>
              Cerrar
            </Button>
            {!locked ? (
              <Button
                onClick={() => {
                  setViewOpen(false);
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <EditDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        entry={entry}
        caseId={caseId}
      />
    </div>
  );
}

function EditDrawer({
  open,
  onOpenChange,
  entry,
  caseId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: EditableTimeEntry;
  caseId: string;
}) {
  const router = useRouter();
  const [billable, setBillable] = useState(entry.billable);
  const [state, action, pending] = useActionState<EditarTiempoState, FormData>(
    async (prev, fd) => {
      const r = await editarTiempoAction(prev, fd);
      if (r.ok) {
        toast.success("Tiempo actualizado");
        onOpenChange(false);
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
      open={open}
      onOpenChange={(v) => {
        if (pending && !v) return;
        onOpenChange(v);
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
          <SheetTitle>Editar tiempo</SheetTitle>
          <SheetDescription>
            Si cambiás las horas, la duración se recalcula automáticamente.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("entryId", entry.id);
            fd.set("caseId", caseId);
            const s = fd.get("startedAt") as string | null;
            const e = fd.get("endedAt") as string | null;
            if (s) fd.set("startedAt", new Date(s).toISOString());
            if (e) fd.set("endedAt", new Date(e).toISOString());
            fd.set("billable", billable ? "true" : "false");
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-startedAt">Inicio *</Label>
                <Input
                  id="t-startedAt"
                  name="startedAt"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(entry.startedAt)}
                />
                {err("startedAt") ? (
                  <p className="text-xs text-destructive">{err("startedAt")}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-endedAt">Fin *</Label>
                <Input
                  id="t-endedAt"
                  name="endedAt"
                  type="datetime-local"
                  required
                  defaultValue={isoLocal(entry.endedAt)}
                />
                {err("endedAt") ? (
                  <p className="text-xs text-destructive">{err("endedAt")}</p>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-description">Descripción</Label>
              <Textarea
                id="t-description"
                name="description"
                rows={3}
                defaultValue={entry.description ?? ""}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">Facturable al cliente</Label>
              <Switch checked={billable} onCheckedChange={setBillable} />
            </div>
            {!state.ok && state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3 border-b pb-2 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
