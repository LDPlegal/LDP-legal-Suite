"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  uploadDocumentAction,
  type UploadDocumentState,
} from "@/app/_actions/documentos/upload";

const initial: UploadDocumentState = { ok: true, documentId: "" };

export function DocumentUploadDrawer({
  trigger,
  caseId,
}: {
  trigger: ReactNode;
  caseId: string;
}) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, action, pending] = useActionState<UploadDocumentState, FormData>(
    async (prev, fd) => {
      const result = await uploadDocumentAction(prev, fd);
      if (result.ok) {
        toast.success("Documento subido");
        setOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      }
      return result;
    },
    initial,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Subir documento</SheetTitle>
          <SheetDescription>
            PDF, imagen o cualquier archivo &lt; 25 MB. Si es imagen, OCR ocurre
            al subir; si es PDF u otro tipo se marca «Sin OCR» y entra en cola
            para Fase 2.5.
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("caseId", caseId);
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="file">Archivo *</Label>
              <Input id="file" name="file" type="file" required ref={fileInputRef} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags">Etiquetas</Label>
              <Input
                id="tags"
                name="tags"
                placeholder="Coma separadas: contrato, firmado, original"
              />
              <p className="text-[11px] text-muted-foreground">
                Útiles para filtrar luego (no son requeridas).
              </p>
            </div>

            {!state.ok && state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}

            {pending ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Subiendo y procesando OCR si aplica. Imágenes pueden tardar 5–15s.
              </p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Subir
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
