import Link from "next/link";
import { Briefcase, Plus, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
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
      <PageHeader
        eyebrow="Expedientes"
        title="Casos"
        description="Cartera completa del firm. Filtrá por estado o materia para localizar lo que necesités."
        count={casesRes.total}
        countLabel={{ singular: "caso", plural: "casos" }}
      >
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
      </PageHeader>

      {/* Filtros */}
      <form className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card backdrop-blur-xl p-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por código, título o contraparte…"
            className="pl-9"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-lg border border-input bg-[var(--glass-bg-subtle)] backdrop-blur-sm px-3 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="open">Abiertos</option>
          <option value="on_hold">En espera</option>
          <option value="closed">Cerrados</option>
        </select>
        <select
          name="matter"
          defaultValue={matter}
          className="h-9 rounded-lg border border-input bg-[var(--glass-bg-subtle)] backdrop-blur-sm px-3 text-sm"
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

      {/* Tabla o empty state */}
      {casesRes.rows.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-5 w-5" />}
          title="No hay casos que coincidan"
          description={
            q || status || matter
              ? "Ajustá los filtros o creá un nuevo expediente para comenzar."
              : "Empezá creando tu primer caso. Podés usar una plantilla para acelerar la carga inicial."
          }
        />
      ) : (
        <Card className="overflow-hidden">
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
              {casesRes.rows.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/casos/${c.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
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
                    <Link
                      href={`/casos/${c.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.clientDisplayName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {MATTER_LABEL[c.matterType]}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.leadLawyerName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status]}>
                      {CASE_STATUS_LABEL[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {formatInFirmTz(c.openedAt, undefined, "dd/MM/yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
