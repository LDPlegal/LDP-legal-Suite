import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ComingSoon } from "@/components/layout/coming-soon";
import { getCaseById } from "@/lib/db/queries/cases";
import { requireUser } from "@/lib/auth/session";
import { eliminarCasoAction } from "@/app/_actions/casos/eliminar";
import {
  BILLING_MODE_LABEL,
  CASE_STATUS_LABEL,
  MATTER_LABEL,
} from "@/lib/schemas/caso";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Caso · LDP Legal Suite" };

const ASSIGNMENT_LABEL: Record<"lead" | "associate" | "paralegal", string> = {
  lead: "Líder",
  associate: "Asociado",
  paralegal: "Paralegal",
};

export default async function CasoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getCaseById(user.firmId, user.userId, id);
  if (!detail) notFound();

  const { case: c, client, leadLawyer, assignments } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/casos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a casos
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">
                {c.code}
              </span>
              {c.visibility === "restricted" ? (
                <Badge variant="warning" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Restringido
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.title}</h1>
            <p className="text-sm text-muted-foreground">
              {client?.displayName ?? "—"} · {MATTER_LABEL[c.matterType]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{CASE_STATUS_LABEL[c.status]}</Badge>
            <form action={eliminarCasoAction}>
              <input type="hidden" name="caseId" value={c.id} />
              <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="h-4 w-4" />
                Archivar
              </Button>
            </form>
          </div>
        </div>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="tiempos">Tiempos</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
          <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Detalle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Cliente">
                  {client ? (
                    <Link href={`/clientes/${client.id}`} className="hover:underline">
                      {client.displayName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row label="Líder">{leadLawyer?.name ?? "Sin asignar"}</Row>
                <Row label="Modo de facturación">{BILLING_MODE_LABEL[c.billingMode]}</Row>
                {c.flatFeeAmount ? (
                  <Row label="Tarifa plana">
                    <span className="font-mono">DOP {c.flatFeeAmount}</span>
                  </Row>
                ) : null}
                {c.retainerBalance ? (
                  <Row label="Iguala">
                    <span className="font-mono">DOP {c.retainerBalance}</span>
                  </Row>
                ) : null}
                {c.court ? <Row label="Tribunal">{c.court}</Row> : null}
                <Separator />
                <Row label="Contraparte">
                  {c.counterpartyName ?? "—"}
                  {c.counterpartyTaxId ? (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      ({c.counterpartyTaxId})
                    </span>
                  ) : null}
                </Row>
                {c.tags.length > 0 ? (
                  <Row label="Etiquetas">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </Row>
                ) : null}
                <Separator />
                <Row label="Apertura">{formatInFirmTz(c.openedAt)}</Row>
                {c.closedAt ? <Row label="Cierre">{formatInFirmTz(c.closedAt)}</Row> : null}
                {c.description ? (
                  <>
                    <Separator />
                    <p className="whitespace-pre-wrap text-sm">{c.description}</p>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Equipo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin asignaciones específicas (visibilidad: firma).
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {assignments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between rounded-md border p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{a.userName}</p>
                          <p className="text-xs text-muted-foreground">{a.userEmail}</p>
                        </div>
                        <Badge variant="outline">{ASSIGNMENT_LABEL[a.roleInCase]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tiempos">
          <ComingSoon module="Tiempos del caso" phase="Fase 1" description="Registro de horas, timer y aprobación específicos para este caso." />
        </TabsContent>
        <TabsContent value="gastos">
          <ComingSoon module="Gastos del caso" phase="Fase 1" description="Captura de recibos, reembolsable o cliente-facturable." />
        </TabsContent>
        <TabsContent value="tareas">
          <ComingSoon module="Tareas del caso" phase="Fase 1" description="Plantillas por matter, asignación y dependencias." />
        </TabsContent>
        <TabsContent value="eventos">
          <ComingSoon module="Eventos del caso" phase="Fase 1" description="Audiencias, vencimientos, integración con calendario." />
        </TabsContent>
        <TabsContent value="documentos">
          <ComingSoon module="Documentos" phase="Fase 2" description="Upload, OCR, versiones." />
        </TabsContent>
        <TabsContent value="notas">
          <ComingSoon module="Notas" phase="Fase 2" description="Tiptap richtext, privadas y compartidas." />
        </TabsContent>
        <TabsContent value="facturacion">
          <ComingSoon module="Facturación" phase="Fase 2" description="Generar factura desde tiempos + gastos aprobados." />
        </TabsContent>
        <TabsContent value="bitacora">
          <ComingSoon module="Bitácora" phase="Fase 3" description="Audit log completo de cambios sobre el caso." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
