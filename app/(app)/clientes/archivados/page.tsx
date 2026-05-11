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
import { listArchivedClients } from "@/lib/db/queries/clients";
import { restaurarClienteAction } from "@/app/_actions/clientes/restaurar";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Clientes archivados · LDP" };

export default async function ClientesArchivadosPage() {
  const user = await requireUser();
  const rows = await listArchivedClients(user.firmId, user.userId);
  const canRestore = user.role === "admin" || user.role === "partner";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Clientes activos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Clientes archivados
        </h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "cliente archivado" : "clientes archivados"}.
          Restaurar reactiva el acceso al cliente y a sus accesos del portal.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Sin clientes archivados.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>ID fiscal</TableHead>
                  <TableHead>Archivado</TableHead>
                  <TableHead className="w-32 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{c.displayName}</p>
                      {c.legalName ? (
                        <p className="text-xs text-muted-foreground">
                          {c.legalName}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {c.type === "individual" ? "Persona física" : "Persona jurídica"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.taxId ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.deletedAt
                        ? formatInFirmTz(c.deletedAt, undefined, "dd/MM/yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canRestore ? (
                        <form action={restaurarClienteAction}>
                          <input type="hidden" name="clientId" value={c.id} />
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
