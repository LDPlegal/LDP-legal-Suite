"use client";

// Kbd — un tag de tecla individual, estilo iOS/macOS.
// KbdShortcut — combinación de teclas con el modificador resuelto según
// plataforma (⌘ en Mac, Ctrl en Windows/Linux).

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { useModKey } from "@/lib/hooks/use-platform";

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-border bg-muted/60 px-1.5 font-mono text-[10px] font-medium text-foreground/80",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// Acepta un array de teclas. El primer "mod" se reemplaza dinámicamente
// por ⌘ en Mac, Ctrl en Win/Linux. El resto se renderiza literal.
//   <KbdShortcut keys={["mod", "K"]} />  → "⌘ K" o "Ctrl K"
export function KbdShortcut({
  keys,
  className,
  separator = "+",
}: {
  keys: string[];
  className?: string;
  separator?: string;
}) {
  const mod = useModKey();
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((k, i) => {
        const label = k === "mod" ? mod : k;
        return (
          <Fragment key={`${k}-${i}`}>
            <Kbd>{label}</Kbd>
            {i < keys.length - 1 ? (
              <span className="text-muted-foreground/50 text-[10px]">
                {separator}
              </span>
            ) : null}
          </Fragment>
        );
      })}
    </span>
  );
}
