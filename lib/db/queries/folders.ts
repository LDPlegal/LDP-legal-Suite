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

/**
 * Soft-delete una carpeta + sus descendientes.
 *
 * `deleteDocuments`:
 *   - false (default): los documentos que vivían en esas carpetas vuelven a
 *     la raíz (folder_id = NULL). Se preservan, el user puede re-organizar.
 *   - true: los documentos también se soft-deletean (deleted_at = now()).
 *     Quedan recuperables desde papelera (Fase futura), no se hard-borra.
 */
export async function softDeleteFolder(
  firmId: string,
  userId: string,
  folderId: string,
  options: { deleteDocuments?: boolean } = {},
): Promise<boolean> {
  const deleteDocuments = options.deleteDocuments === true;
  return withFirm(firmId, userId, async (tx) => {
    // PASO 1: marcar el folder y todos sus descendientes como soft-deleted.
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

    // PASO 2: tratar los documentos según opción.
    //
    // BUG anterior: usaba `WHERE path LIKE '%' OR parent_folder_id = …`
    // donde `LIKE '%'` matchea TODO. Eso nulleaba folder_id de TODOS los
    // docs del firm — catastrófico.
    //
    // Fix: mismo CTE del paso 1 (sin filtrar deleted_at — los folders
    // recién marcados aún están en la tabla, los encontramos igual).
    if (deleteDocuments) {
      await tx.execute(sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM folders WHERE id = ${folderId}
          UNION ALL
          SELECT f.id
          FROM folders f
          INNER JOIN descendants d ON f.parent_folder_id = d.id
        )
        UPDATE documents
        SET deleted_at = now(), updated_at = now()
        WHERE folder_id IN (SELECT id FROM descendants)
          AND deleted_at IS NULL;
      `);
    } else {
      await tx.execute(sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM folders WHERE id = ${folderId}
          UNION ALL
          SELECT f.id
          FROM folders f
          INNER JOIN descendants d ON f.parent_folder_id = d.id
        )
        UPDATE documents
        SET folder_id = NULL, updated_at = now()
        WHERE folder_id IN (SELECT id FROM descendants);
      `);
    }
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
/**
 * Devuelve TODAS las carpetas activas del firm, por scope (case/client/firm).
 * Útil para el picker de "Mover a..." donde el user elige destino.
 */
export async function listAllFoldersInScope(
  firmId: string,
  userId: string,
  scope: FolderScope,
): Promise<Folder[]> {
  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(folders.deletedAt)];
    if (scope.kind === "firm") {
      conds.push(isNull(folders.caseId), isNull(folders.clientId));
    } else if (scope.kind === "case") {
      conds.push(eq(folders.caseId, scope.caseId));
    } else {
      conds.push(eq(folders.clientId, scope.clientId));
    }
    return tx
      .select()
      .from(folders)
      .where(and(...conds))
      .orderBy(asc(folders.path), asc(folders.name));
  });
}

/**
 * Cascada: setea `shared_with_client` para TODOS los docs en una carpeta
 * y sus subcarpetas. Reqs:
 *   - El doc tiene que estar en un caso (sharedWithClient solo aplica
 *     cuando el caso tiene client_id; portal filtra por client_id).
 *   - Docs sin case_id quedan exentos (no aparecen en portal igual).
 *
 * Devuelve cuántos docs cambiaron.
 */
