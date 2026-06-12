"use server";

// Lista carpetas activas dentro de un scope. Usada por el dialog
// "Mover a..." para mostrar destinos posibles. Opcional: excluir un
// folderId + todos sus descendientes (para no permitir mover una
// carpeta dentro de su propio subárbol).

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  listAllFoldersInScope,
  type FolderScope,
} from "@/lib/db/queries/folders";

const ScopeSchema = z.union([
  z.object({ kind: z.literal("firm") }),
  z.object({ kind: z.literal("case"), caseId: z.string().uuid() }),
  z.object({ kind: z.literal("client"), clientId: z.string().uuid() }),
]);

const InputSchema = z.object({
  scope: ScopeSchema,
  /** Si está set, se omiten esa carpeta + sus descendientes de los destinos. */
  excludeFolderId: z.string().uuid().nullable(),
});

export type ListarCarpetasScopeState =
  | {
      ok: true;
      folders: Array<{ id: string; name: string; fullPath: string }>;
    }
  | { ok: false; error: string };

export async function listarCarpetasScopeAction(input: {
  scope: FolderScope;
  excludeFolderId: string | null;
}): Promise<ListarCarpetasScopeState> {
  try {
    const user = await requireUser();
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Datos inválidos." };

    const all = await listAllFoldersInScope(user.firmId, user.userId, parsed.data.scope);

    const excluded = new Set<string>();
    if (parsed.data.excludeFolderId) {
      // Para excluir el subárbol, hacemos un walk en memoria.
      const childrenByParent = new Map<string | null, string[]>();
      for (const f of all) {
        const k = f.parentFolderId ?? null;
        if (!childrenByParent.has(k)) childrenByParent.set(k, []);
        childrenByParent.get(k)!.push(f.id);
      }
      const stack = [parsed.data.excludeFolderId];
      while (stack.length > 0) {
        const id = stack.pop()!;
        excluded.add(id);
        const kids = childrenByParent.get(id) ?? [];
        stack.push(...kids);
      }
    }

    const folders = all
      .filter((f) => !excluded.has(f.id))
      .map((f) => ({
        id: f.id,
        name: f.name,
        fullPath: f.path === "/" ? `/${f.name}` : `${f.path}/${f.name}`,
      }));

    return { ok: true, folders };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[listarCarpetasScopeAction] uncaught:", msg);
    return { ok: false, error: msg };
  }
}
