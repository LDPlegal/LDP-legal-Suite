import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePortalUser } from "@/lib/auth/session";
import {
  getPortalCase,
  listPortalEventsForCase,
  listPortalSharedDocuments,
} from "@/lib/db/queries/portal";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Caso · Portal LDP" };

const STATUS_LABEL: Record<string, string> = {
  open: "Abierto",
  on_hold: "En espera",
  closed: "Cerrado",
};

export default async function PortalCasoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePortalUser();
  const c = await getPortalCase(user.firmId, user.userId, user.clientId, id);
  if (!c) notFound();

  const [events, docs] = await Promise.all([
    listPortalEventsForCase(user.firmId, user.userId, user.clientId, id),
    listPortalSharedDocuments(user.firmId, user.userId, user.clientId, {
      caseId: id,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/casos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Mis casos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <span className="font-mono text-sm text-muted-foreground">{c.code}</span>
          <Badge variant="outline">{STATUS_LABEL[c.status] ?? c.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Materia: {c.matterType}
          {c.leadLawyerName ? ` · Líder: ${c.leadLawyerName}` : ""}
          {c.court ? ` · Tribunal: ${c.court}` : ""}
        </p>
      </div>

      {c.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Descripción</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {c.description}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Eventos del caso</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sin eventos registrados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Asunto</TableHead>
                  <TableHead>Lugar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatInFirmTz(e.startAt, undefined, "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">
                      <p className="font-medium">{e.title}</p>
                      {e.description ? (
                        <p className="text-xs text-muted-foreground">{e.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.location ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Documentos compartidos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Aún no hay documentos compartidos contigo en este caso.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 p-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/portal/documentos/${d.id}/download`}
                      className="text-sm font-medium hover:underline"
                    >
                      {d.name}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {formatInFirmTz(d.createdAt, undefined, "dd/MM/yyyy HH:mm")} ·{" "}
                      {(d.sizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
