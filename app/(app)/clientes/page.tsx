import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listClients } from "@/lib/db/queries/clients";
import { requireUser } from "@/lib/auth/session";
import { ClienteFormDrawer } from "./_components/cliente-form-drawer";

export const metadata = { title: "Clientes · LDP Legal Suite" };

const STATUS_LABEL: Record<"active" | "prospect" | "closed", string> = {
  active: "Activo",
  prospect: "Prospecto",
  closed: "Cerrado",
};

const STATUS_VARIANT: Record<
  "active" | "prospect" | "closed",
  "success" | "warning" | "secondary"
> = {
  active: "success",
  prospect: "warning",
  closed: "secondary",
};

const TYPE_LABEL: Record<"individual" | "corporate", string> = {
  individual: "Persona física",
  corporate: "Persona jurídica",
};

type SP = Promise<{ q?: string; status?: string; type?: string }>;

export default async function ClientesPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const statusFilter = (sp.status ?? "") as "" | "active" | "prospect" | "closed";
  const typeFilter = (sp.type ?? "") as "" | "individual" | "corporate";

  const { rows, total } = await listClients(user.firmId, user.userId, {
    search: q,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "cliente" : "clientes"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/clientes/archivados">Archivados</Link>
          </Button>
          <ClienteFormDrawer
            trigger={
              <Button>
                <Plus className="h-4 w-4" />
                Nuevo cliente
              </Button>
            }
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre, RNC o email..."
              className="pl-9"
            />
          </div>
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="prospect">Prospectos</option>
            <option value="closed">Cerrados</option>
          </select>
          <select
            name="type"
            defaultValue={typeFilter}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos los tipos</option>
            <option value="individual">Persona física</option>
            <option value="corporate">Persona jurídica</option>
          </select>
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Identificación</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  Sin clientes que coincidan. Crea uno nuevo o ajusta los filtros.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                      {c.displayName}
                    </Link>
                    {c.legalName && c.legalName !== c.displayName ? (
                      <p className="text-xs text-muted-foreground">{c.legalName}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">{TYPE_LABEL[c.type]}</TableCell>
                  <TableCell className="font-mono text-xs">{c.taxId ?? "—"}</TableCell>
                  <TableCell className="text-sm">{c.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
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
