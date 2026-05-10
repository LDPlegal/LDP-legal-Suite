import { ComingSoon } from "@/components/layout/coming-soon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { listNcfRanges } from "@/lib/db/queries/ncf-ranges";
import { getCurrentFirm } from "@/lib/db/queries/firms";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/ai";
import { NcfRangesPanel } from "./_components/ncf-ranges-panel";
import { FirmForm } from "./_components/firm-form";

export const metadata = { title: "Configuración · LDP Legal Suite" };

export default async function ConfiguracionPage() {
  const user = await requireUser();
  const [ranges, firm] = await Promise.all([
    listNcfRanges(user.firmId, user.userId),
    getCurrentFirm(user.firmId, user.userId),
  ]);
  const isAdmin = user.role === "admin" || user.role === "partner";
  const aiEnabled = isAiEnabled();
  const aiModel = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Datos del firm, fiscal, plantillas y tarifas. Solo admins / socios pueden modificar.
        </p>
      </div>

      <Tabs defaultValue="fiscal">
        <TabsList>
          <TabsTrigger value="fiscal">Fiscal (NCF)</TabsTrigger>
          <TabsTrigger value="firm">Datos del firm</TabsTrigger>
          <TabsTrigger value="ia">IA</TabsTrigger>
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
        </TabsList>

        <TabsContent value="fiscal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rangos de NCF / e-CF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                La DGII te asigna rangos de NCF por tipo (B01 crédito fiscal, B02 consumidor
                final, E31 e-CF crédito, E32 e-CF consumidor). Carga aquí los rangos que
                tengas activos. Cuando emitas una factura en modo fiscal, el sistema asigna
                el siguiente NCF disponible automáticamente.
              </p>
              <NcfRangesPanel ranges={ranges} canEdit={isAdmin} />
              <p className="rounded-md border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground">
                Esta versión gestiona la <strong>numeración</strong> de NCF. La emisión
                electrónica real (envío del XML del e-CF a la DGII y manejo del TrackId) se
                delega a un proveedor externo (Mercury, eFacturador, etc.) o se integra en
                Fase 4. Por ahora, el PDF generado lleva el NCF válido y puedes usarlo
                como soporte de crédito fiscal.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firm">
          <Card>
            <CardHeader>
              <CardTitle>Datos del firm</CardTitle>
            </CardHeader>
            <CardContent>
              {firm ? (
                <FirmForm
                  firm={{
                    name: firm.name,
                    rnc: firm.rnc,
                    address: firm.address,
                    timezone: firm.timezone,
                    defaultCurrency: firm.defaultCurrency,
                  }}
                  canEdit={isAdmin}
                />
              ) : (
                <p className="py-4 text-sm text-muted-foreground">
                  No se pudo cargar la información del firm.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ia">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                Asistente IA (Claude)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant={aiEnabled ? "success" : "secondary"}>
                  {aiEnabled ? "Activo" : "No configurado"}
                </Badge>
                {aiEnabled ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {aiModel}
                  </span>
                ) : null}
              </div>
              {aiEnabled ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    La capa de IA está activa. Disponible en:
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      <strong>Caso → Resumen IA</strong>: genera un resumen ejecutivo
                      del caso a partir de eventos, notas, gastos y documentos OCR.
                    </li>
                    <li>
                      <strong>Notas del caso → Mejorar redacción</strong>: refina la
                      nota actual manteniendo el contenido legal.
                    </li>
                    <li>
                      <strong>Documentos → Búsqueda IA</strong>: en lugar de
                      coincidencia textual, Claude rankea por relevancia semántica.
                    </li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    Para habilitar las funciones de IA, agrega tu API key de Anthropic
                    en el archivo <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code>:
                  </p>
                  <pre className="rounded-md bg-muted p-3 font-mono text-xs">
                    ANTHROPIC_API_KEY=sk-ant-...
                  </pre>
                  <p>
                    Genera una key en{" "}
                    <a
                      href="https://console.anthropic.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      console.anthropic.com
                    </a>
                    . Luego reinicia el servidor.
                  </p>
                </div>
              )}
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground">
                <strong>Privacidad:</strong> los prompts se envían a Anthropic vía API.
                No se entrena ningún modelo con tu información (Anthropic API tiene
                política de no-training por default), pero los datos viajan a sus
                servidores. No actives la IA si tu firm tiene cláusulas de
                confidencialidad que lo prohíban.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plantillas">
          <ComingSoon
            module="Plantillas"
            phase="Fase 3"
            description="Plantillas de matter, plantilla de factura, plantilla de documento."
          />
        </TabsContent>
        <TabsContent value="tarifas">
          <ComingSoon
            module="Tarifas"
            phase="Fase 3"
            description="Tarifas por usuario, por matter, por cliente."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
