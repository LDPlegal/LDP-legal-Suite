import { Briefcase, Clock, FileWarning, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listCases } from "@/lib/db/queries/cases";
import { listClients } from "@/lib/db/queries/clients";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Dashboard · LDP Legal Suite" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [casesRes, clientsRes] = await Promise.all([
    listCases(user.firmId, user.userId, { limit: 1 }),
    listClients(user.firmId, user.userId, { limit: 1 }),
  ]);
  const openCasesRes = await listCases(user.firmId, user.userId, {
    status: "open",
    limit: 1,
  });

  const kpis = [
    {
      label: "Casos abiertos",
      value: openCasesRes.total,
      icon: Briefcase,
      hint: `${casesRes.total} casos totales`,
    },
    {
      label: "Clientes",
      value: clientsRes.total,
      icon: FileWarning,
      hint: "Activos + prospectos",
    },
    {
      label: "Horas facturables (mes)",
      value: "—",
      icon: Clock,
      hint: "Disponible en Fase 1",
    },
    {
      label: "Por cobrar",
      value: "—",
      icon: Receipt,
      hint: "Disponible en Fase 2",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Buen día, {user.name.split(" ")[0]}.</h1>
          <p className="text-sm text-muted-foreground">
            Resumen de la firma · {new Date().toLocaleDateString("es-DO", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Badge variant="outline" className="font-mono">Fase 0</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {k.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-semibold tabular-nums">{k.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            La bitácora de actividad llega en Fase 3 (Reportes / Analytics).
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tu cola personal</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Mis tareas y eventos llegan en Fase 1 (Tiempos · Tareas · Calendario).
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
