import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
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
import { requireUser } from "@/lib/auth/session";
import { eliminarClienteAction } from "@/app/_actions/clientes/eliminar";
import { CASE_STATUS_LABEL, MATTER_LABEL } from "@/lib/schemas/caso";

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

  const casos = await listCasesForClient(user.firmId, user.userId, cliente.id);

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
