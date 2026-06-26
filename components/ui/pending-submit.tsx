"use client";

// Botón de submit que se deshabilita y muestra loader durante el envío
// del <form action={...}> padre. Usa useFormStatus de React 19, que
// captura el pending del form más cercano sin necesidad de pasar props.
//
// Sirve para forms inline de "Aprobar", "Compartir", "Marcar como…", etc.
// donde el doble-click dispararía la action 2 veces.

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import { IconButton, type IconButtonProps } from "@/components/ui/icon-button";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<typeof Button> & VariantProps<typeof buttonVariants>;

export function PendingSubmitButton({
  children,
  className,
  variant,
  size,
  ...rest
}: Omit<ButtonProps, "type" | "disabled"> & { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      {...rest}
    >
      {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </Button>
  );
}

// Variante para los IconButton type="submit" inline (toggle de compartir
// doc, etc.). Misma idea: bloquea spam-click durante el submit.
export function PendingIconSubmit({
  children,
  ...rest
}: Omit<IconButtonProps, "type" | "disabled">) {
  const { pending } = useFormStatus();
  return (
    <IconButton type="submit" disabled={pending} {...rest}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </IconButton>
  );
}
