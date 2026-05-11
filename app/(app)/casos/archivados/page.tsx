import Link from "next/link";
import { ArrowLeft, ArchiveRestore } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { listArchivedCases } from "@/lib/db/queries/cases";
import { restaurarCasoAction } from "@/app/_actions/casos/restaurar";
import { CASE_STATUS_LABEL, MATTER_LABEL } from "@/lib/schemas/caso";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Casos archivados · LDP" };

export default async function CasosArchivadosPage() {
  const user = await requireUser();
  const rows = await listArchivedCases(user.firmId, user.userId);
  const canRestore = user.role === "admin" || user.role === "partner";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/casos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Casos activos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Casos archivados
        </h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "caso archivado" : "casos archivados"}.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Sin casos archivados.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Código</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Materia</TableHead>
                  <TableHead>Estado al archivar</TableHead>
                  <TableHead>Archivado</TableHead>
                  <TableHead className="w-32 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="text-sm">{c.title}</TableCell>
                    <TableCell className="text-xs">{MATTER_LABEL[c.matterType]}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {CASE_STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.deletedAt
                        ? formatInFirmTz(c.deletedAt, undefined, "dd/MM/yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canRestore ? (
                        <form action={restaurarCasoAction}>
                          <input type="hidden" name="caseId" value={c.id} />
                          <Button type="submit" variant="outline" size="sm">
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            Restaurar
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
