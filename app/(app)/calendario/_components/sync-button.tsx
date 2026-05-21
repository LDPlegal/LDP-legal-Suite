"use client";

// F7+ Bloque 5 — Botón "Sincronizar con Outlook" que dispara
// /api/sync/calendar para traer cambios del provider sin esperar al cron.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CalendarSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/calendar", { method: "POST" });
      const data = (await r.json()) as
        | {
            ok: true;
            summary: { pulled: number; skipped: number; errors: number };
            lastError: string | null;
          }
        | { ok: false; error: string };
      if (!data.ok) {
        toast.error(data.error);
        return;
      }
      const s = data.summary;
      if (s.pulled === 0 && s.skipped === 0 && s.errors === 0) {
        toast.info("No tenés Microsoft conectado. Conectalo en Configuración → Seguridad.");
      } else if (s.errors > 0 && s.pulled === 0 && s.skipped === 0) {
        // Sync falló sin traer nada — mostrá el error real para debug.
        toast.error(
          data.lastError
            ? `Error sincronizando: ${data.lastError.slice(0, 200)}`
            : "Sync falló sin detalle.",
        );
      } else {
        toast.success(
          `Sincronizado · ${s.pulled} nuevos, ${s.skipped} actualizados${s.errors > 0 ? `, ${s.errors} errores` : ""}.`,
        );
      }
      router.refresh();
    } catch {
      toast.error("Error al sincronizar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={sync}
      disabled={busy}
      title="Traer eventos de Outlook ahora"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Sincronizar Outlook
    </Button>
  );
}
