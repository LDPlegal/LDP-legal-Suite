// PageHeader — patrón editorial consistente para encabezados de páginas.
//
// Estructura:
//   • Eyebrow (uppercase tracked muted) — categoría / contexto
//   • Title (semibold tracking-tight)
//   • Description (muted) — opcional
//   • Stat tag (badge gris con número) — opcional, e.g. "47 casos"
//   • Slot derecho — botones, filtros, acciones
//
// Se usa como server component — no requiere "use client".

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  count,
  countLabel,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  count?: number;
  countLabel?: { singular: string; plural: string };
  children?: ReactNode;
  className?: string;
}) {
  const countText =
    typeof count === "number" && countLabel
      ? `${count} ${count === 1 ? countLabel.singular : countLabel.plural}`
      : null;

  return (
    <div
      className={cn(
        // Mobile: apila vertical (título arriba, acciones abajo en su propia
        // fila full-width). Desde sm: vuelve a fila con space-between.
        // Antes era flex-wrap+justify-between siempre: en mobile el grupo de
        // acciones crecía a su contenido (varios botones) y NO envolvía
        // porque su ancho no estaba limitado → desbordaba la página.
        "flex flex-col gap-3 pb-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? <p className="microlabel">{eyebrow}</p> : null}
        <div className="flex flex-wrap items-baseline gap-3">
          {/* h1 de pantalla = 28px en Charter/Charis SIL */}
          <h1 className="text-[24px] leading-tight text-foreground sm:text-[28px]">
            {title}
          </h1>
          {countText ? (
            <span className="tabular border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.055em] text-muted-foreground">
              {countText}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? (
        // w-full en mobile para que el flex-wrap interno SÍ tenga un ancho
        // limitado y envuelva los botones; en sm: ancho automático.
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {children}
        </div>
      ) : null}
    </div>
  );
}
