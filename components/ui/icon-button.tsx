"use client";

// IconButton — botón de icono con tooltip rico de Radix.
//
// Por qué este wrapper existe:
//   - El atributo `title` nativo del browser tarda ~1s en aparecer, tiene
//     tipografía mínima, y en algunos navegadores/dispositivos ni se muestra.
//     Para una UI con muchas acciones representadas SOLO por iconos (la fila
//     de acciones de un documento, por ejemplo), eso es accesibilidad pobre.
//   - Radix Tooltip aparece en ~150ms, se ve consistente, y respeta el
//     TooltipProvider del layout.
//
// Reemplazo del patrón:
//   <Button variant="ghost" size="icon" aria-label="Editar" title="Editar">
//     <Pencil className="h-3.5 w-3.5" />
//   </Button>
//
// Por:
//   <IconButton label="Editar">
//     <Pencil className="h-3.5 w-3.5" />
//   </IconButton>
//
// El `label` se usa para tooltip Y aria-label simultáneamente.

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonProps = React.ComponentProps<typeof Button>;

export type IconButtonProps = Omit<ButtonProps, "title" | "aria-label"> & {
  /** Texto del tooltip Y aria-label. Obligatorio: si no tenés algo que decir
   *  acá, probablemente el botón no debería ser solo-icono. */
  label: string;
  /** Lado donde aparece el tooltip. Default: top. */
  side?: "top" | "right" | "bottom" | "left";
  /** Delay antes de mostrar el tooltip, ms. Default 200. */
  delayDuration?: number;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, side = "top", delayDuration, className, children, ...rest },
    ref,
  ) {
    return (
      <Tooltip delayDuration={delayDuration ?? 200}>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            variant={rest.variant ?? "ghost"}
            size={rest.size ?? "icon"}
            aria-label={label}
            className={cn(className)}
            {...rest}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    );
  },
);

/** Envoltorio "puro" para casos donde necesitás un trigger custom (un <Link>,
 *  un input dentro de un form, etc.) — agrega el tooltip alrededor de un child
 *  arbitrario.
 *
 *  IMPORTANTE — composición con otros Trigger (Sheet/Dialog/DropdownMenu):
 *  este componente es `forwardRef` y REENVÍA todas las props que reciba
 *  (`...rest`) + el `ref` al `TooltipTrigger` interno. Por eso, cuando se usa
 *  como hijo de `<XTrigger asChild><WithTooltip>…</WithTooltip></XTrigger>`, el
 *  `onClick`/`ref` que inyecta el Slot de Radix llega hasta el botón real: la
 *  cadena de Slots (XTrigger → TooltipTrigger → botón) compone hover + click.
 *  Sin este forwarding el botón quedaba MUERTO (el click se perdía en el
 *  componente Tooltip que no renderiza nodo DOM). No lo quites. */
export const WithTooltip = React.forwardRef<
  React.ElementRef<typeof TooltipTrigger>,
  React.ComponentPropsWithoutRef<typeof TooltipTrigger> & {
    label: string;
    side?: "top" | "right" | "bottom" | "left";
    delayDuration?: number;
  }
>(function WithTooltip(
  { label, side = "top", delayDuration, children, asChild = true, ...rest },
  ref,
) {
  return (
    <Tooltip delayDuration={delayDuration ?? 200}>
      <TooltipTrigger asChild={asChild} ref={ref} {...rest}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
});
