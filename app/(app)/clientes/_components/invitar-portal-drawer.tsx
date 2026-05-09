"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
  invitarPortalAction,
  type InvitarPortalState,
} from "@/app/_actions/portal/invitar-cliente";

const initial: InvitarPortalState = { ok: true, userId: "" };

export function InvitarPortalDrawer({
  trigger,
  clientId,
  defaultEmail,
  defaultName,
}: {
  trigger: ReactNode;
  clientId: string;
  defaultEmail?: string | null;
  defaultName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<InvitarPortalState, FormData>(
    async (prev, fd) => {
      const result = await invitarPortalAction(prev, fd);
      if (result.ok) {
        toast.success("Acceso al portal creado", {
          description:
            "Comparte la contraseña temporal con el cliente. Cámbiala desde su perfil cuando quiera.",
        });
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
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
          <SheetTitle>Crear acceso al portal</SheetTitle>
          <SheetDescription>
            El cliente podrá iniciar sesión en /login y verá únicamente los
            casos, facturas y documentos compartidos asociados a su cuenta.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          <input type="hidden" name="clientId" value={clientId} />
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre del usuario *</Label>
              <Input
                name="name"
                required
                defaultValue={defaultName ?? ""}
                placeholder="Nombre que verá en su perfil"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                name="email"
                required
                defaultValue={defaultEmail ?? ""}
                placeholder="cliente@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña temporal *</Label>
              <Input
                name="password"
                type="text"
                minLength={8}
                maxLength={72}
                required
                placeholder="Mínimo 8 caracteres"
              />
              <p className="text-xs text-muted-foreground">
                El cliente la podrá cambiar después de su primer ingreso.
              </p>
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
              Crear acceso
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
