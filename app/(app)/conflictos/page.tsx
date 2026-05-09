import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
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
import { requireUser } from "@/lib/auth/session";
import { listAllConflicts } from "@/lib/db/queries/conflicts";

export const metadata = { title: "Conflictos · LDP Legal Suite" };

export default async function ConflictosPage() {
  const user = await requireUser();
  const pairs = await listAllConflicts(user.firmId, user.userId);

  const totalCases = pairs.reduce((s, p) => s + p.cases.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Conflictos de interés
          </h1>
          <p className="text-sm text-muted-foreground">
            Personas o entidades que figuran simultáneamente como cliente del
            firm y como contraparte en algún caso. La detección automática se
            basa en RNC/cédula, ignorando guiones y espacios.
          </p>
        </div>
      </div>

      {pairs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ShieldCheck className="h-10 w-10 text-emerald-600" />
            <div>
              <p className="text-base font-medium">Sin conflictos detectados</p>
              <p className="text-sm text-muted-foreground">
                Ningún cliente del firm aparece como contraparte en otro caso.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Conflictos detectados" value={String(pairs.length)} />
            <Kpi label="Casos involucrados" value={String(totalCases)} />
            <Kpi label="Clientes afectados" value={String(pairs.length)} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-base">
                Detalle de coincidencias
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente del firm</TableHead>
                    <TableHead className="font-mono text-xs">ID fiscal</TableHead>
                    <TableHead>Casos donde es contraparte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairs.map((p) => (
                    <TableRow key={p.taxIdNormalized}>
                      <TableCell>
                        <Link
                          href={`/clientes/${p.client.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.client.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          Estado: {p.client.status}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {p.taxId}
                      </TableCell>
                      <TableCell>
                        <ul className="space-y-1.5">
                          {p.cases.map((c) => (
                            <li key={c.id} className="text-sm">
                              <Link
                                href={`/casos/${c.id}`}
                                className="font-mono text-xs hover:underline"
                              >
                                {c.code}
                              </Link>
                              <span className="ml-2">{c.title}</span>
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                {c.status}
                              </Badge>
                              {c.counterpartyName ? (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  Contraparte registrada: {c.counterpartyName}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
