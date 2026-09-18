"use client";

// Asistente en el dashboard — franja discreta.
//
// Antes esto era un bloque navy a pantalla completa con gradiente, grain
// y monograma. El handoff lo prohíbe explícitamente: "el asistente es
// SIEMPRE una franja discreta al pie del contenido, nunca un panel
// protagonista". Una frase y un link.
//
// Se conserva el nombre AiHero para no tocar el registro de widgets del
// dashboard (el layout personalizable lo referencia por la clave
// `ai_hero`).

import { AssistantStrip } from "@/components/ui/assistant-strip";
import { useModKey } from "@/lib/hooks/use-platform";

export function AiHero({
  ctaHref = "/casos",
  pendingPromptsCount,
}: {
  ctaHref?: string;
  pendingPromptsCount?: number;
}) {
  const mod = useModKey();
  const hasPending = Boolean(pendingPromptsCount && pendingPromptsCount > 0);

  return (
    <AssistantStrip
      tone={hasPending ? "warn" : "neutral"}
      action={{ label: "Ir a un expediente", href: ctaHref }}
    >
      {hasPending ? (
        <>
          Tenés{" "}
          <strong className="font-semibold text-[#161C24]">
            {pendingPromptsCount}{" "}
            {pendingPromptsCount === 1 ? "sugerencia" : "sugerencias"}
          </strong>{" "}
          del asistente sin revisar.
        </>
      ) : (
        <>
          El asistente está disponible dentro de cada expediente — abrilo con{" "}
          <kbd className="tabular border border-[#DCDDD7] px-1 py-px text-[11px] font-medium text-[#5C5E56]">
            {mod}
          </kbd>{" "}
          <span className="text-[#9C9D96]">+</span>{" "}
          <kbd className="tabular border border-[#DCDDD7] px-1 py-px text-[11px] font-medium text-[#5C5E56]">
            J
          </kbd>
          .
        </>
      )}
    </AssistantStrip>
  );
}
