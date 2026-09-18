// Material Symbols Sharp (FILL 1) — la iconografía del rediseño: sólida y
// de esquinas rectas. La fuente se carga en app/layout.tsx y la clase `.ms`
// vive en globals.css.
//
// Uso: <Icon name="work" size={19} />
//
// Los nombres son los de Material Symbols (snake_case), p. ej. "work",
// "calendar_month", "receipt_long". Nunca emoji, nunca mezclar con outline.

import { cn } from "@/lib/utils";

export function Icon({
  name,
  size = 19,
  className,
  label,
}: {
  name: string;
  size?: number;
  className?: string;
  /** Si el icono es la única etiqueta del control, pasá `label` para a11y. */
  label?: string;
}) {
  return (
    <span
      className={cn("ms flex-none", className)}
      style={{ fontSize: size, width: size, height: size }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {name}
    </span>
  );
}
