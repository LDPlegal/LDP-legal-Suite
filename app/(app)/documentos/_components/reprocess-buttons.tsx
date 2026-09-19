"use client";

// Botones para re-procesar OCR de documentos ya subidos.
//
// Dos formas:
//   - ReprocessOneButton: por fila, re-procesa UN doc
//   - ReprocessAllButton: bulk, re-procesa hasta 10 pendientes/fallidos a la vez

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton, WithTooltip } from "@/components/ui/icon-button";
import {
  reprocessAllPendingDocsAction,
  reprocessOneDocAction,
} from "@/app/_actions/documentos/reprocess";

export function ReprocessOneButton({ docId }: { docId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function trigger() {
    start(async () => {
      const r = await reprocessOneDocAction(docId);
      if (!r.ok) {
        toast.error("Re-procesar falló", { description: r.error });
        return;
      }
      const changes: string[] = [];
      if (r.mimeChanged) changes.push("tipo corregido");
      if (r.nameChanged) changes.push("nombre con extensión");
      const meta = changes.length ? ` (${changes.join(", ")})` : "";

      if (r.ocrStatus === "done") {
        toast.success(`OCR listo${meta}`, {
          description: `${r.textChars} caracteres extraídos via ${r.method}`,
        });
      } else if (r.ocrStatus === "skipped") {
        toast.info(`OCR omitido${meta}`, { description: r.reason });
      } else {
        toast.error(`OCR falló${meta}`, { description: r.reason });
      }
      router.refresh();
    });
  }

  return (
    <IconButton
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
      label="Volver a procesar OCR de este documento"
      onClick={trigger}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
    </IconButton>
  );
}

export function ReprocessAllButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  // Acumulado entre tandas, si el user hace click N veces hasta vaciar.
  const [stats, setStats] = useState<{ done: number; skipped: number; failed: number } | null>(
    null,
  );
  const [remaining, setRemaining] = useState<number | null>(null);

  function trigger() {
    start(async () => {
      const r = await reprocessAllPendingDocsAction();
      if (!r.ok) {
        toast.error("Re-procesar falló", { description: r.error });
        return;
      }

      // Acumular stats si ya había de antes.
      const newStats = {
        done: (stats?.done ?? 0) + r.done,
        skipped: (stats?.skipped ?? 0) + r.skipped,
        failed: (stats?.failed ?? 0) + r.failed,
      };
      setStats(newStats);
      setRemaining(r.remaining);

      if (r.processed === 0) {
        toast.info("No hay documentos pendientes para re-procesar.");
        return;
      }

      const parts: string[] = [];
      if (r.done > 0) parts.push(`${r.done} OK`);
      if (r.skipped > 0) parts.push(`${r.skipped} omitidos`);
      if (r.failed > 0) parts.push(`${r.failed} fallaron`);
      const remMsg = r.remaining > 0
        ? `Quedan ${r.remaining} pendientes, click otra vez para continuar.`
        : "Todos los pendientes procesados.";

      toast.success(`Procesados ${r.processed} de este lote: ${parts.join(", ")}`, {
        description: remMsg,
        duration: 8000,
      });
      router.refresh();
    });
  }

  return (
    <WithTooltip label="Vuelve a correr OCR sobre los documentos que no están en estado 'Indexado'. Procesa hasta 10 por click.">
      <Button
        variant="outline"
        size="sm"
        onClick={trigger}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" />
        )}
        {pending
          ? "Procesando…"
          : remaining !== null && remaining === 0
            ? "Todos procesados"
            : remaining !== null && remaining > 0
              ? `Re-procesar OCR (${remaining} restantes)`
              : "Re-procesar OCR pendientes"}
      </Button>
    </WithTooltip>
  );
}
