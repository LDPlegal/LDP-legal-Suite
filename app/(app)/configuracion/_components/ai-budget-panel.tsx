"use client";

// F7 bloque 4, Panel de presupuesto IA.
//
// Muestra el gasto del mes en curso vs el techo configurado, con visualización
// de los umbrales (70/90/100%) y un toggle para hard-cap. Solo admins pueden
// editar; el resto lo ve en read-only.

import { useState, useTransition } from "react";
import { AlertTriangle, BarChart3, Lock, Unlock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { setBudgetAction } from "@/app/_actions/configuracion/ai-budget";

type Status = {
  config: { monthlyUsd: number | null; warnThresholds: number[]; hardCap: boolean };
  monthSpendUsd: number;
  monthInputTokens: number;
  monthOutputTokens: number;
  callCount: number;
  pctUsed: number | null;
  state: "ok" | "warn70" | "warn90" | "over" | "blocked";
};

export function AiBudgetPanel({ initial, canEdit }: { initial: Status; canEdit: boolean }) {
  const [status, setStatus] = useState<Status>(initial);
  const [monthlyInput, setMonthlyInput] = useState<string>(
    initial.config.monthlyUsd != null ? String(initial.config.monthlyUsd) : "",
  );
  const [hardCap, setHardCap] = useState<boolean>(initial.config.hardCap);
  const [pending, startTransition] = useTransition();

  const pct = status.pctUsed ?? 0;
  const barWidth = Math.min(100, Math.round(pct * 100));
  const stateColor =
    status.state === "blocked" || status.state === "over"
      ? "bg-destructive"
      : status.state === "warn90"
        ? "bg-warning"
        : status.state === "warn70"
          ? "bg-warning"
          : "bg-action";

  function save() {
    const parsed = monthlyInput.trim() === "" ? null : Number(monthlyInput);
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Monto inválido.");
      return;
    }
    startTransition(async () => {
      const r = await setBudgetAction({ monthlyUsd: parsed, hardCap });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Presupuesto actualizado.");
      // Update local snapshot reasonably (% will refresh on next page load).
      setStatus((s) => ({
        ...s,
        config: { ...s.config, monthlyUsd: parsed, hardCap },
      }));
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Consumo del mes</span>
          {status.state === "blocked" ? (
            <Badge variant="destructive">Bloqueado</Badge>
          ) : status.state === "over" ? (
            <Badge variant="destructive">Sobre el tope</Badge>
          ) : status.state === "warn90" ? (
            <Badge variant="warning">90%</Badge>
          ) : status.state === "warn70" ? (
            <Badge variant="warning">70%</Badge>
          ) : status.config.monthlyUsd ? (
            <Badge variant="success">OK</Badge>
          ) : (
            <Badge variant="secondary">Sin tope</Badge>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-2 text-sm">
          <span className="font-mono text-lg">US${status.monthSpendUsd.toFixed(2)}</span>
          {status.config.monthlyUsd ? (
            <>
              <span className="text-muted-foreground">de</span>
              <span className="font-mono">US${status.config.monthlyUsd.toFixed(2)}</span>
              <span className="text-muted-foreground">({Math.round(pct * 100)}%)</span>
            </>
          ) : (
            <span className="text-muted-foreground">sin tope configurado</span>
          )}
        </div>

        {status.config.monthlyUsd ? (
          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
            <div
              className={`absolute left-0 top-0 h-full ${stateColor} transition-all`}
              style={{ width: `${barWidth}%` }}
            />
            {/* Markers at 70/90/100 */}
            <div className="pointer-events-none absolute left-0 top-0 h-full w-full">
              <div className="absolute left-[70%] top-0 h-full w-px bg-warning/70" />
              <div className="absolute left-[90%] top-0 h-full w-px bg-warning/70" />
            </div>
          </div>
        ) : null}

        <p className="mt-2 text-[11px] text-muted-foreground">
          {status.callCount.toLocaleString("es-DO")} llamadas ·{" "}
          {status.monthInputTokens.toLocaleString("es-DO")} tokens entrada ·{" "}
          {status.monthOutputTokens.toLocaleString("es-DO")} tokens salida.
          {" "}El conteo reinicia el 1 de cada mes (UTC).
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="ai-monthly" className="text-xs">
            Tope mensual (USD) {canEdit ? "" : "(solo admin/socio puede editar)"}
          </Label>
          <Input
            id="ai-monthly"
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            className="mt-1 max-w-[12rem]"
            value={monthlyInput}
            onChange={(e) => setMonthlyInput(e.currentTarget.value)}
            disabled={!canEdit || pending}
            placeholder="50"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dejá vacío para no fijar tope. Las alertas 70/90/100% se basan en este valor.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-md border p-3">
          <Switch
            id="ai-hardcap"
            checked={hardCap}
            onCheckedChange={canEdit ? setHardCap : undefined}
            disabled={!canEdit || pending}
          />
          <div className="flex-1">
            <Label htmlFor="ai-hardcap" className="flex items-center gap-1 text-sm">
              {hardCap ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              Bloquear consultas al pasar el 100%
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {hardCap
                ? "Al alcanzar el tope, las nuevas consultas a la IA devuelven error hasta el próximo mes o hasta que aumentes el límite."
                : "El equipo sigue pudiendo usar la IA aún sobre el tope; recibirás alertas pero no se bloquea."}
            </p>
          </div>
        </div>

        {canEdit ? (
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar
          </Button>
        ) : null}
      </div>

      {status.state === "warn90" || status.state === "warn70" ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            La firma ya consumió {Math.round(pct * 100)}% del presupuesto IA.{" "}
            {status.state === "warn90"
              ? "Considerá pausar funciones no críticas o aumentar el tope."
              : "Aún hay margen, pero te conviene revisar el ritmo."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
