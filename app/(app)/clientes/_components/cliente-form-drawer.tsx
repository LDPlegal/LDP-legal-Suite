"use client";

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
import { crearClienteAction, type ClienteFormState } from "@/app/_actions/clientes/crear";
import { editarClienteAction, type ClienteEditState } from "@/app/_actions/clientes/editar";

type FormState = ClienteFormState | ClienteEditState;
const initial: FormState = { ok: true };

export type ClienteInitial = {
  id: string;
  type: "individual" | "corporate";
  displayName: string;
  legalName: string | null;
  taxIdType: "rnc" | "cedula" | "passport" | "other" | null;
  taxId: string | null;
  primaryContactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  billingAddress: string | null;
  status: "active" | "prospect" | "closed";
};

export function ClienteFormDrawer({
  trigger,
  cliente,
}: {
  trigger: ReactNode;
  /** When provided, the drawer edits the existing client instead of creating. */
  cliente?: ClienteInitial;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isEdit = !!cliente;
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      const result = isEdit
        ? await editarClienteAction(prev as ClienteEditState, fd)
        : await crearClienteAction(prev as ClienteFormState, fd);
      if (result.ok) {
        toast.success(isEdit ? "Cliente actualizado" : "Cliente creado");
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initial,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Actualiza los datos del cliente. Los campos con * son obligatorios."
              : "Registra un cliente nuevo. Los campos con * son obligatorios."}
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          {isEdit ? <input type="hidden" name="clientId" value={cliente!.id} /> : null}
          <SheetBody className="space-y-4">
            <Field label="Tipo *" error={errFor(state, "type")}>
              <select
                name="type"
                required
                defaultValue={cliente?.type ?? "individual"}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="individual">Persona física</option>
                <option value="corporate">Persona jurídica</option>
              </select>
            </Field>

            <Field label="Nombre / Razón comercial *" error={errFor(state, "displayName")}>
              <Input name="displayName" required defaultValue={cliente?.displayName ?? ""} />
            </Field>

            <Field label="Razón social legal" error={errFor(state, "legalName")}>
              <Input
                name="legalName"
                placeholder="Solo personas jurídicas"
                defaultValue={cliente?.legalName ?? ""}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de ID" error={errFor(state, "taxIdType")}>
                <select
                  name="taxIdType"
                  defaultValue={cliente?.taxIdType ?? "rnc"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="rnc">RNC</option>
                  <option value="cedula">Cédula</option>
                  <option value="passport">Pasaporte</option>
                  <option value="other">Otro</option>
                </select>
              </Field>
              <Field label="Número" error={errFor(state, "taxId")}>
                <Input
                  name="taxId"
                  placeholder="XXX-XXXXX-X"
                  defaultValue={cliente?.taxId ?? ""}
                />
              </Field>
            </div>

            <Field label="Persona de contacto" error={errFor(state, "primaryContactName")}>
              <Input
                name="primaryContactName"
                defaultValue={cliente?.primaryContactName ?? ""}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" error={errFor(state, "email")}>
                <Input name="email" type="email" defaultValue={cliente?.email ?? ""} />
              </Field>
              <Field label="Teléfono" error={errFor(state, "phone")}>
                <Input
                  name="phone"
                  placeholder="+1 809 ..."
                  defaultValue={cliente?.phone ?? ""}
                />
              </Field>
            </div>

            <Field label="Dirección" error={errFor(state, "address")}>
              <Textarea name="address" rows={2} defaultValue={cliente?.address ?? ""} />
            </Field>

            <Field label="Dirección de facturación" error={errFor(state, "billingAddress")}>
              <Textarea
                name="billingAddress"
                rows={2}
                placeholder="Si difiere de la dirección principal"
                defaultValue={cliente?.billingAddress ?? ""}
              />
            </Field>

            <Field label="Estado" error={errFor(state, "status")}>
              <select
                name="status"
                defaultValue={cliente?.status ?? "active"}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="active">Activo</option>
                <option value="prospect">Prospecto</option>
                <option value="closed">Cerrado</option>
              </select>
            </Field>

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
              Guardar
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

function errFor(state: FormState, field: string): string | undefined {
  if (state.ok) return undefined;
  return state.fieldErrors?.[field]?.[0];
}
