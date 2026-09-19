// EmptyState — patrón consistente cuando una lista no tiene resultados.
// Watermark del monograma LDP detrás del contenido para dar identidad
// y peso visual sin caer en illustration-startup.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LdpMonogram } from "@/components/brand/monogram";

export function EmptyState({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[4px] border border-border bg-card",
        "px-6 py-16 text-center",
        className,
      )}
    >
      {/* Watermark del monograma LDP, muy sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 text-foreground opacity-[0.04]"
      >
        <LdpMonogram className="h-full w-full" variant="outline" />
      </div>

      <div className="relative mx-auto max-w-md space-y-3">
        {icon ? (
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-[3px] border border-border bg-secondary text-subtle">
            {icon}
          </div>
        ) : null}
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {action ? <div className="pt-3">{action}</div> : null}
      </div>
    </div>
  );
}
