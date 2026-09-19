import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { AssistantStrip } from "@/components/ui/assistant-strip";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { CasosTable, type CasoNode, type CasoRow } from "./_components/casos-table";
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

// Marino sólido para el estado de sistema "abierto"; neutro para cerrado.
const STATUS_VARIANT: Record<
  "open" | "on_hold" | "closed",
  "default" | "warning" | "secondary"
> = {
  open: "default",
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

  // Aplanamos al shape que consume la tabla y armamos el árbol padre/hijo.
  const toRow = (c: (typeof casesRes.rows)[number]): CasoRow => ({
    id: c.id,
    code: c.code,
    title: c.title,
    clientDisplayName: c.clientDisplayName,
    leadLawyerName: c.leadLawyerName,
    statusLabel: CASE_STATUS_LABEL[c.status],
    statusVariant: STATUS_VARIANT[c.status],
    matterLabel: MATTER_LABEL[c.matterType],
    openedAtLabel: formatInFirmTz(c.openedAt, undefined, "dd/MM/yyyy"),
    restricted: c.visibility === "restricted",
    parentCaseId: c.parentCaseId,
  });

  const byId = new Map(casesRes.rows.map((c) => [c.id, c]));
  const childrenOf = new Map<string, CasoRow[]>();
  const roots: CasoNode[] = [];

  for (const c of casesRes.rows) {
    // Un subexpediente cuyo padre no está en el resultado (filtrado o no
    // visible por RLS) sube a primer nivel para no desaparecer.
    if (c.parentCaseId && byId.has(c.parentCaseId)) {
      const list = childrenOf.get(c.parentCaseId) ?? [];
      list.push(toRow(c));
      childrenOf.set(c.parentCaseId, list);
    }
  }

  for (const c of casesRes.rows) {
    if (c.parentCaseId && byId.has(c.parentCaseId)) continue;
    roots.push({ ...toRow(c), children: childrenOf.get(c.id) ?? [] });
  }

  const vinculados = casesRes.rows.filter((c) => c.parentCaseId).length;

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
            <Button variant="action">
              <Icon name="add" size={17} />
              Nuevo caso
            </Button>
          }
        />
      </PageHeader>

      {/* Filtros */}
      <form className="flex flex-wrap items-center gap-2 rounded-[4px] border border-border bg-card p-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por código, título, cliente o contraparte…"
            className="pl-9"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-[3px] border border-input bg-card px-3 text-[13.5px] text-foreground"
        >
          <option value="">Todos los estados</option>
          <option value="open">Abiertos</option>
          <option value="on_hold">En espera</option>
          <option value="closed">Cerrados</option>
        </select>
        <select
          name="matter"
          defaultValue={matter}
          className="h-9 rounded-[3px] border border-input bg-card px-3 text-[13.5px] text-foreground"
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
          icon={<Icon name="work" size={20} />}
          title="No hay casos que coincidan"
          description={
            q || status || matter
              ? "Ajustá los filtros o creá un nuevo expediente para comenzar."
              : "Empezá creando tu primer caso. Podés usar una plantilla para acelerar la carga inicial."
          }
        />
      ) : (
        <div className="space-y-3">
          <Card className="overflow-hidden">
            <CasosTable nodes={roots} />
          </Card>
          {vinculados > 0 ? (
            <AssistantStrip>
              {vinculados === 1
                ? "1 expediente vinculado se muestra anidado bajo su expediente padre."
                : `${vinculados} expedientes vinculados se muestran anidados bajo su expediente padre.`}
            </AssistantStrip>
          ) : null}
        </div>
      )}
    </div>
  );
}
