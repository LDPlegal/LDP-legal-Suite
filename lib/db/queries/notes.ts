import { and, desc, eq, isNull } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { notes, users, type NewNote, type Note } from "../schema";

export type NoteListRow = {
  id: string;
  title: string | null;
  content: Record<string, unknown>;
  authorId: string | null;
  authorName: string | null;
  noteDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export async function listNotesForCase(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<NoteListRow[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: notes.id,
        title: notes.title,
        content: notes.content,
        authorId: notes.authorId,
        authorName: users.name,
        noteDate: notes.noteDate,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .leftJoin(users, eq(users.id, notes.authorId))
      .where(and(eq(notes.caseId, caseId), isNull(notes.deletedAt)))
      .orderBy(desc(notes.noteDate), desc(notes.updatedAt));
  });
}

export async function getNoteById(
  firmId: string,
  userId: string,
  noteId: string,
): Promise<Note | null> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function createNote(
  firmId: string,
  userId: string,
  data: Omit<NewNote, "firmId" | "authorId" | "id" | "createdAt" | "updatedAt" | "deletedAt">,
): Promise<Note> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(notes)
      .values({ ...data, firmId, authorId: userId })
      .returning();
    if (!row) throw new Error("createNote: insert returned no row");
    return row;
  });
}

export async function updateNote(
  firmId: string,
  userId: string,
  noteId: string,
  data: { title?: string | null; content?: Record<string, unknown>; noteDate?: Date },
): Promise<Note | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(notes)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .returning();
    return row ?? null;
  });
}

export async function softDeleteNote(
  firmId: string,
  userId: string,
  noteId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(notes)
      .set({ deletedAt: new Date() })
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .returning({ id: notes.id });
    return !!row;
  });
}

// A minimal Tiptap-shaped empty document. Tiptap accepts this on initial load.
export const EMPTY_TIPTAP_DOC: Record<string, unknown> = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
