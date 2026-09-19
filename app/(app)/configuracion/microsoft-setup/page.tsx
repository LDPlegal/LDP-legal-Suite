// Guía paso a paso para que el admin del tenant Microsoft 365 de LDP
// habilite el consentimiento de usuarios, para que cualquier miembro de
// la firma pueda conectar su cuenta sin necesidad de aprobación cada vez.

import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Info, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Configurar Microsoft · LDP Legal Suite" };

const MS_CLIENT_ID = process.env.MICROSOFT_OAUTH_CLIENT_ID ?? "";

export default async function MicrosoftSetupPage() {
  await requireUser();

  // Link directo al Azure portal donde un admin puede grant consent.
  // Usa el endpoint /myapps que detecta el tenant automáticamente.
  const azureAdminConsentUrl = MS_CLIENT_ID
    ? `https://login.microsoftonline.com/common/adminconsent?client_id=${MS_CLIENT_ID}&redirect_uri=${encodeURIComponent(
        `${process.env.MICROSOFT_OAUTH_REDIRECT_URI ?? ""}`,
      )}&state=admin_consent`
    : "#";

  const azurePortalEnterpriseApps =
    "https://portal.azure.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview";

  const azurePortalConsentSettings =
    "https://portal.azure.com/#view/Microsoft_AAD_IAM/ConsentPoliciesMenuBlade/~/UserSettings";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/configuracion?tab=seguridad"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="h-3 w-3" />
          Volver a Configuración
        </Link>
        <PageHeader
          eyebrow="Microsoft 365"
          title="Cómo conectar las cuentas de la firma"
          description="En cuentas corporativas, Microsoft pide aprobación de un admin del tenant. Hay dos formas de resolverlo, escoge la que prefieras. Solo el admin del Microsoft 365 de LDP necesita hacerlo, una vez."
        />
      </div>

      {/* OPCIÓN 1, La más rápida */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[3px] bg-action/15 text-action dark:text-action text-base font-semibold">
              1
            </span>
            <div className="flex-1 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Opción A, Habilitar consentimiento de usuarios (recomendado)
              </h2>
              <p className="text-sm text-muted-foreground">
                Cambio único en el panel de Azure. Tarda 30 segundos. Después,
                cualquier socio conecta su cuenta sin aprobación.
              </p>
            </div>
          </div>

          <ol className="space-y-3 pl-2 text-sm">
            <Step n="1">
              Abrí el panel de configuración de consentimiento:{" "}
              <a
                href={azurePortalConsentSettings}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Azure → Enterprise applications → Consent and permissions
                <ExternalLink className="h-3 w-3" />
              </a>
            </Step>
            <Step n="2">
              En <strong>&quot;User consent for applications&quot;</strong>,
              cambiá la opción a:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                Allow user consent for apps
              </code>{" "}
              (o como mínimo:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                Allow user consent for apps from verified publishers, for selected permissions
              </code>
              ).
            </Step>
            <Step n="3">
              Click <strong>Save</strong> arriba en el toolbar de Azure.
            </Step>
            <Step n="4">
              Listo. Cada miembro de la firma puede ahora ir a{" "}
              <Link href="/configuracion?tab=seguridad" className="text-primary hover:underline">
                Configuración → Seguridad → Conectar Microsoft
              </Link>{" "}
              y autorizar individualmente.
            </Step>
          </ol>

          <div className="rounded-md border border-action/30 bg-action/[0.06] p-3 text-[12px] text-muted-foreground">
            <CheckCircle2 className="mr-1 inline h-3 w-3 text-action align-text-bottom" />
            Esta es la forma más limpia. Cada socio decide individualmente
            cuándo conectar, y el admin no tiene que aprobar pedidos uno
            por uno.
          </div>
        </CardContent>
      </Card>

      {/* OPCIÓN 2, Admin consent directo */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[3px] bg-action/15 text-action dark:text-action text-base font-semibold">
              2
            </span>
            <div className="flex-1 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Opción B, Pre-autorizar para toda la organización
              </h2>
              <p className="text-sm text-muted-foreground">
                El admin grant consent una vez para toda la firma. Después
                nadie ve ninguna pantalla de aprobación al conectar.
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Hay 2 sub-opciones aquí:
          </p>

          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="mb-2 text-[13px] font-medium">
                B.1, Vía el Azure Portal (más confiable)
              </p>
              <ol className="space-y-2 text-sm">
                <Step n="1">
                  <a
                    href={azurePortalEnterpriseApps}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Abrí Enterprise applications en Azure
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Step>
                <Step n="2">
                  Buscá <strong>&quot;LDP legal Advisors&quot;</strong> en
                  la lista (puede que primero tengas que clickear &quot;All
                  applications&quot;).
                </Step>
                <Step n="3">
                  En el menú lateral de esa app → <strong>Permissions</strong>.
                </Step>
                <Step n="4">
                  Click el botón{" "}
                  <strong>&quot;Grant admin consent for [tu tenant]&quot;</strong>{" "}
                  en la barra de acciones.
                </Step>
                <Step n="5">
                  Aceptá la pantalla de consent que aparece.
                </Step>
              </ol>
            </div>

            <div className="rounded-md border bg-muted/30 p-4">
              <p className="mb-2 text-[13px] font-medium">
                B.2, Vía URL directa de Microsoft
              </p>
              <p className="mb-3 text-[12px] text-muted-foreground leading-relaxed">
                Microsoft tiene una URL directa para grant consent. Hacé click,
                iniciá sesión con la cuenta admin del tenant LDP, y aprobá
                en la pantalla que aparece.
              </p>
              {MS_CLIENT_ID ? (
                <Button asChild size="sm" variant="outline">
                  <a href={azureAdminConsentUrl} target="_blank" rel="noopener">
                    <ShieldCheck className="h-3 w-3" />
                    Abrir admin consent URL
                  </a>
                </Button>
              ) : (
                <p className="text-[11px] text-destructive">
                  MICROSOFT_OAUTH_CLIENT_ID no configurado.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-md border border-action/30 bg-action/[0.06] p-3 text-[12px] text-muted-foreground">
            <Info className="mr-1 inline h-3 w-3 text-action align-text-bottom" />
            Después de aceptar, el banner verde aparece dentro de la app y
            cualquier miembro puede conectar.
          </div>
        </CardContent>
      </Card>

      {/* Help final */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <h3 className="text-sm font-semibold">Si igual no funciona</h3>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Pueden conectar con cuentas Microsoft <strong>personales</strong>{" "}
            (Outlook.com, Hotmail) sin ninguna aprobación. Sirve mientras se
            resuelve la configuración del tenant, el calendario y los correos
            se sincronizan igual, solo que desde una cuenta personal en vez
            de la corporativa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-[10px] font-semibold text-foreground/70">
        {n}
      </span>
      <span className="text-foreground/90">{children}</span>
    </li>
  );
}
