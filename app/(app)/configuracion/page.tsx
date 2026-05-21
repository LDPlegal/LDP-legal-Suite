import { and, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ShieldCheck } from "lucide-react";
import { listNcfRanges } from "@/lib/db/queries/ncf-ranges";
import { getCurrentFirm } from "@/lib/db/queries/firms";
import { listMatterTemplates } from "@/lib/db/queries/matter-templates";
import { listRates } from "@/lib/db/queries/rates";
import { listFirmUsers } from "@/lib/db/queries/users";
import { listClients } from "@/lib/db/queries/clients";
import { requireUser } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/ai";
import { adminDb } from "@/lib/db/admin";
import { users } from "@/lib/db/schema";
import {
  getBudgetStatus,
  getRoiSummary,
  getSpendByFeature,
  getSpendByUser,
} from "@/lib/ai/budget";
import { NcfRangesPanel } from "./_components/ncf-ranges-panel";
import { FirmForm } from "./_components/firm-form";
import { TemplatesPanel } from "./_components/templates-panel";
import { BrandingPanel } from "./_components/branding-panel";
import { RatesPanel } from "./_components/rates-panel";
import { TeamPanel } from "./_components/team-panel";
import { TwoFactorPanel } from "./_components/two-factor-panel";
import { AiBudgetPanel } from "./_components/ai-budget-panel";
import { OAuthIntegrationsPanel } from "./_components/oauth-integrations-panel";
import { MutedKindsPanel } from "./_components/muted-kinds-panel";
import { calendarIntegrations } from "@/lib/db/schema";
import { isNull } from "drizzle-orm";
import { isProviderConfigured } from "@/lib/oauth";

export const metadata = { title: "Configuración · LDP Legal Suite" };

