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
        "flex flex-wrap items-end justify-between gap-4 pb-2",
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {countText ? (
            <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {countText}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}
