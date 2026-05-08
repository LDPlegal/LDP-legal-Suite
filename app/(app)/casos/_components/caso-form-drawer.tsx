"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { crearCasoAction, type CasoFormState } from "@/app/_actions/casos/crear";
import { MATTER_LABEL } from "@/lib/schemas/caso";

type Cliente = { id: string; displayName: string };
type User = { id: string; name: string; role: string };
type Assignment = { userId: string; roleInCase: "lead" | "associate" | "paralegal" };

const initial: CasoFormState = { ok: true };

export function CasoFormDrawer({
  trigger,
  clientes,
  users,
}: {
  trigger: ReactNode;
  clientes: Cliente[];
  users: User[];
}) {
  const [open, setOpen] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [state, action, pending] = useActionState<CasoFormState, FormData>(
    crearCasoAction,
    initial,
  );

  function addAssignment() {
    const firstUnassigned = users.find((u) => !assignments.some((a) => a.userId === u.id));
    if (!firstUnassigned) return;
    setAssignments((prev) => [
      ...prev,
      { userId: firstUnassigned.id, roleInCase: "associate" },
    ]);
  }

  function removeAssignment(idx: number) {
    setAssignments((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAssignment(idx: number, patch: Partial<Assignment>) {
    setAssignments((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuevo caso</SheetTitle>
          <SheetDescription>
            El código (ej. <span className="font-mono">2026-CIV-014</span>) se genera al guardar.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          <SheetBody className="space-y-4">
            <Field label="Título *" error={errFor(state, "title")}>
              <Input name="title" required placeholder="Ej. Demanda en cobro de pesos" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Cliente *" error={errFor(state, "clientId")}>
                <select
                  name="clientId"
                  required
                  defaultValue=""
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="" disabled>
                    Seleccionar cliente...
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Materia *" error={errFor(state, "matterType")}>
                <select
                  name="matterType"
                  required
                  defaultValue="civil"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(MATTER_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Descripción" error={errFor(state, "description")}>
              <Textarea name="description" rows={3} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Estado" error={errFor(state, "status")}>
                <select
                  name="status"
                  defaultValue="open"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="open">Abierto</option>
                  <option value="on_hold">En espera</option>
                  <option value="closed">Cerrado</option>
                </select>
              </Field>
              <Field label="Líder" error={errFor(state, "leadLawyerId")}>
                <select
                  name="leadLawyerId"
                  defaultValue=""
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin asignar</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Modo de facturación" error={errFor(state, "billingMode")}>
                <select
                  name="billingMode"
                  defaultValue="hourly"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="hourly">Por hora</option>
                  <option value="flat_fee">Tarifa plana</option>
                  <option value="retainer">Iguala</option>
                  <option value="contingency">Contingencia</option>
                </select>
              </Field>
              <Field label="Tribunal" error={errFor(state, "court")}>
                <Input name="court" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tarifa plana (DOP)" error={errFor(state, "flatFeeAmount")}>
                <Input name="flatFeeAmount" placeholder="0.00" />
              </Field>
              <Field label="Iguala / Retainer (DOP)" error={errFor(state, "retainerBalance")}>
                <Input name="retainerBalance" placeholder="0.00" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Contraparte" error={errFor(state, "counterpartyName")}>
                <Input name="counterpartyName" />
              </Field>
              <Field label="ID contraparte" error={errFor(state, "counterpartyTaxId")}>
                <Input name="counterpartyTaxId" placeholder="RNC / cédula" />
              </Field>
            </div>

            <Field label="Etiquetas" error={errFor(state, "tags")}>
              <Input name="tags" placeholder="Coma separadas: urgente, ProBono" />
            </Field>

            <div className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm">Caso restringido</Label>
                  <p className="text-xs text-muted-foreground">
                    Solo los abogados asignados (más admin de la firma) verán este caso.
                  </p>
                </div>
                <Switch
                  checked={restricted}
                  onCheckedChange={(v) => {
                    setRestricted(v);
                    if (!v) setAssignments([]);
                  }}
                />
                <input type="hidden" name="visibility" value={restricted ? "restricted" : "firm"} />
              </div>

              {restricted ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Asignados ({assignments.length})
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addAssignment}
                      disabled={assignments.length >= users.length}
                    >
                      <Plus className="h-3 w-3" />
                      Agregar
                    </Button>
                  </div>
                  {assignments.length === 0 ? (
                    <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      Agrega al menos un líder.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {assignments.map((a, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <select
                            value={a.userId}
                            onChange={(e) => updateAssignment(i, { userId: e.target.value })}
                            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={a.roleInCase}
                            onChange={(e) =>
                              updateAssignment(i, {
                                roleInCase: e.target.value as Assignment["roleInCase"],
                              })
                            }
                            className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="lead">Líder</option>
                            <option value="associate">Asociado</option>
                            <option value="paralegal">Paralegal</option>
                          </select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeAssignment(i)}
                            aria-label="Quitar asignación"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <input
                    type="hidden"
                    name="assignments"
                    value={JSON.stringify(assignments)}
                  />
                </div>
              ) : null}
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
              Guardar caso
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function errFor(state: CasoFormState, field: string): string | undefined {
  if (state.ok) return undefined;
  return state.fieldErrors?.[field]?.[0];
}
