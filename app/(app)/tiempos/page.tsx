import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listMyTimeEntries } from "@/lib/db/queries/timers";
import { listCases } from "@/lib/db/queries/cases";
import { requireUser } from "@/lib/auth/session";
import { formatInFirmTz } from "@/lib/datetime/format";
import { TIME_ENTRY_STATUS_LABEL } from "@/lib/schemas/fase1";
import { ManualTimeEntryDrawer } from "./_components/manual-entry-drawer";

export const metadata = { title: "Tiempos · LDP Legal Suite" };

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export default async function TiemposPage() {
  const user = await requireUser();

  // Default range: last 30 days
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);

  const [entries, casesRes] = await Promise.all([
    listMyTimeEntries(user.firmId, user.userId, { from, limit: 200 }),
    listCases(user.firmId, user.userId, { limit: 200, status: "open" }),
  ]);

  const totalSeconds = entries.reduce((sum, e) => sum + e.durationSeconds, 0);
  const billableSeconds = entries
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + e.durationSeconds, 0);
  const draftCount = entries.filter((e) => e.status === "draft").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tiempo facturable"
        title="Tiempos"
        description="Tus últimos 30 días de actividad. Usá el timer en el header para registrar trabajo en vivo, o cargá manualmente."
        count={entries.length}
        countLabel={{ singular: "entrada", plural: "entradas" }}
      >
        <ManualTimeEntryDrawer
          casos={casesRes.rows.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Entrada manual
            </Button>
          }
        />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Total" value={formatDuration(totalSeconds)} />
        <KpiCard label="Facturables" value={formatDuration(billableSeconds)} />
        <KpiCard label="Pendientes de aprobar" value={`${draftCount}`} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Fecha</TableHead>
              <TableHead className="w-28">Caso</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-24 text-right">Duración</TableHead>
              <TableHead className="w-24">Facturable</TableHead>
              <TableHead className="w-28">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  Sin entradas en los últimos 30 días. Inicia un timer desde un caso o registra una entrada manual.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatInFirmTz(e.startedAt, undefined, "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.caseCode ? (
                      <Link href={`/casos/${e.caseId}`} className="hover:underline">
                        {e.caseCode}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{e.description ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatDuration(e.durationSeconds)}
                  </TableCell>
                  <TableCell>
                    {e.billable ? (
                      <Badge variant="outline">Sí</Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.status === "approved"
                          ? "success"
                          : e.status === "invoiced"
                            ? "default"
                            : "warning"
                      }
                    >
                      {TIME_ENTRY_STATUS_LABEL[e.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
