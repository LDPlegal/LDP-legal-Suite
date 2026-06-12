"use server";

// Crea SOLO la jerarquía de carpetas a partir de una lista de paths relativos
// (ej. "Caso/Demanda", "Caso/Demanda/Anexos"). NO sube archivos.
//
// Por qué separar esta acción de la subida:
//   - El payload es chiquito (texto, kBs), pasa cualquier body limit.
//   - El cliente luego sube cada archivo con uploadDocumentAction /
//     uploadDocumentGlobalAction (que ya existen, validadas, con OCR).
//   - Cada archivo es un POST independiente → no choca con bodySizeLimit
//     ni memory limit de Vercel functions.
//
// Idempotencia: si la carpeta ya existe a ese nivel y nombre, se reusa.
// Eso permite que re-subir la misma carpeta no falle por unique constraint.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  createFolder,
  findChildFolderByName,
  type FolderScope,
} from "@/lib/db/queries/folders";

const ScopeSchema = z.union([
  z.object({ kind: z.literal("firm") }),
  z.object({ kind: z.literal("case"), caseId: z.string().uuid() }),
  z.object({ kind: z.literal("client"), clientId: z.string().uuid() }),
]);

const InputSchema = z.object({
  scope: ScopeSchema,
  parentFolderId: z.string().uuid().nullable(),
  // Paths relativos como "A", "A/B", "A/B/C". Ordenamos por profundidad.
  // Cap a 500 carpetas — más que eso es señal de error o abuso.
  dirPaths: z.array(z.string().min(1).max(500)).max(500),
});

export type CrearEstructuraState =
  | { ok: true; pathToId: Record<string, string>; foldersCreated: number }
  | { ok: false; error: string };

export async function crearEstructuraCarpetasAction(input: {
  scope: FolderScope;
  parentFolderId: string | null;
  dirPaths: string[];
}): Promise<CrearEstructuraState> {
  const user = await requireUser();

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Datos inválidos para crear carpetas." };
  }

  const { scope, parentFolderId, dirPaths } = parsed.data;

  // Orden por profundidad: padres antes que hijos. "A" antes que "A/B".
  const sortedPaths = [...dirPaths].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    return da !== db ? da - db : a.localeCompare(b);
  });

  const pathToId: Record<string, string> = {};
  let foldersCreated = 0;

  for (const dirPath of sortedPaths) {
    const segments = dirPath.split("/").filter(Boolean);
    const name = segments[segments.length - 1] ?? "";
    if (!name) continue;
    const parentDirPath = segments.slice(0, -1).join("/");
    const parentId =
      parentDirPath === "" ? parentFolderId : (pathToId[parentDirPath] ?? null);

    // ¿Existe ya?
    const existing = await findChildFolderByName(
      user.firmId,
      user.userId,
      parentId,
      scope,
      name,
    );
    if (existing) {
      pathToId[dirPath] = existing.id;
      continue;
    }

    try {
      const created = await createFolder(user.firmId, user.userId, {
        name,
        parentFolderId: parentId,
        scope,
      });
      pathToId[dirPath] = created.id;
      foldersCreated += 1;
    } catch (err) {
      // Race: si otro request paralelo la creó al mismo tiempo, releemos.
      const fallback = await findChildFolderByName(
        user.firmId,
        user.userId,
        parentId,
        scope,
        name,
      );
      if (fallback) {
        pathToId[dirPath] = fallback.id;
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: `No se pudo crear la carpeta "${name}": ${msg}`,
        };
      }
    }
  }

  // Revalidate el path correspondiente para que el listado refresque.
  if (scope.kind === "firm") revalidatePath("/documentos");
  else if (scope.kind === "case") revalidatePath(`/casos/${scope.caseId}`);
  else revalidatePath(`/clientes/${scope.clientId}`);

  return { ok: true, pathToId, foldersCreated };
}
