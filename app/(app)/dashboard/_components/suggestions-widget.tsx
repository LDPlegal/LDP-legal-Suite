"use client";

// F7 bloque 4 — Widget de sugerencias proactivas IA para el dashboard.
//
// Muestra hasta 5 sugerencias pending del usuario actual. Cada tarjeta
// permite:
//   • Click en "Ir al caso" → aceptarSugerenciaAction (acted) + navega.
//   • Click en "Descartar" → descartarSugerenciaAction (dismissed).
//
// La hidratación inicial llega como prop `initial`; las server actions
// invalidan /dashboard de modo que router.refresh() trae el estado fresco.

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Info,
  AlertCircle,
  X,
  ArrowRight,
  Sparkles,
  ThumbsUp,
  BellOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WithTooltip } from "@/components/ui/icon-button";
import { toast } from "sonner";
import {
  aceptarSugerenciaAction,
  descartarSugerenciaAction,
  feedbackSugerenciaAction,
} from "@/app/_actions/sugerencias";

type Suggestion = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  severity: "info" | "warn" | "critical";
  createdAt: Date | string;
};

export function SuggestionsWidget({ initial }: { initial: Suggestion[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (initial.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Sugerencias del asistente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Ninguna sugerencia activa. La IA escanea tus casos cada hora y avisa cuando
            algo necesita atención.
          </p>
        </CardContent>
      </Card>
    );
  }

  function onDismiss(id: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("suggestionId", id);
      await descartarSugerenciaAction(fd);
      router.refresh();
    });
  }

  function onAck(id: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("suggestionId", id);
      await aceptarSugerenciaAction(fd);
      // No router.refresh: el Link ya navega y la página destino se recarga.
    });
  }

  function onFeedback(id: string, feedback: "useful" | "not_relevant" | "mute_kind") {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("suggestionId", id);
      fd.set("feedback", feedback);
      const r = await feedbackSugerenciaAction(fd);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar el feedback.");
        return;
      }
      toast.success(
        feedback === "mute_kind"
          ? "No volverás a ver sugerencias de este tipo."
          : feedback === "useful"
            ? "Gracias por el feedback."
            : "Marcada como no relevante.",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Sugerencias del asistente
        </CardTitle>
        <Badge variant="secondary">{initial.length}</Badge>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {initial.slice(0, 5).map((s) => {
            const Icon =
              s.severity === "critical"
                ? AlertCircle
                : s.severity === "warn"
                  ? AlertTriangle
                  : Info;
            const iconCls =
              s.severity === "critical"
                ? "text-destructive"
                : s.severity === "warn"
                  ? "text-warning"
                  : "text-action";
            return (
              <li
                key={s.id}
                className="group flex items-start gap-2 rounded-md border bg-muted/30 p-2"
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconCls}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {s.href ? (
                      <Link
                        href={s.href}
                        onClick={() => onAck(s.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        Ir <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : null}
                    <WithTooltip label="Marca esta sugerencia como útil — la IA aprende qué priorizar">
                      <button
                        type="button"
                        onClick={() => onFeedback(s.id, "useful")}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <ThumbsUp className="h-3 w-3" /> Útil
                      </button>
                    </WithTooltip>
                    <button
                      type="button"
                      onClick={() => onDismiss(s.id)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" /> Descartar
                    </button>
                    <WithTooltip label="No me muestres más sugerencias de este tipo (podés revertirlo en Configuración)">
                      <button
                        type="button"
                        onClick={() => onFeedback(s.id, "mute_kind")}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <BellOff className="h-3 w-3" /> Silenciar tipo
                      </button>
                    </WithTooltip>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {initial.length > 5 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            +{initial.length - 5} más en la bandeja completa.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
