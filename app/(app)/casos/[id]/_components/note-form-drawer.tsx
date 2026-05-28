"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
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
import { refinarNotaAction } from "@/app/_actions/ai/refinar-nota";

const initial: NotaFormState = { ok: true, noteId: "" };

const EMPTY_DOC: TiptapDoc = { type: "doc", content: [{ type: "paragraph" }] };

export function NoteFormDrawer({
  trigger,
  caseId,
  noteId,
  initialTitle,
  initialContent,
  aiEnabled = false,
}: {
  trigger: ReactNode;
  caseId: string;
  noteId?: string;
  initialTitle?: string | null;
  initialContent?: TiptapDoc;
  aiEnabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<TiptapDoc>(initialContent ?? EMPTY_DOC);
  const [titleValue, setTitleValue] = useState(initialTitle ?? "");
  const [editorKey, setEditorKey] = useState(0);
  const [refining, setRefining] = useState(false);
  const router = useRouter();

  async function handleRefine() {
    setRefining(true);
    try {
      const r = await refinarNotaAction({
        caseId,
        noteTitle: titleValue || null,
        content: JSON.stringify(content),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Replace content with the refined plain text wrapped in paragraph
      // blocks. We split on double-newlines so paragraphs survive the
      // round-trip; original formatting is lost but the text is improved.
      const paragraphs = r.text
        .split(/\n{2,}/u)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const next: TiptapDoc = {
        type: "doc",
        content:
          paragraphs.length > 0
            ? paragraphs.map((p) => ({
                type: "paragraph",
                content: [{ type: "text", text: p }],
              }))
            : [{ type: "paragraph" }],
      };
      setContent(next);
      // Force RichTextEditor to remount so its internal state picks up the
      // new doc (the editor reads initialContent only on mount).
      setEditorKey((k) => k + 1);
      toast.success("Gestión refinada con IA", {
        description: `Tokens: ${r.usage.inputTokens} entrada · ${r.usage.outputTokens} salida.`,
      });
    } finally {
      setRefining(false);
    }
  }
  const [state, action, pending] = useActionState<NotaFormState, FormData>(
    async (prev, fd) => {
      const result = await guardarNotaAction(prev, fd);
      if (result.ok) {
        toast.success(noteId ? "Gestión actualizada" : "Gestión guardada");
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
          <SheetTitle>{noteId ? "Editar gestión" : "Nueva gestión"}</SheetTitle>
          <SheetDescription>
            Gestiones internas del caso. Soportan formato (negrita, listas, citas).
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
                onChange={(e) => setTitleValue(e.currentTarget.value)}
                placeholder="Ej. Reunión con cliente 7-may"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Contenido *</Label>
                {aiEnabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRefine}
                    disabled={refining || pending}
                    title="Mejora la redacción manteniendo hechos y datos"
                  >
                    {refining ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Mejorar redacción
                  </Button>
                ) : null}
              </div>
              <RichTextEditor
                key={editorKey}
                initialContent={content}
                onChange={setContent}
                placeholder="Escribe la gestión..."
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
              Guardar gestión
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
