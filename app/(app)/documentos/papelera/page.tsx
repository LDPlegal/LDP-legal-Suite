// Papelera — vista para restaurar o eliminar definitivamente carpetas y docs
// que fueron soft-deleted. Se accede desde un link en /documentos.

import Link from "next/link";
import {
  ArrowUpFromLine,
  Folder as FolderIcon,
  FileText,
  Image as ImageIcon,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth/session";
import { listDeletedFolders } from "@/lib/db/queries/folders";
import { listDeletedDocuments } from "@/lib/db/queries/documents";
import { formatBytes } from "@/lib/documents/format";
import { formatInFirmTz } from "@/lib/datetime/format";
import {
  eliminarDefinitivoCarpetaAction,
  eliminarDefinitivoDocumentoAction,
  restaurarCarpetaAction,
  restaurarDocumentoAction,
} from "@/app/_actions/papelera";
import { EmptyTrashButton } from "./_components/empty-trash-button";

export const metadata = { title: "Papelera · Documentos · LDP Legal Suite" };

export default async function PapeleraPage() {
  const user = await requireUser();

  const [folders, docs] = await Promise.all([
    listDeletedFolders(user.firmId, user.userId),
    listDeletedDocuments(user.firmId, user.userId),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/documentos"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Documentos
      </Link>
      <PageHeader
        eyebrow="Archivo"
        title="Papelera"
        description="Carpetas y documentos eliminados. Restaurá o eliminá definitivamente."
        count={folders.length + docs.length}
        countLabel={{ singular: "item", plural: "items" }}
      >
        <EmptyTrashButton itemCount={folders.length + docs.length} />
      </PageHeader>

      {folders.length === 0 && docs.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          La papelera está vacía. Los items eliminados con el botón 🗑️ aparecen
          acá hasta que los restaures o los elimines definitivamente.
        </Card>
      ) : null}

      {folders.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Carpetas ({folders.length})
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {folders.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderIcon className="h-4 w-4 shrink-0 text-warning" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Eliminada{" "}
                          {f.deletedAt
                            ? formatInFirmTz(f.deletedAt, undefined, "dd/MM/yyyy HH:mm")
                            : "—"}
                          {f.path && f.path !== "/" ? ` · path: ${f.path}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={restaurarCarpetaAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <Button type="submit" variant="outline" size="sm">
                          <ArrowUpFromLine className="h-3.5 w-3.5" />
                          Restaurar
                        </Button>
                      </form>
                      <ConfirmButton
                        action={eliminarDefinitivoCarpetaAction}
                        title="¿Eliminar definitivamente?"
                        description={`La carpeta "${f.name}" se borra de la DB. Esta acción no se puede deshacer.`}
                        confirmLabel="Eliminar para siempre"
                        trigger={
                          <Button variant="ghost" size="sm" className="text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar para siempre
                          </Button>
                        }
                      >
                        <input type="hidden" name="id" value={f.id} />
                      </ConfirmButton>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {docs.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Documentos ({docs.length})
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {docs.map((d) => {
                  const isImage = d.mimeType.startsWith("image/");
                  return (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {isImage ? (
                          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(d.sizeBytes)} · Eliminado{" "}
                            {d.deletedAt
                              ? formatInFirmTz(d.deletedAt, undefined, "dd/MM/yyyy HH:mm")
                              : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <form action={restaurarDocumentoAction}>
                          <input type="hidden" name="id" value={d.id} />
                          <Button type="submit" variant="outline" size="sm">
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                            Restaurar
                          </Button>
                        </form>
                        <ConfirmButton
                          action={eliminarDefinitivoDocumentoAction}
                          title="¿Eliminar definitivamente?"
                          description={`"${d.name}" se borra de la DB y del storage. Esta acción no se puede deshacer.`}
                          confirmLabel="Eliminar para siempre"
                          trigger={
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar para siempre
                            </Button>
                          }
                        >
                          <input type="hidden" name="id" value={d.id} />
                        </ConfirmButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
