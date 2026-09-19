"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MATTER_LABEL, type MatterType } from "@/lib/schemas/caso";
import {
  guardarRateAction,
  eliminarRateAction,
  type GuardarRateState,
} from "@/app/_actions/configuracion/rates";

type RateRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  matterType: MatterType | null;
  clientId: string | null;
  hourlyRate: string;
  currency: string;
  notes: string | null;
  validFrom: Date;
  validTo: Date | null;
};

const initial: GuardarRateState = { ok: true, id: "" };

export function RatesPanel({
  rates,
  users,
  clients,
  canEdit,
}: {
  rates: RateRow[];
  users: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; displayName: string }>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {rates.length} {rates.length === 1 ? "tarifa" : "tarifas"} activas
        </p>
        {canEdit ? (
          <RateDrawer
            users={users}
            clients={clients}
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5" />
                Nueva tarifa
              </Button>
            }
          />
        ) : null}
      </div>

      {rates.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Sin overrides. Las horas se cobran al rate base del usuario
          (users.hourly_rate).
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Materia</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Tarifa/h</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.userName ?? <em className="text-muted-foreground">Todos</em>}</TableCell>
                <TableCell>
                  {r.matterType ? MATTER_LABEL[r.matterType] : <em className="text-muted-foreground">Todas</em>}
                </TableCell>
                <TableCell>
                  {r.clientId ? (
                    clients.find((c) => c.id === r.clientId)?.displayName ?? r.clientId.slice(0, 8)
                  ) : (
                    <em className="text-muted-foreground">Todos</em>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {r.currency} {Number(r.hourlyRate).toFixed(2)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.validFrom).toLocaleDateString("es-DO")}
                  {r.validTo ? ` → ${new Date(r.validTo).toLocaleDateString("es-DO")}` : " →"}
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <ConfirmButton
                      action={eliminarRateAction}
                      title="¿Eliminar esta tarifa?"
                      description="Los tiempos ya registrados con esta tarifa mantienen su valor (snapshot)."
                      confirmLabel="Eliminar"
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          aria-label="Eliminar tarifa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    >
                      <input type="hidden" name="rateId" value={r.id} />
                    </ConfirmButton>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function RateDrawer({
  trigger,
  users,
  clients,
}: {
  trigger: ReactNode;
  users: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; displayName: string }>;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<GuardarRateState, FormData>(
    async (prev, fd) => {
      const r = await guardarRateAction(prev, fd);
      if (r.ok) {
        toast.success("Tarifa creada");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    initial,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nueva tarifa</SheetTitle>
          <SheetDescription>
            Deja un campo en blanco para que la tarifa aplique a todos los
            usuarios/materias/clientes. La más específica gana.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <select
                name="userId"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">- Todos los usuarios -</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Materia</Label>
              <select
                name="matterType"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">- Todas las materias -</option>
                {Object.entries(MATTER_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <select
                name="clientId"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">- Todos los clientes -</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tarifa por hora *</Label>
                <Input
                  name="hourlyRate"
                  required
                  placeholder="2500.00"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Moneda *</Label>
                <Input
                  name="currency"
                  defaultValue="DOP"
                  maxLength={3}
                  className="font-mono uppercase"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vigente desde *</Label>
                <Input
                  type="date"
                  name="validFrom"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hasta (opcional)</Label>
                <Input type="date" name="validTo" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea name="notes" rows={2} maxLength={300} />
            </div>
            {!state.ok ? (
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
