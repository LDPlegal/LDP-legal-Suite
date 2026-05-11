"use client";

import { useState, type ReactNode } from "react";
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
// Usage:
//   <ConfirmButton
//     trigger={<Button ...>Eliminar</Button>}
//     title="¿Eliminar tarea?"
//     description="Esta acción es reversible (queda archivada)."
//     confirmLabel="Eliminar"
//     action={miServerAction}
//   >
//     <input type="hidden" name="id" value={x.id} />
//   </ConfirmButton>

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

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <form
            action={async (fd) => {
              await action(fd);
              setOpen(false);
            }}
          >
            {children}
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {cancelLabel}
              </Button>
              <Button type="submit" variant="destructive">
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
