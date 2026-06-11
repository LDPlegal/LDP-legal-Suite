// Queries para el sistema de carpetas.
//
// Todas las funciones pasan por `withFirm` para activar RLS por firm + user
// (regla del proyecto, ver DECISIONS 9.1).
//
// Cuando movemos una carpeta o creamos una sub-carpeta, recalculamos el `path`
// materializado (formato "/Demandas/2026/Caso-X") en SQL — útil para
// breadcrumbs sin recursión y para queries de tipo "todo lo que cuelgue de
// /Demandas". El recálculo recursivo en update se hace en JS (Drizzle no
// expone CTE recursivas de forma trivial); el árbol de carpetas en una firma
// legal raramente excede unos miles de nodos así que es aceptable.

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { documents, folders, type Folder, type NewFolder } from "../schema";

export type FolderScope =
  | { kind: "firm" } // raíz global de la firma
  | { kind: "case"; caseId: string }
  | { kind: "client"; clientId: string };

/**
 * Lista las carpetas hijas directas de un padre (o de la raíz del scope).
 * No incluye soft-deleted.
 */
export async function listFolderChildren(
  firmId: string,
  userId: string,
  parentFolderId: string | null,
  scope: FolderScope,
): Promise<Folder[]> {
  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(folders.deletedAt)];
    if (parentFolderId === null) {
      conds.push(isNull(folders.parentFolderId));
      // En la raíz hay que filtrar también por scope para no mezclar carpetas
      // de un caso con las globales del firm.
      if (scope.kind === "firm") {
        conds.push(isNull(folders.caseId), isNull(folders.clientId));
      } else if (scope.kind === "case") {
        conds.push(eq(folders.caseId, scope.caseId));
      } else {
        conds.push(eq(folders.clientId, scope.clientId));
      }
    } else {
      conds.push(eq(folders.parentFolderId, parentFolderId));
    }
    return tx
      .select()
      .from(folders)
      .where(and(...conds))
      .orderBy(asc(folders.name));
  });
}

export async function getFolderById(
  firmId: string,
  userId: string,
  folderId: string,
): Promise<Folder | null> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  });
}

/**
 * Reconstruye la lista de ancestros desde la carpeta hasta la raíz.
 * Devuelve del más cercano a la raíz [root, ..., currentParent, current].
 */
export async function getFolderBreadcrumb(
  firmId: string,
  userId: string,
  folderId: string,
): Promise<Folder[]> {
  return withFirm(firmId, userId, async (tx) => {
    const chain: Folder[] = [];
    let currentId: string | null = folderId;
    // Hard cap defensivo — el árbol no debería pasar de ~50 niveles.
    for (let i = 0; i < 100 && currentId !== null; i++) {
      const rows: Folder[] = await tx
        .select()
        .from(folders)
        .where(and(eq(folders.id, currentId), isNull(folders.deletedAt)))
        .limit(1);
      const folder: Folder | undefined = rows[0];
      if (!folder) break;
      chain.unshift(folder);
      currentId = folder.parentFolderId;
    }
    return chain;
  });
}

/**
 * Crea una carpeta. Si parentFolderId es null, va a la raíz del scope.
 * Calcula `path` desde el parent.
 */
export async function createFolder(
  firmId: string,
  userId: string,
  input: {
    name: string;
    parentFolderId: string | null;
    scope: FolderScope;
  },
): Promise<Folder> {
  return withFirm(firmId, userId, async (tx) => {
    let parentPath = "/";
    let caseId: string | null = null;
    let clientId: string | null = null;

    if (input.parentFolderId) {
      const parentRows = await tx
        .select()
        .from(folders)
        .where(and(eq(folders.id, input.parentFolderId), isNull(folders.deletedAt)))
        .limit(1);
      const parent = parentRows[0];
      if (!parent) throw new Error("Carpeta padre no encontrada.");
      // Path heredado del parent — concatenamos su path + nombre del parent
      // (path del parent es el camino HASTA el parent, no incluyéndolo).
      parentPath = parent.path === "/" ? `/${parent.name}` : `${parent.path}/${parent.name}`;
      caseId = parent.caseId;
      clientId = parent.clientId;
    } else {
      // En la raíz del scope, derivamos caseId/clientId del scope.
      if (input.scope.kind === "case") caseId = input.scope.caseId;
      else if (input.scope.kind === "client") clientId = input.scope.clientId;
    }

    const values: NewFolder = {
      firmId,
      caseId,
      clientId,
      parentFolderId: input.parentFolderId,
      name: input.name,
      path: parentPath,
      createdBy: userId,
    };

    const [row] = await tx.insert(folders).values(values).returning();
    if (!row) throw new Error("createFolder: insert returned no row");
    return row;
  });
}

