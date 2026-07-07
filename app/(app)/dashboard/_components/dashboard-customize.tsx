"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { guardarDashboardAction } from "@/app/_actions/preferences/dashboard";
import {
  DASHBOARD_WIDGETS,
  type ResolvedWidget,
} from "@/lib/dashboard/widgets";

// Botón "Personalizar" + diálogo para elegir qué widgets ver y en qué orden.
// Recibe el layout ya resuelto (registry + prefs del usuario). Guarda vía
// server action y refresca la página para re-renderizar el dashboard.

type Item = { id: string; label: string; description: string; visible: boolean };

export function DashboardCustomize({ widgets }: { widgets: ResolvedWidget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>(() =>
    widgets.map((w) => ({ id: w.id, label: w.label, description: w.description, visible: w.visible })),
  );
  const [saving, startSaving] = useTransition();

  function move(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j]!, next[idx]!];
      return next;
    });
  }

  function toggle(idx: number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, visible: !it.visible } : it)));
  }

  function resetDefaults() {
    setItems(
      DASHBOARD_WIDGETS.map((w) => ({
        id: w.id,
        label: w.label,
        description: w.description,
        visible: w.defaultVisible,
      })),
    );
  }

  function save() {
    startSaving(async () => {
      const r = await guardarDashboardAction(
        items.map((it) => ({ id: it.id, visible: it.visible })),
      );
      if (r.ok) {
        toast.success("Dashboard actualizado");
        setOpen(false);
        router.refresh();
      } else {
        toast.error("No se pudo guardar", { description: r.error });
      }
    });
  }

  const visibleCount = items.filter((i) => i.visible).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4" />
          Personalizar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-5">
          <DialogTitle>Personalizar dashboard</DialogTitle>
          <DialogDescription>
            Elegí qué widgets ver y en qué orden. {visibleCount} de {items.length} visibles.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto p-4">
          {items.map((it, idx) => (
            <div
              key={it.id}
              className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                it.visible ? "bg-background" : "bg-muted/40 opacity-70"
              }`}
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Subir"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  aria-label="Bajar"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{it.label}</p>
                <p className="truncate text-xs text-muted-foreground">{it.description}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(idx)}
                aria-label={it.visible ? "Ocultar widget" : "Mostrar widget"}
                title={it.visible ? "Ocultar" : "Mostrar"}
                className={`grid h-8 w-8 place-items-center rounded-md border ${
                  it.visible
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {it.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-4">
          <Button variant="ghost" size="sm" onClick={resetDefaults} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5" />
            Restablecer
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
