"use client";

// F7+ Bloque 5, Botón "Sincronizar con Outlook" que dispara
// /api/sync/calendar para traer cambios del provider sin esperar al cron.
//
// Cuando el sync falla por necesitar reconexión (tokens irrecuperables o
// permisos revocados), el toast incluye una acción "Reconectar" que
// lleva directamente a /configuracion → Seguridad.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WithTooltip } from "@/components/ui/icon-button";

type SyncResponse =
  | {
      ok: true;
      summary: { pulled: number; skipped: number; errors: number };
      lastError: string | null;
      needsReconnect?: boolean;
    }
  | { ok: false; error: string; needsReconnect?: boolean };

export function CalendarSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function showReconnectToast(message: string) {
    toast.error(message, {
      duration: 12000,
      action: {
        label: "Reconectar",
        onClick: () => {
          window.location.href = "/configuracion?tab=seguridad";
        },
      },
    });
  }

  async function sync() {
    setBusy(true);
    try {
      const r = await fetch("/api/sync/calendar", { method: "POST" });
      const data = (await r.json()) as SyncResponse;

      if (!data.ok) {
        if (data.needsReconnect) {
          showReconnectToast(data.error);
        } else {
          toast.error(data.error);
        }
        return;
      }

      const s = data.summary;
      if (s.errors > 0 && s.pulled === 0 && s.skipped === 0) {
        // Sync corrió pero falló sin traer nada, mostrá el error humanizado.
        // No confundir con "no conectado": ese caso lo maneja data.ok=false
        // arriba, gracias al guard del sync route.
        const msg = data.lastError ?? "Sync falló sin detalle.";
        if (data.needsReconnect) {
          showReconnectToast(msg);
        } else {
          toast.error(msg);
        }
      } else if (s.pulled === 0 && s.skipped === 0) {
        // Sync exitoso pero no había nada nuevo. Esto NO es un error, es
        // el caso normal cuando ya estás al día.
        toast.success("Calendario ya está al día.");
      } else {
        toast.success(
          `Sincronizado · ${s.pulled} nuevos, ${s.skipped} actualizados${s.errors > 0 ? `, ${s.errors} errores` : ""}.`,
        );
      }
      router.refresh();
    } catch {
      toast.error("Error al sincronizar. Probá de nuevo en un momento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WithTooltip label="Traer eventos nuevos/modificados de Outlook (sin esperar al cron)">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={sync}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Sincronizar Outlook
      </Button>
    </WithTooltip>
  );
}