/**
 * Busca una carpeta hermana por nombre dentro del mismo parent. Útil para
 * el upload-folder: si el usuario sube "Caso-X/Anexos" y ya existe "Caso-X",
 * reusamos la carpeta existente en vez de fallar por unique constraint.
 */
export async function findChildFolderByName(
  firmId: string,
  userId: string,
  parentFolderId: string | null,
  scope: FolderScope,
  name: string,
): Promise<Folder | null> {
  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(folders.deletedAt), eq(folders.name, name)];
    if (parentFolderId === null) {
      conds.push(isNull(folders.parentFolderId));
      if (scope.kind === "firm") {
        conds.push(isNull(folders.caseId), isNull(folders.clientId));
      } else if (scope.kind === "case") {
        conds.push(eq(folders.caseId, scope.caseId));
      } else {
        conds.push(eq(folders.clientId, scope.clientId));
      }
    } else {
      conds.push(eq(folders.parentFolderId, parentFolderId));
    }
    const rows = await tx
      .select()
      .from(folders)
      .where(and(...conds))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function softDeleteFolder(
  firmId: string,
  userId: string,
  folderId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    // Marca el folder y todos sus descendientes como soft-deleted.
    // CTE recursiva enfocada al subárbol del folder dado.
    await tx.execute(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM folders WHERE id = ${folderId} AND deleted_at IS NULL
        UNION ALL
        SELECT f.id
        FROM folders f
        INNER JOIN descendants d ON f.parent_folder_id = d.id
        WHERE f.deleted_at IS NULL
      )
      UPDATE folders
      SET deleted_at = now(), updated_at = now()
      WHERE id IN (SELECT id FROM descendants);
    `);
    // También sacamos los docs de esos folders del listado de carpeta (los
    // dejamos sueltos en la raíz, no los borramos — el usuario puede
    // re-organizarlos). Si quisiera eliminarlos, lo hace explícito.
    await tx.execute(sql`
      UPDATE documents
      SET folder_id = NULL, updated_at = now()
      WHERE folder_id = ${folderId} OR folder_id IN (
        SELECT id FROM folders WHERE path LIKE '%' OR parent_folder_id = ${folderId}
      );
    `);
    return true;
  });
}

/**
 * Mueve un documento a una carpeta. folder=null lo deja en la raíz.
 */
export async function moveDocumentToFolder(
  firmId: string,
  userId: string,
  documentId: string,
  folderId: string | null,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(documents)
      .set({ folderId, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .returning({ id: documents.id });
    return !!row;
  });
}

/**
 * Lista documentos directamente dentro de una carpeta (no recursivo).
 * folderId=null trae los de la raíz del scope.
 */
export async function listDocumentsInFolder(
  firmId: string,
  userId: string,
  folderId: string | null,
  scope: FolderScope,
) {
  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(documents.deletedAt)];
    if (folderId === null) {
      conds.push(isNull(documents.folderId));
      if (scope.kind === "firm") {
        conds.push(isNull(documents.caseId), isNull(documents.clientId));
      } else if (scope.kind === "case") {
        conds.push(eq(documents.caseId, scope.caseId));
      } else {
        conds.push(eq(documents.clientId, scope.clientId));
      }
    } else {
      conds.push(eq(documents.folderId, folderId));
    }
    return tx
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        tags: documents.tags,
        ocrStatus: documents.ocrStatus,
        version: documents.version,
        sharedWithClient: documents.sharedWithClient,
        createdAt: documents.createdAt,
        caseId: documents.caseId,
        clientId: documents.clientId,
        folderId: documents.folderId,
      })
      .from(documents)
      .where(and(...conds))
      .orderBy(desc(documents.createdAt));
  });
}
