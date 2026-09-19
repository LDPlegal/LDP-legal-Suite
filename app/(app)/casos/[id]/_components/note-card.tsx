"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { eliminarNotaAction } from "@/app/_actions/notas/eliminar";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { NoteFormDrawer } from "./note-form-drawer";
import { preview } from "@/lib/tiptap/extract-text";

function toDateInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function NoteCard({
  note,
  caseId,
  aiEnabled = false,
}: {
  note: {
    id: string;
    title: string | null;
    content: Record<string, unknown>;
    authorName: string | null;
    noteDate: Date;
    updatedAt: Date;
  };
  caseId: string;
  aiEnabled?: boolean;
}) {
  const txt = preview(note.content, 280);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 flex-1">
          {note.title ? (
            <p className="truncate font-medium leading-tight">{note.title}</p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {new Date(note.noteDate).toLocaleDateString("es-DO", {
              dateStyle: "long",
            })}
            {" · "}
            {note.authorName ?? "-"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <NoteFormDrawer
            caseId={caseId}
            noteId={note.id}
            initialTitle={note.title}
            initialContent={note.content}
            initialNoteDate={toDateInput(new Date(note.noteDate))}
            aiEnabled={aiEnabled}
            trigger={
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar gestión">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <ConfirmButton
            action={eliminarNotaAction}
            title="¿Eliminar esta gestión?"
            description={note.title ? `"${note.title}", esta acción es reversible (queda archivada).` : "Esta acción es reversible (queda archivada)."}
            confirmLabel="Eliminar"
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                aria-label="Eliminar gestión"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <input type="hidden" name="noteId" value={note.id} />
            <input type="hidden" name="caseId" value={caseId} />
          </ConfirmButton>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">
        {txt || <span className="italic">(Sin contenido)</span>}
      </CardContent>
    </Card>
  );
}
