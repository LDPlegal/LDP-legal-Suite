"use client";

// F7+ Bloque 4 — Panel para des-silenciar tipos de sugerencias que el
// usuario marcó como "no me muestres más" en el dashboard. Sin esta UI
// no había forma de revertir el silencio una vez aplicado.

import { useEffect, useState, useTransition } from "react";
import { BellOff, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listMutedKindsAction,
  unmuteKindAction,
} from "@/app/_actions/sugerencias";

// Labels para que el usuario entienda qué tipo de sugerencia volvería a
// recibir. Mantener en sync con lib/ai/suggestions.ts.
const KIND_LABELS: Record<string, string> = {
  stale_case: "Casos sin movimiento",
  pending_review: "Documentos pendientes de revisión",
  deadline_soon: "Plazos próximos",
  ai_budget_warn: "Avisos de presupuesto IA",
  ai_budget_critical: "Presupuesto IA al límite",
  inbox_match: "Correos relevantes (Inbox)",
};

export function MutedKindsPanel() {
  const [rows, setRows] = useState<Array<{ kindPattern: string; mutedAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    try {
      const r = await listMutedKindsAction();
      setRows(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function unmute(kind: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("kindPattern", kind);
      await unmuteKindAction(fd);
      toast.success("Volverás a recibir sugerencias de este tipo.");
      await load();
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenés tipos de sugerencias silenciados.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li
          key={r.kindPattern}
          className="flex items-center justify-between border-b pb-1.5 last:border-b-0 last:pb-0"
        >
          <span className="inline-flex items-center gap-2">
            <BellOff className="h-3 w-3 text-muted-foreground" />
            <span>{KIND_LABELS[r.kindPattern] ?? r.kindPattern}</span>
            <span className="text-[11px] text-muted-foreground">
              silenciado el {new Date(r.mutedAt).toLocaleDateString("es-DO")}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => unmute(r.kindPattern)}
            disabled={pending}
          >
            <Bell className="h-3 w-3" /> Reactivar
          </Button>
        </li>
      ))}
    </ul>
  );
}
