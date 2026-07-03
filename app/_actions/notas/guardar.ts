"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createNote, updateNote } from "@/lib/db/queries/notes";

const Schema = z.object({
  noteId: z.string().uuid().optional(),
  caseId: z.string().uuid(),
  title: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  // Content is the Tiptap JSON document; serialized as a JSON string in the form.
  content: z.string().min(1, "La gestión está vacía."),
  // Fecha de la gestión (yyyy-mm-dd desde un <input type="date">). Opcional:
  // sin fecha, el default de la BD (ahora) aplica en creación.
  noteDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// yyyy-mm-dd → Date al mediodía local, para no cruzar el borde de día por
// desfase de zona horaria (un gestión del "3 de julio" no debe verse como el 2).
function parseNoteDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export type NotaFormState =
  | { ok: true; noteId: string }
  | { ok: false; error: string };

export async function guardarNotaAction(
  _prev: NotaFormState | undefined,
  formData: FormData,
): Promise<NotaFormState> {
  const user = await requireUser();
  const parsed = Schema.safeParse({
    noteId: formData.get("noteId") || undefined,
    caseId: formData.get("caseId"),
    title: formData.get("title"),
    content: formData.get("content"),
    noteDate: formData.get("noteDate"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { ok: false, error: first ?? "Datos inválidos." };
  }

  let contentJson: Record<string, unknown>;
  try {
    contentJson = JSON.parse(parsed.data.content) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Contenido de la gestión inválido." };
  }

  const noteDate = parseNoteDate(parsed.data.noteDate);

  if (parsed.data.noteId) {
    const updated = await updateNote(user.firmId, user.userId, parsed.data.noteId, {
      title: parsed.data.title ?? null,
      content: contentJson,
      ...(noteDate ? { noteDate } : {}),
    });
    if (!updated) return { ok: false, error: "Gestión no encontrada." };
    revalidatePath(`/casos/${parsed.data.caseId}`);
    return { ok: true, noteId: updated.id };
  }

  const created = await createNote(user.firmId, user.userId, {
    caseId: parsed.data.caseId,
    title: parsed.data.title ?? null,
    content: contentJson,
    ...(noteDate ? { noteDate } : {}),
  });
  revalidatePath(`/casos/${parsed.data.caseId}`);
  return { ok: true, noteId: created.id };
}
