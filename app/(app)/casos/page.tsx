import Link from "next/link";
import { Plus, Search, ShieldCheck } from "lucide-react";
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
import { listCases } from "@/lib/db/queries/cases";
import { listClients } from "@/lib/db/queries/clients";
import { listFirmUsers } from "@/lib/db/queries/users";
import { listMatterTemplates } from "@/lib/db/queries/matter-templates";
import { requireUser } from "@/lib/auth/session";
import { CasoFormDrawer } from "./_components/caso-form-drawer";
import {
  CASE_STATUS_LABEL,
  MATTER_LABEL,
  type MatterType,
} from "@/lib/schemas/caso";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Casos · LDP Legal Suite" };

const STATUS_VARIANT: Record<
  "open" | "on_hold" | "closed",
  "success" | "warning" | "secondary"
> = {
  open: "success",
  on_hold: "warning",
  closed: "secondary",
};

type SP = Promise<{ q?: string; status?: string; matter?: string }>;

export default async function CasosPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = (sp.status ?? "") as "" | "open" | "on_hold" | "closed";
  const matter = (sp.matter ?? "") as "" | MatterType;

  const [casesRes, clientesRes, lawyers, templates] = await Promise.all([
    listCases(user.firmId, user.userId, {
      search: q,
      status: status || undefined,
      matterType: matter || undefined,
      limit: 50,
    }),
    listClients(user.firmId, user.userId, { limit: 200 }),
    listFirmUsers(user.firmId, user.userId),
    listMatterTemplates(user.firmId, user.userId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Casos</h1>
          <p className="text-sm text-muted-foreground">
            {casesRes.total} {casesRes.total === 1 ? "caso" : "casos"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/casos/archivados">Archivados</Link>
          </Button>
          <CasoFormDrawer
          clientes={clientesRes.rows.map((c) => ({ id: c.id, displayName: c.displayName }))}
          users={lawyers.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            matterType: t.matterType,
            defaultTasks: t.defaultTasks ?? [],
            defaultEvents: t.defaultEvents ?? [],
          }))}
          trigger={
            <Button>
              <Plus className="h-4 w-4" />
              Nuevo caso
            </Button>
          }
        />
        </div>
      </div>

      <Card className="overflow-hidden">
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por código, título o contraparte..."
              className="pl-9"
            />
          </div>
          <select
            name="status"
            defaultValue={status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="open">Abiertos</option>
            <option value="on_hold">En espera</option>
            <option value="closed">Cerrados</option>
          </select>
          <select
            name="matter"
            defaultValue={matter}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todas las materias</option>
            {Object.entries(MATTER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Código</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Materia</TableHead>
              <TableHead>Líder</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Apertura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {casesRes.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  Sin casos que coincidan. Crea uno nuevo o ajusta los filtros.
                </TableCell>
              </TableRow>
            ) : (
              casesRes.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/casos/${c.id}`} className="hover:underline">
                      {c.code}
                    </Link>
                    {c.visibility === "restricted" ? (
                      <ShieldCheck
                        className="ml-1 inline h-3 w-3 text-warning"
                        aria-label="Caso restringido"
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link href={`/casos/${c.id}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{c.clientDisplayName ?? "—"}</TableCell>
                  <TableCell className="text-sm">{MATTER_LABEL[c.matterType]}</TableCell>
                  <TableCell className="text-sm">{c.leadLawyerName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status]}>{CASE_STATUS_LABEL[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {formatInFirmTz(c.openedAt, undefined, "dd/MM/yyyy")}
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
