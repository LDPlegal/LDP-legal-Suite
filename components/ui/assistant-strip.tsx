// Franja del asistente IA.
//
// Regla de producto del handoff: el asistente es SIEMPRE una franja
// discreta al pie del contenido, nunca un panel protagonista. Una frase
// y un link, y nunca propone acciones irreversibles sin aprobación.
//
// Variante `warn` (fondo oro) cuando advierte de algo que el usuario
// debería revisar; por defecto es neutra sobre superficie blanca.
//
// Sin icono: el handoff proponía un auto_awesome dorado, pero el usuario
// pidió quitarlo.

import Link from "next/link";
import { cn } from "@/lib/utils";

export function AssistantStrip({
  children,
  action,
  tone = "neutral",
  className,
}: {
  /** La frase del asistente. Una sola, corta. */
  children: React.ReactNode;
  /** Link de acción al final de la franja. */
  action?: { label: string; href: string };
  tone?: "neutral" | "warn";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "assistant-strip",
        tone === "warn" && "assistant-strip--warn",
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action ? (
        <Link
          href={action.href}
          className="flex-none text-[13px] font-medium text-action underline-offset-4 transition-colors hover:text-action-hover hover:underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
