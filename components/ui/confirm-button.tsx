"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Wraps a destructive form (typical "eliminar" server action) with a
// confirmation dialog. The form is rendered inside the dialog and submits
// through the standard <form action={...}> flow, so it keeps Next.js
// server-action semantics (no client fetch needed).
//
// HARDENING: el botón "Confirmar" y "Cancelar" están atados al estado del
// form via useFormStatus para que:
//   - doble-click no dispare la acción dos veces
//   - el botón se vea pending (loader) durante la espera
//   - no se pueda cancelar a mitad del submit (cierra inconsistente)
//
// El onOpenChange del Dialog también se bloquea si hay submit en curso
// (sino el user puede cerrar haciendo click fuera y dejar la action
// huérfana ejecutándose en el server).

export function ConfirmButton({
  trigger,
  title,
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  action,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  action: (formData: FormData) => Promise<void> | void;
  /** Hidden inputs identifying the row (id, parentId, etc.). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // useTransition para saber cuándo está corriendo la action y bloquear
  // el cierre del Dialog. useFormStatus solo funciona dentro del <form>.
  const [pending, startTransition] = useTransition();

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </span>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          // Bloquear cierre mientras la action está corriendo — sino el
          // user puede cerrar y la action queda huérfana en server.
          if (pending && !v) return;
          setOpen(v);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <form
            action={(fd) => {
              startTransition(async () => {
                try {
                  await action(fd);
                } finally {
                  setOpen(false);
                }
              });
            }}
          >
            {children}
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {cancelLabel}
              </Button>
              <ConfirmSubmitButton label={confirmLabel} pending={pending} />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Botón submit que se deshabilita durante el envío. useFormStatus es la
// forma idiomática de React 19 — captura el pending del <form> padre sin
// pasar props.
function ConfirmSubmitButton({ label, pending: outerPending }: { label: string; pending: boolean }) {
  const status = useFormStatus();
  const isPending = status.pending || outerPending;
  return (
    <Button type="submit" variant="destructive" disabled={isPending}>
      {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}