export async function setFolderSharedWithClient(
  firmId: string,
  userId: string,
  folderId: string,
  shared: boolean,
): Promise<{ updated: number }> {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx.execute(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM folders WHERE id = ${folderId} AND deleted_at IS NULL
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN descendants d ON f.parent_folder_id = d.id
        WHERE f.deleted_at IS NULL
      )
      UPDATE documents
      SET shared_with_client = ${shared}, updated_at = now()
      WHERE folder_id IN (SELECT id FROM descendants)
        AND case_id IS NOT NULL
        AND deleted_at IS NULL
        AND shared_with_client IS DISTINCT FROM ${shared}
      RETURNING id;
    `);
    return { updated: result.rows.length };
  });
}

/**
 * Mueve una carpeta a otro padre. newParentFolderId = null → raíz del scope.
 * Recalcula path materializada de la carpeta y TODOS sus descendientes.
 * Valida no-cycle: no se puede mover una carpeta dentro de su propio subárbol.
 */
export async function moveFolder(
  firmId: string,
  userId: string,
  folderId: string,
  newParentFolderId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  return withFirm(firmId, userId, async (tx) => {
    if (folderId === newParentFolderId) {
      return { ok: false, error: "No se puede mover una carpeta dentro de sí misma." };
    }

    // Cargar la carpeta a mover.
    const [folder] = await tx
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
      .limit(1);
    if (!folder) return { ok: false, error: "Carpeta no encontrada." };

    // Validar no-cycle: si newParentFolderId es descendiente de folderId,
    // estaríamos creando un ciclo.
    if (newParentFolderId) {
      const cycle = await tx.execute(sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM folders WHERE id = ${folderId}
          UNION ALL
          SELECT f.id FROM folders f
          INNER JOIN descendants d ON f.parent_folder_id = d.id
        )
        SELECT 1 FROM descendants WHERE id = ${newParentFolderId} LIMIT 1
      `);
      if (cycle.rows.length > 0) {
        return { ok: false, error: "No se puede mover una carpeta dentro de su propio subárbol." };
      }
    }

    // Calcular el nuevo path materializado del folder.
    let newParentPath = "/";
    let newCaseId: string | null = null;
    let newClientId: string | null = null;
    if (newParentFolderId) {
      const [parent] = await tx
        .select()
        .from(folders)
        .where(and(eq(folders.id, newParentFolderId), isNull(folders.deletedAt)))
        .limit(1);
      if (!parent) return { ok: false, error: "Carpeta destino no existe." };
      newParentPath = parent.path === "/" ? `/${parent.name}` : `${parent.path}/${parent.name}`;
      newCaseId = parent.caseId;
      newClientId = parent.clientId;
    } else {
      // Mover a raíz: heredamos el scope original del folder.
      newCaseId = folder.caseId;
      newClientId = folder.clientId;
    }

    // Update del folder principal.
    await tx
      .update(folders)
      .set({
        parentFolderId: newParentFolderId,
        path: newParentPath,
        caseId: newCaseId,
        clientId: newClientId,
        updatedAt: new Date(),
      })
      .where(eq(folders.id, folderId));

    // Recalcular path de los descendientes. Necesitamos hacerlo en SQL
    // recursivo para no traer todo a JS. Truco: calculamos el path nuevo
    // de cada descendiente como replace(path antiguo, prefijo viejo del
    // folder movido, prefijo nuevo).
    const oldPrefix =
      folder.path === "/" ? `/${folder.name}` : `${folder.path}/${folder.name}`;
    const newPrefix =
      newParentPath === "/" ? `/${folder.name}` : `${newParentPath}/${folder.name}`;

    await tx.execute(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM folders WHERE parent_folder_id = ${folderId}
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN descendants d ON f.parent_folder_id = d.id
      )
      UPDATE folders
      SET
        path = ${newPrefix} || substring(path FROM length(${oldPrefix}) + 1),
        case_id = ${newCaseId},
        client_id = ${newClientId},
        updated_at = now()
      WHERE id IN (SELECT id FROM descendants);
    `);

    return { ok: true };
  });
}

/**
 * Lista carpetas soft-deleted (papelera). Filtra por firm vía withFirm.
 * Las RLS policies del folders ya filtran por firm, así que basta con
 * deleted_at IS NOT NULL.
 */
export async function listDeletedFolders(
  firmId: string,
  userId: string,
): Promise<Folder[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(folders)
      .where(sql`${folders.deletedAt} IS NOT NULL`)
      .orderBy(desc(folders.deletedAt));
  });
}

/**
 * Restaura una carpeta soft-deleted. NO restaura los docs que estaban
 * adentro — si el user quiere los docs también, tiene que restaurarlos
 * uno por uno desde la papelera.
 */
export async function restoreFolder(
  firmId: string,
  userId: string,
  folderId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(folders)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(folders.id, folderId), sql`${folders.deletedAt} IS NOT NULL`))
      .returning({ id: folders.id });
    return !!row;
  });
}

/**
 * Hard delete: elimina la carpeta de la DB definitivamente. Los documentos
 * con folder_id apuntando a esta carpeta quedan con folder_id = NULL gracias
 * al ON DELETE SET NULL del FK. Subcarpetas hijas también se hard-deletan
 * gracias al ON DELETE CASCADE del self-FK.
 */
export async function hardDeleteFolder(
  firmId: string,
  userId: string,
  folderId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const result = await tx
      .delete(folders)
      .where(and(eq(folders.id, folderId), sql`${folders.deletedAt} IS NOT NULL`))
      .returning({ id: folders.id });
    return result.length > 0;
  });
}

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
