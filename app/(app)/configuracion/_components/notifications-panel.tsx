"use client";

// Panel de preferencias de notificación por email. Cada toggle activa/desactiva
// el envío de correo para ese tipo de evento (la notificación in-app entra
// siempre; esto solo controla el correo). Opt-in: todo arranca apagado.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { EMAILABLE_KINDS, type NotificationKind } from "@/lib/notifications/catalog";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import {
  toggleEmailPrefAction,
  setNotificationSenderAction,
  sendTestEmailAction,
} from "@/app/_actions/configuracion/email-prefs";

type SenderUser = { id: string; name: string; email: string; mailbox: string };

export function NotificationsPanel({
  enabledKinds,
  senderUsers = [],
  currentSenderId = null,
  canEditSender = false,
}: {
  enabledKinds: string[];
  /** Usuarios del firm con Microsoft 365 conectado (posibles emisores). */
  senderUsers?: SenderUser[];
  /** Emisor configurado actualmente (firm.settings) o null = automático. */
  currentSenderId?: string | null;
  /** Solo admins/partners pueden cambiar la casilla emisora. */
  canEditSender?: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Set<string>>(new Set(enabledKinds));
  const [sender, setSender] = useState<string>(currentSenderId ?? "");
  const [pending, startTransition] = useTransition();

  const [testing, setTesting] = useState(false);
  function sendTest() {
    setTesting(true);
    startTransition(async () => {
      const r = await sendTestEmailAction();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error, { duration: 12000 });
      setTesting(false);
    });
  }

  function changeSender(value: string) {
    setSender(value);
    startTransition(async () => {
      const r = await setNotificationSenderAction({
        userId: value === "" ? null : value,
      });
      if (r.ok) {
        toast.success("Casilla emisora actualizada.");
        router.refresh();
      } else {
        toast.error(r.error);
        setSender(currentSenderId ?? "");
      }
    });
  }

  function toggle(kind: string, next: boolean) {
    // Optimista: actualizamos el set ya, revertimos si falla.
    setEnabled((prev) => {
      const s = new Set(prev);
      if (next) s.add(kind);
      else s.delete(kind);
      return s;
    });
    startTransition(async () => {
      const r = await toggleEmailPrefAction({ kind, enabled: next });
      if (!r.ok) {
        toast.error(r.error);
        setEnabled((prev) => {
          const s = new Set(prev);
          if (next) s.delete(kind);
          else s.add(kind);
          return s;
        });
      }
    });
  }

  // Agrupar por group.
  const groups = EMAILABLE_KINDS.reduce<Record<string, NotificationKind[]>>(
    (acc, k) => {
      (acc[k.group] ??= []).push(k);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Elegí de qué eventos querés recibir un <strong>correo</strong>. Las
        notificaciones dentro de la app (la campanita) llegan siempre; esto solo
        controla el email. Todo arranca desactivado.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={sendTest}
          disabled={testing || pending}
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Enviar correo de prueba
        </Button>
        <span className="text-xs text-muted-foreground">
          Te manda un correo a tu dirección para verificar que el envío funciona.
        </span>
      </div>

      {/* Casilla emisora (Microsoft 365), admin only */}
      {canEditSender ? (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium">Casilla emisora (Microsoft 365)</p>
          <p className="text-xs text-muted-foreground">
            Los correos de notificación salen desde esta cuenta del firm. Solo
            aparecen cuentas con Microsoft 365 conectado (Configuración →
            Seguridad → Integraciones).
          </p>
          {senderUsers.length === 0 ? (
            <p className="rounded-sm border border-dashed bg-muted/30 p-2 text-[11px] text-muted-foreground">
              Ninguna cuenta tiene Microsoft 365 conectado. Conectá una en
              Seguridad → Integraciones para que salgan los correos; mientras
              tanto se intenta el proveedor genérico si está configurado.
            </p>
          ) : (
            <select
              value={sender}
              onChange={(e) => changeSender(e.currentTarget.value)}
              disabled={pending}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Automático (primer admin conectado)</option>
              {senderUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  Enviar desde {u.mailbox} · {u.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : null}

      {Object.entries(groups).map(([group, kinds]) => (
        <div key={group} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </h3>
          <div className="divide-y rounded-lg border">
            {kinds.map((k) => (
              <div
                key={k.kind}
                className="flex items-start justify-between gap-4 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">{k.description}</p>
                </div>
                <Switch
                  checked={enabled.has(k.kind)}
                  onCheckedChange={(v) => toggle(k.kind, v)}
                  disabled={pending}
                  aria-label={`Email para ${k.label}`}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="rounded-md border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground">
        Los recordatorios de <strong>audiencias y plazos procesales</strong> se
        gestionan aparte, desde las alertas del calendario en cada evento. El
        envío de correos requiere que la firma tenga configurado un proveedor de
        email (Resend) en producción; si no, las notificaciones in-app siguen
        funcionando normalmente.
      </p>
    </div>
  );
}
