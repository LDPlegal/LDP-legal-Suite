"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { softDeleteNote } from "@/lib/db/queries/notes";

const Schema = z.object({
  noteId: z.string().uuid(),
  caseId: z.string().uuid(),
});

export async function eliminarNotaAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = Schema.parse({
    noteId: formData.get("noteId"),
    caseId: formData.get("caseId"),
  });
  await softDeleteNote(user.firmId, user.userId, parsed.noteId);
  revalidatePath(`/casos/${parsed.caseId}`);
}
