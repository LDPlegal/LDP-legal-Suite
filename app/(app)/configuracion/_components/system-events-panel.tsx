"use client";

// Panel de "Eventos del sistema" — muestra los fallos que antes morían
// silenciosos (email no enviado, sync de Outlook fallido, envío parcial de
// reporte). Cada uno se puede marcar como resuelto.

import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PendingSubmitButton } from "@/components/ui/pending-submit";
import { formatInFirmTz } from "@/lib/datetime/format";
import {
  resolverEventoSistemaAction,
  resolverTodosEventosSistemaAction,
} from "@/app/_actions/sistema/eventos";

export type SystemEventRow = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "error";
  message: string;
  createdAt: Date;
  resolvedAt: Date | null;
};

const KIND_LABEL: Record<string, string> = {
  notification_email_failed: "Email de notificación",
  calendar_sync_failed: "Sync de calendario",
  hearing_report_partial_send: "Envío de reporte de audiencia",
  graph_send_failed: "Envío vía Microsoft 365",
};

const SEVERITY_META: Record<
  SystemEventRow["severity"],
  { label: string; variant: "destructive" | "warning" | "secondary"; icon: typeof AlertTriangle }
> = {
  error: { label: "Error", variant: "destructive", icon: AlertCircle },
  warning: { label: "Advertencia", variant: "warning", icon: AlertTriangle },
  info: { label: "Info", variant: "secondary", icon: Info },
};

export function SystemEventsPanel({
  events,
  canManage,
}: {
  events: SystemEventRow[];
  canManage: boolean;
}) {
  const unresolved = events.filter((e) => !e.resolvedAt);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-action/10">
          <CheckCircle2 className="h-6 w-6 text-action" />
        </span>
        <p className="text-sm font-medium">Todo en orden</p>
        <p className="text-xs text-muted-foreground">
          No hay eventos del sistema registrados. Acá aparecen fallos como
          emails que no se enviaron o sincronizaciones con problemas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {unresolved.length > 0
            ? `${unresolved.length} sin resolver de ${events.length} eventos recientes.`
            : `Todos resueltos. ${events.length} eventos en el historial.`}
        </p>
        {canManage && unresolved.length > 0 ? (
          <form action={resolverTodosEventosSistemaAction}>
            <PendingSubmitButton variant="outline" size="sm">
              Marcar todo como resuelto
            </PendingSubmitButton>
          </form>
        ) : null}
      </div>

      <ul className="space-y-2">
        {events.map((e) => {
          const meta = SEVERITY_META[e.severity];
          const Icon = meta.icon;
          const resolved = !!e.resolvedAt;
          return (
            <li
              key={e.id}
              className={[
                "rounded-lg border p-3",
                resolved ? "opacity-55" : "",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <span
                  className={[
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                    e.severity === "error"
                      ? "bg-destructive/10 text-destructive"
                      : e.severity === "warning"
                        ? "bg-warning/10 text-warning dark:text-warning"
                        : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={meta.variant} className="text-[10px]">
                      {meta.label}
                    </Badge>
                    <span className="text-xs font-medium">
                      {KIND_LABEL[e.kind] ?? e.kind}
                    </span>
                    {resolved ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-action dark:text-action">
                        <CheckCircle2 className="h-3 w-3" />
                        Resuelto
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-snug">{e.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatInFirmTz(e.createdAt, undefined, "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
                {canManage && !resolved ? (
                  <form action={resolverEventoSistemaAction} className="shrink-0">
                    <input type="hidden" name="eventId" value={e.id} />
                    <PendingSubmitButton variant="ghost" size="sm">
                      Resolver
                    </PendingSubmitButton>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
