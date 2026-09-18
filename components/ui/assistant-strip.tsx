// Franja del asistente IA.
//
// Regla de producto del handoff: el asistente es SIEMPRE una franja
// discreta al pie del contenido, nunca un panel protagonista. Una frase
// y un link — y nunca propone acciones irreversibles sin aprobación.
//
// Variante `warn` (fondo oro) cuando advierte de algo que el usuario
// debería revisar; por defecto es neutra sobre superficie blanca.

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
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
      <Icon name="auto_awesome" size={18} className="text-[#B89254]" />
      <span className="min-w-0 flex-1">{children}</span>
      {action ? (
        <Link
          href={action.href}
          className="flex-none text-[13px] font-medium text-[#0F4C81] underline-offset-4 transition-colors hover:text-[#0A3A63] hover:underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
