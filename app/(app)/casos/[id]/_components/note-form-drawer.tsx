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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { RichTextEditor, type TiptapDoc } from "@/components/editor/rich-text-editor";
import { guardarNotaAction, type NotaFormState } from "@/app/_actions/notas/guardar";

const initial: NotaFormState = { ok: true, noteId: "" };

const EMPTY_DOC: TiptapDoc = { type: "doc", content: [{ type: "paragraph" }] };

export function NoteFormDrawer({
  trigger,
  caseId,
  noteId,
  initialTitle,
  initialContent,
}: {
  trigger: ReactNode;
  caseId: string;
  noteId?: string;
  initialTitle?: string | null;
  initialContent?: TiptapDoc;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<TiptapDoc>(initialContent ?? EMPTY_DOC);
  const router = useRouter();
  const [state, action, pending] = useActionState<NotaFormState, FormData>(
    async (prev, fd) => {
      const result = await guardarNotaAction(prev, fd);
      if (result.ok) {
        toast.success(noteId ? "Nota actualizada" : "Nota guardada");
        setOpen(false);
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
          <SheetTitle>{noteId ? "Editar nota" : "Nueva nota"}</SheetTitle>
          <SheetDescription>
            Notas internas del caso. Soportan formato (negrita, listas, citas).
          </SheetDescription>
        </SheetHeader>
        <form
          action={(fd) => {
            fd.set("caseId", caseId);
            fd.set("content", JSON.stringify(content));
            if (noteId) fd.set("noteId", noteId);
            return action(fd);
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título (opcional)</Label>
              <Input
                id="title"
                name="title"
                defaultValue={initialTitle ?? ""}
                placeholder="Ej. Reunión con cliente 7-may"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Contenido *</Label>
              <RichTextEditor
                initialContent={initialContent}
                onChange={setContent}
                placeholder="Escribe la nota..."
              />
            </div>

            {!state.ok && state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Guardar nota
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
