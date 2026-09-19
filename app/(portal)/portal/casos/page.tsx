import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePortalUser } from "@/lib/auth/session";
import { listPortalCases } from "@/lib/db/queries/portal";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Mis casos · Portal LDP" };

const STATUS_LABEL: Record<string, string> = {
  open: "Abierto",
  on_hold: "En espera",
  closed: "Cerrado",
};

export default async function PortalCasosPage() {
  const user = await requirePortalUser();
  const cases = await listPortalCases(user.firmId, user.userId, user.clientId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis casos</h1>
        <p className="text-sm text-muted-foreground">
          {cases.length === 0
            ? "Aún no hay casos asociados a tu cuenta."
            : `${cases.length} caso${cases.length === 1 ? "" : "s"} en total.`}
        </p>
      </div>

      {cases.length === 0 ? null : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Código</TableHead>
                  <TableHead>Caso</TableHead>
                  <TableHead>Materia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Líder</TableHead>
                  <TableHead>Apertura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/portal/casos/${c.id}`} className="hover:underline">
                        {c.code}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/portal/casos/${c.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.matterType}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.leadLawyerName ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatInFirmTz(c.openedAt, undefined, "dd/MM/yyyy")}
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
