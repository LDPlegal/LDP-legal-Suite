"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createFolder, type FolderScope } from "@/lib/db/queries/folders";

const Schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(120, "Máximo 120 caracteres")
    // Prohibir caracteres problemáticos en filesystems / URLs.
    .refine((s) => !/[\/\\:*?"<>|]/u.test(s), "Caracteres inválidos en el nombre"),
  parentFolderId: z.string().uuid().nullable(),
  scope: z.union([
    z.object({ kind: z.literal("firm") }),
    z.object({ kind: z.literal("case"), caseId: z.string().uuid() }),
    z.object({ kind: z.literal("client"), clientId: z.string().uuid() }),
  ]),
});

export type CrearCarpetaState =
  | { ok: true; folder: { id: string; name: string } }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function crearCarpetaAction(input: {
  name: string;
  parentFolderId: string | null;
  scope: FolderScope;
}): Promise<CrearCarpetaState> {
  const user = await requireUser();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisá el nombre.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const folder = await createFolder(user.firmId, user.userId, parsed.data);
    if (parsed.data.scope.kind === "firm") {
      revalidatePath("/documentos");
    } else if (parsed.data.scope.kind === "case") {
      revalidatePath(`/casos/${parsed.data.scope.caseId}`);
    } else {
      revalidatePath(`/clientes/${parsed.data.scope.clientId}`);
    }
    return { ok: true, folder: { id: folder.id, name: folder.name } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Errores típicos: nombre duplicado en el mismo nivel (unique constraint).
    if (msg.includes("folders_unique_name_per_parent")) {
      return { ok: false, error: "Ya existe una carpeta con ese nombre en este nivel." };
    }
    return { ok: false, error: "No se pudo crear la carpeta." };
  }
}
