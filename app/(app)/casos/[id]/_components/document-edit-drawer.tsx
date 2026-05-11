"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  editarDocumentoAction,
  type EditarDocumentoState,
} from "@/app/_actions/documentos/editar";

const initial: EditarDocumentoState = { ok: true };

export function DocumentEditDrawer({
  trigger,
  caseId,
  doc,
}: {
  trigger: ReactNode;
  caseId: string;
  doc: { id: string; name: string; tags: string[] };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<EditarDocumentoState, FormData>(
    async (prev, fd) => {
      const r = await editarDocumentoAction(prev, fd);
      if (r.ok) {
        toast.success("Documento actualizado");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
      return r;
    },
    initial,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Editar documento</SheetTitle>
        </SheetHeader>
        <form action={action} className="flex flex-1 flex-col min-h-0">
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="caseId" value={caseId} />
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input name="name" required defaultValue={doc.name} maxLength={240} />
            </div>
            <div className="space-y-1.5">
              <Label>Etiquetas</Label>
              <Input
                name="tags"
                defaultValue={doc.tags.join(", ")}
                placeholder="Coma separadas: contrato, firmado, original"
              />
            </div>
            {!state.ok ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Guardar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
