"use client";

// Dialog mini-form para crear un cliente desde el formulario del caso —
// ahorra el flujo de "guardar caso a medias → ir a /clientes → crear → volver".
//
// Pide solo los datos mínimos para identificar al cliente:
//   - Tipo (individual / corporate)
//   - Nombre / Razón social
//   - Email (opcional)
//   - Teléfono (opcional)
// El resto se completa después desde /clientes/<id>.

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { crearClienteInlineAction } from "@/app/_actions/clientes/crear-inline";

export function ClienteQuickCreate({
  onCreated,
}: {
  /** Callback que recibe el cliente recién creado. El padre debe agregarlo
   *  a su lista de opciones y seleccionarlo. */
  onCreated: (client: { id: string; displayName: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<"individual" | "corporate">("individual");
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setType("individual");
    setDisplayName("");
    setLegalName("");
    setEmail("");
    setPhone("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await crearClienteInlineAction({
        type,
        displayName: displayName.trim(),
        legalName: type === "corporate" ? legalName.trim() : undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(`Cliente "${r.client.displayName}" creado`);
      onCreated(r.client);
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Crear cliente sin salir del formulario"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo cliente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear cliente rápido</DialogTitle>
          <DialogDescription>
            Datos mínimos para identificarlo. El resto (dirección, RNC, etc.)
            lo completás después desde la ficha del cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qc-type">Tipo *</Label>
            <select
              id="qc-type"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "individual" | "corporate")
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="individual">Persona física</option>
              <option value="corporate">Persona jurídica</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qc-displayName">
              {type === "corporate" ? "Nombre comercial *" : "Nombre completo *"}
            </Label>
            <Input
              id="qc-displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
              placeholder={
                type === "corporate"
                  ? "Ej. Constructora Caribe SRL"
                  : "Ej. Juan Pérez Martínez"
              }
              autoFocus
            />
          </div>

          {type === "corporate" ? (
            <div className="space-y-1.5">
              <Label htmlFor="qc-legalName">Razón social *</Label>
              <Input
                id="qc-legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.currentTarget.value)}
                placeholder="Ej. Constructora Caribe, S.R.L."
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qc-email">Email</Label>
              <Input
                id="qc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="cliente@ejemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qc-phone">Teléfono</Label>
              <Input
                id="qc-phone"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                placeholder="809-555-1234"
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={
              pending ||
              !displayName.trim() ||
              (type === "corporate" && !legalName.trim())
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Crear cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
