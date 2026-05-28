"use client";

// F7+ Bloque 5 — Conectar/desconectar Microsoft (calendario + correo).
//
// Gabriel decidió que la firma usa exclusivamente Microsoft (Outlook +
// Calendar). El código Google sigue presente en el backend por si más
// adelante cambia la decisión — para reactivarlo basta con cambiar
// SHOW_GOOGLE a true abajo.
//
// Pickup de query params: el callback de OAuth redirige acá con
//   ?oauth_connected=microsoft       → conectó OK
//   ?oauth_error=<mensaje>           → falló (con detalle)
// Mostramos toast + banner persistente hasta que el usuario navegue.

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Link2,
  Link2Off,
  Loader2,
  Mail,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Toggle si en algún momento se reactiva Google.
const SHOW_GOOGLE = false;

type Connection = {
  provider: "google" | "microsoft";
  externalAccountId: string | null;
  scopes: string[];
  lastSyncAt: string | null;
};

/** Mapea errores opacos del provider a copy útil. */
function humanizeOAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("consent_required") || m.includes("admin_consent_required")) {
    return "Microsoft requiere aprobación de un admin del tenant. Pedí al admin que apruebe el acceso, esperá el correo de confirmación, y volvé a clickear 'Conectar'.";
  }
  if (m.includes("access_denied")) {
    return "Cancelaste la autorización. Volvé a clickear 'Conectar' si querés intentar de nuevo.";
  }
  if (m.includes("invalid_state") || m.includes("session_mismatch")) {
    return "La sesión expiró mientras autorizabas. Volvé a clickear 'Conectar' para reintentar.";
  }
  if (m.includes("not_configured")) {
    return "El servidor no tiene las credenciales OAuth configuradas todavía. Avisá al admin.";
  }
  if (m.includes("redirect_uri_mismatch")) {
    return "La URL de redirección no coincide con la registrada en Azure. Avisá al admin para chequear las app registrations.";
  }
  if (m.includes("token exchange failed")) {
    return `Falló el intercambio de token con Microsoft: ${raw.slice(0, 240)}`;
  }
  // Default: mostramos el mensaje crudo, recortado.
  return raw.slice(0, 280);
}

export function OAuthIntegrationsPanel({
  googleConfigured,
  microsoftConfigured,
  connections,
}: {
  googleConfigured: boolean;
  microsoftConfigured: boolean;
  connections: Connection[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Pickup de query params del callback OAuth.
  useEffect(() => {
    const oauthError = searchParams.get("oauth_error");
    const oauthConnected = searchParams.get("oauth_connected");
    const adminConsentOk = searchParams.get("admin_consent");

    if (oauthError) {
      const msg = humanizeOAuthError(oauthError);
      setBannerError(msg);
      toast.error("No se pudo conectar.", {
        description: msg,
        duration: 12000,
      });
    } else if (adminConsentOk === "ok") {
      setBannerSuccess(
        "Autorización de la organización completada. Ahora cualquier miembro de la firma puede conectar su cuenta sin pedir aprobación.",
      );
      toast.success("Organización autorizada.", {
        description: "Los usuarios ya pueden conectar sin aprobación.",
      });
    } else if (oauthConnected) {
      const provider =
        oauthConnected === "microsoft" ? "Microsoft" : oauthConnected;
      setBannerSuccess(`Cuenta ${provider} conectada correctamente.`);
      toast.success("Conectado.", {
        description: `Tu cuenta de ${provider} está enlazada.`,
      });
    }
    // Limpiamos los query params del URL para que un refresh no muestre
    // el mismo toast/banner.
    if (oauthError || oauthConnected || adminConsentOk) {
      const cleanParams = new URLSearchParams(searchParams.toString());
      cleanParams.delete("oauth_error");
      cleanParams.delete("oauth_connected");
      cleanParams.delete("admin_consent");
      const newQuery = cleanParams.toString();
      router.replace(
        newQuery
          ? `/configuracion?${newQuery}`
          : "/configuracion?tab=seguridad",
        { scroll: false },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* Banner persistente — éxito o error del último intento OAuth */}
      {bannerSuccess ? (
        <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/[0.08] p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="flex-1 text-foreground">{bannerSuccess}</p>
          <button
            type="button"
            onClick={() => setBannerSuccess(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {bannerError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/[0.08] p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-foreground">No se pudo conectar.</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {bannerError}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {SHOW_GOOGLE ? (
        <ConnectionRow
          provider="google"
          label="Google (Gmail + Calendar)"
          icon={<Mail className="h-5 w-5 text-muted-foreground" />}
          configured={googleConfigured}
        />
      ) : null}
      <ConnectionRow
        provider="microsoft"
        label="Microsoft (Outlook + Calendar)"
        icon={<Mail className="h-5 w-5 text-muted-foreground" />}
        configured={microsoftConfigured}
      />

      {/* Autorización a nivel de organización (la forma correcta para
          tenants corporativos). Solo tiene sentido mostrarla si Microsoft
          está configurado. */}
      {microsoftConfigured ? (
        <div className="rounded-md border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  Conectar sin pedir aprobación (recomendado para la firma)
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  En cuentas corporativas, Microsoft pide aprobación de un
                  admin del tenant cada vez. Hay <strong>2 formas</strong> de
                  resolverlo definitivamente —{" "}
                  <strong>solo el admin del Microsoft 365 de LDP</strong>{" "}
                  necesita hacerlo una vez. Después todos conectan sin
                  aprobación.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href="/configuracion/microsoft-setup">
                    Ver guía paso a paso
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href="/api/oauth/microsoft/admin-consent">
                    <ShieldCheck className="h-3 w-3" />
                    Intentar admin consent rápido
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Guidance sobre el flow de admin approval per-usuario */}
      <div className="rounded-md border border-blue-500/20 bg-blue-500/[0.06] p-3 text-[11px] text-muted-foreground">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1.5">
            <p>
              <strong className="text-foreground">
                Si Microsoft te pidió aprobación al conectar:
              </strong>{" "}
              lo más práctico es que un socio use el botón verde de arriba
              para autorizar toda la firma de una vez. Si en cambio aprobaron
              tu solicitud individual (te llegó un correo de confirmación),{" "}
              <strong>volvé acá y hacé click en &quot;Conectar&quot; otra
              vez</strong> — Microsoft no completa el OAuth automáticamente
              después de la aprobación.
            </p>
          </div>
        </div>
      </div>

      <p className="rounded-md border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <strong>Privacidad:</strong> al conectar autorizás a LDP Legal Suite a
        leer/escribir en tu calendario y a enviar correos en tu nombre. La
        lectura de correo entrante NO se activa por defecto — necesitás
        autorizarla por separado más adelante. Podés desconectar en cualquier
        momento desde este mismo panel.
      </p>
    </div>
  );
}
