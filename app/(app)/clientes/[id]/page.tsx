import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { getClientById } from "@/lib/db/queries/clients";
import { listCasesForClient } from "@/lib/db/queries/cases";
import { listPortalUsersForClient } from "@/lib/db/queries/users";
import { requireUser } from "@/lib/auth/session";
import { eliminarClienteAction } from "@/app/_actions/clientes/eliminar";
import { CASE_STATUS_LABEL, MATTER_LABEL } from "@/lib/schemas/caso";
import { formatInFirmTz } from "@/lib/datetime/format";
import { ClienteFormDrawer } from "../_components/cliente-form-drawer";
import { InvitarPortalDrawer } from "../_components/invitar-portal-drawer";

export const metadata = { title: "Cliente · LDP Legal Suite" };

const TYPE_LABEL: Record<"individual" | "corporate", string> = {
  individual: "Persona física",
  corporate: "Persona jurídica",
};

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const cliente = await getClientById(user.firmId, user.userId, id);
  if (!cliente) notFound();

  const [casos, portalUsers] = await Promise.all([
    listCasesForClient(user.firmId, user.userId, cliente.id),
    listPortalUsersForClient(user.firmId, user.userId, cliente.id),
  ]);
  const canManagePortal = user.role === "admin" || user.role === "partner";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{cliente.displayName}</h1>
            {cliente.legalName && cliente.legalName !== cliente.displayName ? (
              <p className="text-sm text-muted-foreground">{cliente.legalName}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{TYPE_LABEL[cliente.type]}</Badge>
            <Badge>{cliente.status}</Badge>
            <ClienteFormDrawer
              cliente={{
                id: cliente.id,
                type: cliente.type,
                displayName: cliente.displayName,
                legalName: cliente.legalName,
                taxIdType: cliente.taxIdType,
                taxId: cliente.taxId,
                primaryContactName: cliente.primaryContactName,
                email: cliente.email,
                phone: cliente.phone,
                address: cliente.address,
                billingAddress: cliente.billingAddress,
                status: cliente.status,
              }}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              }
            />
            <form action={eliminarClienteAction}>
              <input type="hidden" name="clientId" value={cliente.id} />
              <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="h-4 w-4" />
                Archivar
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos generales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Identificación">
              <span className="font-mono text-xs">{cliente.taxId ?? "—"}</span>
              {cliente.taxIdType ? (
                <span className="ml-2 text-muted-foreground">({cliente.taxIdType.toUpperCase()})</span>
              ) : null}
            </Row>
            <Row label="Contacto">{cliente.primaryContactName ?? "—"}</Row>
            <Row label="Email">{cliente.email ?? "—"}</Row>
            <Row label="Teléfono">{cliente.phone ?? "—"}</Row>
            <Separator />
            <Row label="Dirección">{cliente.address ?? "—"}</Row>
            <Row label="Facturación">{cliente.billingAddress ?? "—"}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Acceso al portal</CardTitle>
            <Badge variant="secondary">{portalUsers.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Personas autorizadas a iniciar sesión en el portal cliente y ver
              los casos, facturas y documentos compartidos de este cliente.
            </p>
            {portalUsers.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Aún no hay accesos al portal para este cliente.
              </p>
            ) : (
              <ul className="space-y-2">
                {portalUsers.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {u.status}
                      </Badge>
                      <p className="mt-1">
                        {u.lastLoginAt
                          ? `Último acceso ${formatInFirmTz(u.lastLoginAt, undefined, "dd/MM/yyyy")}`
                          : "Sin accesos aún"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canManagePortal ? (
              <InvitarPortalDrawer
                clientId={cliente.id}
                defaultName={cliente.primaryContactName ?? cliente.displayName}
                defaultEmail={cliente.email}
                trigger={
                  <Button variant="outline" size="sm">
                    <UserPlus className="h-3.5 w-3.5" />
                    Crear acceso
                  </Button>
                }
              />
            ) : null}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Casos asociados</CardTitle>
            <Badge variant="secondary">{casos.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {casos.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Sin casos. Crea uno desde la sección de Casos.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Materia</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {casos.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/casos/${c.id}`} className="hover:underline">
                          {c.code}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{c.title}</TableCell>
                      <TableCell className="text-sm">{MATTER_LABEL[c.matterType]}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{CASE_STATUS_LABEL[c.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