export default async function ConfiguracionPage() {
  const user = await requireUser();
  const [
    ranges,
    firm,
    templates,
    ratesRows,
    firmUsers,
    clientsRes,
    budgetStatus,
    twoFactorRow,
    spendByUser,
    spendByFeature,
    roi,
  ] = await Promise.all([
    listNcfRanges(user.firmId, user.userId),
    getCurrentFirm(user.firmId, user.userId),
    listMatterTemplates(user.firmId, user.userId),
    listRates(user.firmId, user.userId),
    listFirmUsers(user.firmId, user.userId),
    listClients(user.firmId, user.userId, { limit: 200 }),
    getBudgetStatus(user.firmId),
    adminDb
      .select({ twoFactorEnabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1),
    getSpendByUser(user.firmId),
    getSpendByFeature(user.firmId),
    getRoiSummary(user.firmId),
  ]);
  // OAuth: traemos las integraciones del usuario actual (no las del firm
  // completo — cada socio ve solo las suyas).
  const oauthConnections = await adminDb
    .select({
      provider: calendarIntegrations.provider,
      externalAccountId: calendarIntegrations.externalAccountId,
      scopes: calendarIntegrations.scopes,
      lastSyncAt: calendarIntegrations.lastSyncAt,
    })
    .from(calendarIntegrations)
    .where(
      and(
        eq(calendarIntegrations.userId, user.userId),
        isNull(calendarIntegrations.disconnectedAt),
      ),
    );
  const isAdmin = user.role === "admin" || user.role === "partner";
  const aiEnabled = isAiEnabled();
  const aiModel = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const twoFactorEnabled = twoFactorRow[0]?.twoFactorEnabled ?? false;

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
          <TabsTrigger value="equipo">Equipo</TabsTrigger>
          <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
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

        <TabsContent value="firm" className="space-y-4">
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

          <Card>
            <CardHeader>
              <CardTitle>Branding de factura</CardTitle>
            </CardHeader>
            <CardContent>
              <BrandingPanel
                canEdit={isAdmin}
                initialLogoUrl={firm?.logoUrl ?? null}
                initialHeader={
                  typeof (firm?.settings as Record<string, unknown> | undefined)?.invoiceHeader ===
                  "string"
                    ? ((firm!.settings as Record<string, unknown>).invoiceHeader as string)
                    : ""
                }
                initialFooter={
                  typeof (firm?.settings as Record<string, unknown> | undefined)?.invoiceFooter ===
                  "string"
                    ? ((firm!.settings as Record<string, unknown>).invoiceFooter as string)
                    : ""
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="equipo">
          <Card>
            <CardHeader>
              <CardTitle>Equipo del firm</CardTitle>
            </CardHeader>
            <CardContent>
              <TeamPanel
                currentUserId={user.userId}
                currentRole={user.role}
                members={firmUsers.map((u) => ({
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  role: u.role,
                  status: u.status,
                  hourlyRate: u.hourlyRate,
                  lastLoginAt: u.lastLoginAt,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguridad" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                Autenticación de dos factores (2FA)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TwoFactorPanel enabled={twoFactorEnabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Integraciones (Google / Microsoft)</CardTitle>
            </CardHeader>
            <CardContent>
              <OAuthIntegrationsPanel
                googleConfigured={isProviderConfigured("google")}
                microsoftConfigured={isProviderConfigured("microsoft")}
                connections={oauthConnections.map((c) => ({
                  provider: c.provider,
                  externalAccountId: c.externalAccountId,
                  scopes: c.scopes ?? [],
                  lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Casos confidenciales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Cada caso tiene un nivel de confidencialidad (configurable desde la
                pestaña Caso → Editar):
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs">
                <li>
                  <strong>Normal</strong>: comportamiento por defecto. Visible al
                  equipo del firm asignado al caso.
                </li>
                <li>
                  <strong>Confidencial</strong>: cada lectura por usuarios distintos
                  al lead lawyer queda registrada en la bitácora de auditoría.
                </li>
                <li>
                  <strong>Ultra-confidencial</strong>: los documentos se cifran a
                  nivel de aplicación (AES-256-GCM) antes de subirlos al storage.
                  Cloudflare R2 nunca ve el contenido original, solo blobs opacos.
                </li>
              </ul>
              <p className="rounded-md border border-dashed bg-muted/30 p-3 text-[11px]">
                <strong>Importante:</strong> el cifrado app-layer requiere la
                variable de entorno <code>APP_CRYPTO_MASTER_KEY</code> configurada
                en producción. Rotarla deja inaccesibles los documentos cifrados
                con la versión anterior — solo hacelo si tenés respaldo de la
                clave original.
              </p>
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

          <Card>
            <CardHeader>
              <CardTitle>Presupuesto IA</CardTitle>
            </CardHeader>
            <CardContent>
              <AiBudgetPanel
                initial={{
                  config: budgetStatus.config,
                  monthSpendUsd: budgetStatus.monthSpendUsd,
                  monthInputTokens: budgetStatus.monthInputTokens,
                  monthOutputTokens: budgetStatus.monthOutputTokens,
                  callCount: budgetStatus.callCount,
                  pctUsed: budgetStatus.pctUsed,
                  state: budgetStatus.state,
                }}
                canEdit={isAdmin}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consumo por socio (mes en curso)</CardTitle>
            </CardHeader>
            <CardContent>
              {spendByUser.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay actividad IA este mes.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {spendByUser.map((u) => (
                    <li
                      key={u.userId}
                      className="flex items-center justify-between border-b pb-1.5 last:border-b-0 last:pb-0"
                    >
                      <span className="truncate">{u.userName ?? "Sin nombre"}</span>
                      <span className="ml-3 flex shrink-0 items-baseline gap-3 font-mono text-xs tabular-nums text-muted-foreground">
                        <span>{u.callCount} llamadas</span>
                        <span className="text-foreground">US${u.spendUsd.toFixed(2)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consumo por feature (mes en curso)</CardTitle>
            </CardHeader>
            <CardContent>
              {spendByFeature.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay actividad IA este mes.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {spendByFeature.map((f) => (
                    <li
                      key={f.feature}
                      className="flex items-center justify-between border-b pb-1.5 last:border-b-0 last:pb-0"
                    >
                      <code className="text-xs">{f.feature}</code>
                      <span className="ml-3 flex shrink-0 items-baseline gap-3 font-mono text-xs tabular-nums text-muted-foreground">
                        <span>{f.callCount} llamadas</span>
                        <span className="text-foreground">US${f.spendUsd.toFixed(2)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Retorno estimado (mes en curso)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Documentos generados</p>
                  <p className="font-mono text-2xl tabular-nums">{roi.docsGenerated}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Eventos parseados desde chat</p>
                  <p className="font-mono text-2xl tabular-nums">{roi.eventsParsed}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Horas ahorradas (estim.)</p>
                  <p className="font-mono text-2xl tabular-nums">{roi.estimatedHoursSaved.toFixed(1)}h</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Valor estim. liberado</p>
                  <p className="font-mono text-2xl tabular-nums">US${roi.estimatedSavedUsd.toFixed(0)}</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Aproximación: 25 min por documento, 5 min por evento, tarifa promedio
                US$80/hora. Ajustá la tarifa real conversándolo con tus socios.
              </p>
              <p className="mt-1 text-xs">
                <strong>Neto del mes:</strong>{" "}
                <span
                  className={
                    roi.netSavingUsd >= 0
                      ? "font-mono tabular-nums text-emerald-600"
                      : "font-mono tabular-nums text-red-600"
                  }
                >
                  {roi.netSavingUsd >= 0 ? "+" : ""}
                  US${roi.netSavingUsd.toFixed(2)}
                </span>{" "}
                <span className="text-muted-foreground">
                  (ahorro estimado − consumo de API)
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sugerencias silenciadas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                Tipos de sugerencias que marcaste como &ldquo;silenciar&rdquo; desde el
                dashboard. Reactivar uno hace que volvás a recibirlas.
              </p>
              <MutedKindsPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plantillas">
          <Card>
            <CardHeader>
              <CardTitle>Plantillas de matter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Define plantillas por tipo de caso para autopoblar tareas y
                eventos al abrir uno nuevo. Útil cuando ciertos matters siguen
                un workflow repetible (demanda en cobro, constitución de
                sociedad, asistencia migratoria, etc.).
              </p>
              <TemplatesPanel
                canEdit={isAdmin}
                templates={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  matterType: t.matterType,
                  description: t.description,
                  defaultTasks: t.defaultTasks ?? [],
                  defaultEvents: t.defaultEvents ?? [],
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tarifas">
          <Card>
            <CardHeader>
              <CardTitle>Tarifas (override por usuario / materia / cliente)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tarifa por hora con resolución por especificidad: cliente {">"}
                materia {">"} usuario {">"} fallback al rate base del usuario.
                Útil cuando hay tarifas diferenciadas para clientes corporativos
                o para casos pro-bono.
              </p>
              <RatesPanel
                canEdit={isAdmin}
                rates={ratesRows.map((r) => ({
                  id: r.id,
                  userId: r.userId,
                  userName: r.userName,
                  matterType: r.matterType,
                  clientId: r.clientId,
                  hourlyRate: r.hourlyRate,
                  currency: r.currency,
                  notes: r.notes,
                  validFrom: r.validFrom,
                  validTo: r.validTo,
                }))}
                users={firmUsers.map((u) => ({ id: u.id, name: u.name }))}
                clients={clientsRes.rows.map((c) => ({
                  id: c.id,
                  displayName: c.displayName,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
