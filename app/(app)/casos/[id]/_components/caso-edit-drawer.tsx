"use client";

// Drawer para editar los datos básicos del caso (no toca assignments ni
// fees — esos son delicados por billing y tienen flujos propios).

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
import { editarCasoAction, type EditarCasoState } from "@/app/_actions/casos/editar";
import { MATTER_LABEL, CASE_STATUS_LABEL } from "@/lib/schemas/caso";

const initial: EditarCasoState = { ok: true };

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
};

export function CasoEditDrawer({
  trigger,
  caseData,
}: {
  trigger: ReactNode;
  caseData: EditableCase;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
            Cambios en los datos básicos. Para reasignar abogados o cambiar
            honorarios, usá las acciones específicas más abajo en el caso.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          <input type="hidden" name="caseId" value={caseData.id} />
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

            <div className="space-y-1.5">
              <Label htmlFor="ce-visibility">Visibilidad</Label>
              <select
                id="ce-visibility"
                name="visibility"
                defaultValue={caseData.visibility}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="firm">Toda la firma puede ver</option>
                <option value="restricted">Solo asignados y admins</option>
              </select>
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
