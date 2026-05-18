"use client";

// F7+ Bloque 5 — Conectar/desconectar Google y Microsoft (calendario + correo).
//
// Sólo muestra los providers que tienen credenciales configuradas en el
// servidor (GOOGLE_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_CLIENT_ID). El estado
// "conectado" se renderiza si el usuario ya tiene una fila no-disconnected
// en calendar_integrations.

import { useTransition } from "react";
import { toast } from "sonner";
import { Calendar, Mail, Link2, Link2Off, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Connection = {
  provider: "google" | "microsoft";
  externalAccountId: string | null;
  scopes: string[];
  lastSyncAt: string | null;
};

export function OAuthIntegrationsPanel({
  googleConfigured,
  microsoftConfigured,
  connections,
}: {
  googleConfigured: boolean;
  microsoftConfigured: boolean;
  connections: Connection[];
}) {
  const [pending, startTransition] = useTransition();

  async function disconnect(provider: "google" | "microsoft") {
    startTransition(async () => {
      try {
        const r = await fetch(`/api/oauth/${provider}/disconnect`, { method: "POST" });
        if (!r.ok) {
          toast.error("No se pudo desconectar.");
          return;
        }
        toast.success(`${provider} desconectado.`);
        window.location.reload();
      } catch {
        toast.error("Error al desconectar.");
      }
    });
  }

  function ConnectionRow({
    provider,
    label,
    icon,
    configured,
  }: {
    provider: "google" | "microsoft";
    label: string;
    icon: React.ReactNode;
    configured: boolean;
  }) {
    const conn = connections.find((c) => c.provider === provider);
    return (
      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-sm font-medium">{label}</p>
            {!configured ? (
              <p className="text-[11px] text-muted-foreground">
                No configurado en el servidor — falta OAuth credentials.
              </p>
            ) : conn ? (
              <p className="text-[11px] text-muted-foreground">
                Conectado como {conn.externalAccountId ?? "(email desconocido)"}.
                {conn.scopes.length > 0 ? (
                  <>
                    {" · "}
                    {conn.scopes.length} permiso(s) otorgado(s).
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">No conectado.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conn ? (
            <>
              <Badge variant="success">Activo</Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => disconnect(provider)}
                disabled={pending}
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
                Desconectar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              asChild
              disabled={!configured}
            >
              <a href={`/api/oauth/${provider}/connect`}>
                <Link2 className="h-3 w-3" /> Conectar
              </a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ConnectionRow
        provider="google"
        label="Google (Gmail + Calendar)"
        icon={<Calendar className="h-5 w-5 text-muted-foreground" />}
        configured={googleConfigured}
      />
      <ConnectionRow
        provider="microsoft"
        label="Microsoft (Outlook + Calendar)"
        icon={<Mail className="h-5 w-5 text-muted-foreground" />}
        configured={microsoftConfigured}
      />
      <p className="rounded-md border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <strong>Privacidad:</strong> al conectar autorizás a LDP Legal Suite a leer/escribir
        en tu calendario y a enviar correos en tu nombre. La lectura de correo entrante NO
        se activa por defecto — necesitás autorizarla por separado más adelante.
        Podés desconectar en cualquier momento desde este mismo panel.
      </p>
    </div>
  );
}
