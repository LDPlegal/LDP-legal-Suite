"use client";

// Drawer para editar los datos del caso: básicos + líder + acceso por usuario.
// El acceso se controla usuario por usuario (checkboxes). Con visibilidad
// "restringido", solo los usuarios marcados (y los admins) ven el caso — lo
// hace cumplir la RLS (policy cases_firm_visibility). El líder siempre queda
// con acceso automáticamente (lo fuerza la action al guardar).

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Users } from "lucide-react";
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
import { editarCasoAction, type EditarCasoState } from "@/app/_actions/casos/editar";
import { BILLING_MODE_LABEL, MATTER_LABEL, CASE_STATUS_LABEL } from "@/lib/schemas/caso";

const initial: EditarCasoState = { ok: true };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  partner: "Socio",
  lawyer: "Abogado",
  paralegal: "Paralegal",
  tester: "Tester",
};

export type EditableCase = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "on_hold" | "closed";
  matterType:
    | "civil"
    | "corporate"
    | "real_estate"
    | "criminal"
    | "labor"
    | "tax"
    | "administrative"
    | "other";
  court: string | null;
  counterpartyName: string | null;
  counterpartyTaxId: string | null;
  tags: string[];
  visibility: "firm" | "restricted";
  billingMode: "hourly" | "flat_fee" | "retainer" | "contingency";
  leadLawyerId: string | null;
};

export type CaseUserOption = { id: string; name: string; role: string };

export function CasoEditDrawer({
  trigger,
  caseData,
  users,
  assignedUserIds,
}: {
  trigger: ReactNode;
  caseData: EditableCase;
  /** Usuarios de la firma (staff) para líder + acceso. */
  users: CaseUserOption[];
  /** Usuarios que hoy tienen acceso (case_assignments). */
  assignedUserIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Controlados para poder reflejar en la UI el efecto de cada elección.
  const [visibility, setVisibility] = useState(caseData.visibility);
  const [leadLawyerId, setLeadLawyerId] = useState(caseData.leadLawyerId ?? "");
  const [access, setAccess] = useState<Set<string>>(new Set(assignedUserIds));

  const [state, action, pending] = useActionState<EditarCasoState, FormData>(
    async (prev, fd) => {
      const r = await editarCasoAction(prev, fd);
      if (r.ok) {
        toast.success("Caso actualizado");
        setOpen(false);
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

  function toggleAccess(id: string) {
    setAccess((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (pending && !v) return;
        setOpen(v);
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        className="sm:max-w-xl"
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>Editar caso</SheetTitle>
          <SheetDescription>
            Datos del caso, líder y quién tiene acceso. Para honorarios usá las
            acciones de facturación del caso.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          <input type="hidden" name="caseId" value={caseData.id} />
          <input type="hidden" name="leadLawyerId" value={leadLawyerId} />
          <input type="hidden" name="visibility" value={visibility} />
          {/* El acceso se envía como múltiples inputs con el mismo name. */}
          {[...access].map((uid) => (
            <input key={uid} type="hidden" name="assignedUserIds" value={uid} />
          ))}
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ce-title">Título *</Label>
              <Input id="ce-title" name="title" required defaultValue={caseData.title} />
              {err("title") ? <p className="text-xs text-destructive">{err("title")}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ce-matter">Materia *</Label>
                <select
                  id="ce-matter"
                  name="matterType"
                  defaultValue={caseData.matterType}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(MATTER_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ce-status">Estado *</Label>
                <select
                  id="ce-status"
                  name="status"
                  defaultValue={caseData.status}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(CASE_STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ce-billing">Modo de facturación *</Label>
              <select
                id="ce-billing"
                name="billingMode"
                defaultValue={caseData.billingMode}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.entries(BILLING_MODE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Cambia cómo se generan los conceptos a facturar de aquí en
                adelante; lo ya facturado no se toca.
              </p>
            </div>

            {/* Líder del caso — antes no se podía cambiar acá. */}
            <div className="space-y-1.5">
              <Label htmlFor="ce-lead">Líder del caso</Label>
              <select
                id="ce-lead"
                value={leadLawyerId}
                onChange={(e) => setLeadLawyerId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sin asignar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {ROLE_LABEL[u.role] ? ` · ${ROLE_LABEL[u.role]}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                El líder siempre conserva acceso al caso.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ce-description">Descripción</Label>
              <Textarea
                id="ce-description"
                name="description"
                rows={3}
                defaultValue={caseData.description ?? ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ce-court">Tribunal / Sala</Label>
              <Input id="ce-court" name="court" defaultValue={caseData.court ?? ""} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ce-cp-name">Contraparte</Label>
                <Input
                  id="ce-cp-name"
                  name="counterpartyName"
                  defaultValue={caseData.counterpartyName ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ce-cp-rnc">RNC / Cédula contraparte</Label>
                <Input
                  id="ce-cp-rnc"
                  name="counterpartyTaxId"
                  defaultValue={caseData.counterpartyTaxId ?? ""}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ce-tags">Etiquetas (separadas por coma)</Label>
              <Input
                id="ce-tags"
                name="tags"
                defaultValue={caseData.tags.join(", ")}
                placeholder="Ej: urgente, internacional"
              />
            </div>

            {/* ---- Acceso al caso (usuario por usuario) ---- */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm">Acceso al caso</Label>
              </div>
              <div className="space-y-1.5">
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as "firm" | "restricted")}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="firm">Toda la firma puede ver</option>
                  <option value="restricted">Restringido — solo usuarios seleccionados</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {visibility === "restricted" ? (
                    <>
                      <Lock className="mr-1 inline h-3 w-3" />
                      Solo los usuarios marcados abajo (y los admins) verán este
                      caso y su contenido.
                    </>
                  ) : (
                    "Visible para toda la firma. Podés marcar usuarios igual: si más adelante lo restringís, el acceso ya queda listo."
                  )}
                </p>
              </div>

              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border bg-background p-1">
                {users.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">
                    No hay usuarios de staff en la firma.
                  </p>
                ) : (
                  users.map((u) => {
                    const isLead = u.id === leadLawyerId;
                    const checked = access.has(u.id) || isLead;
                    return (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isLead}
                          onChange={() => toggleAccess(u.id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <span className="flex-1 truncate">{u.name}</span>
                        {isLead ? (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Líder
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {ROLE_LABEL[u.role] ?? u.role}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
              {visibility === "restricted" && access.size === 0 && !leadLawyerId ? (
                <p className="text-xs text-warning">
                  Sin usuarios seleccionados: solo los admins podrán ver el caso.
                </p>
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
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
