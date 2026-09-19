import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArchiveRestore, CornerDownRight } from "lucide-react";
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

export default async function CasosArchivadosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const rows = await listArchivedCases(user.firmId, user.userId);
  const canRestore = user.role === "admin" || user.role === "partner";
  // Ids de casos también archivados: un expediente vinculado no se restaura hasta que su
  // padre salga de archivados.
  const archivedIds = new Set(rows.map((r) => r.id));

  return (
    <div className="space-y-6">
      {sp.error === "parent_archived" ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            No se puede restaurar un expediente vinculado mientras su caso padre siga
            archivado. Restaura primero el caso padre.
          </p>
        </div>
      ) : null}
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
                {rows.map((c) => {
                  // Un expediente vinculado solo se puede restaurar si su padre NO está
                  // también en la lista de archivados (mismo invariante que
                  // valida restoreCase en el servidor).
                  const parentAlsoArchived =
                    !!c.parentCaseId && archivedIds.has(c.parentCaseId);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        {c.code}
                        {c.parentCaseId ? (
                          <span
                            className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"
                            title={`Expediente vinculado de ${c.parentCaseCode ?? "otro caso"}`}
                          >
                            <CornerDownRight className="h-3 w-3" />
                            {c.parentCaseCode ?? "expediente vinculado"}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          {c.title}
                          {c.parentCaseId ? (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <CornerDownRight className="h-2.5 w-2.5" />
                              Expediente vinculado
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{MATTER_LABEL[c.matterType]}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {CASE_STATUS_LABEL[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.deletedAt
                          ? formatInFirmTz(c.deletedAt, undefined, "dd/MM/yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canRestore ? (
                          parentAlsoArchived ? (
                            <span
                              className="text-[10px] text-muted-foreground"
                              title="Restaura primero el caso padre"
                            >
                              Restaura primero el padre
                            </span>
                          ) : (
                            <form action={restaurarCasoAction}>
                              <input type="hidden" name="caseId" value={c.id} />
                              <Button type="submit" variant="outline" size="sm">
                                <ArchiveRestore className="h-3.5 w-3.5" />
                                Restaurar
                              </Button>
                            </form>
                          )
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
