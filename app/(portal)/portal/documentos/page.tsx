import Link from "next/link";
import { FileText } from "lucide-react";
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
import { listPortalSharedDocuments } from "@/lib/db/queries/portal";
import { formatInFirmTz } from "@/lib/datetime/format";

export const metadata = { title: "Documentos · Portal LDP" };

export default async function PortalDocumentosPage() {
  const user = await requirePortalUser();
  const docs = await listPortalSharedDocuments(
    user.firmId,
    user.userId,
    user.clientId,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Documentos compartidos contigo en todos tus casos.
        </p>
      </div>

      {docs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aún no se han compartido documentos contigo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Caso</TableHead>
                  <TableHead>Tamaño</TableHead>
                  <TableHead>Subido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <a
                        href={`/api/portal/documentos/${d.id}/download`}
                        className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {d.name}
                      </a>
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.caseId ? (
                        <Link
                          href={`/portal/casos/${d.caseId}`}
                          className="font-mono text-muted-foreground hover:underline"
                        >
                          {d.caseCode}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {(d.sizeBytes / 1024).toFixed(1)} KB
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatInFirmTz(d.createdAt, undefined, "dd/MM/yyyy HH:mm")}
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
