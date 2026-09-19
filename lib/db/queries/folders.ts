// Queries para el sistema de carpetas.
//
// Todas las funciones pasan por `withFirm` para activar RLS por firm + user
// (regla del proyecto, ver DECISIONS 9.1).
//
// Cuando movemos una carpeta o creamos una sub-carpeta, recalculamos el `path`
// materializado (formato "/Demandas/2026/Caso-X") en SQL, útil para
// breadcrumbs sin recursión y para queries de tipo "todo lo que cuelgue de
// /Demandas". El recálculo recursivo en update se hace en JS (Drizzle no
// expone CTE recursivas de forma trivial); el árbol de carpetas en una firma
// legal raramente excede unos miles de nodos así que es aceptable.

import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { documents, folders, type Folder, type NewFolder } from "../schema";

export type FolderScope =
  | { kind: "firm" } // raíz global de la firma
  | { kind: "case"; caseId: string }
  | { kind: "client"; clientId: string };

// Nombres de las carpetas raíz especiales (migración 0035). La carpeta
// personal de cada usuario y la biblioteca compartida de la firma.
export const PERSONAL_ROOT_NAME = "Mi carpeta";
export const LIBRARY_ROOT_NAME = "Biblioteca";

/**
 * Devuelve (creándola si hace falta) la carpeta PERSONAL raíz del usuario.
 * Idempotente y a prueba de carreras: el índice único parcial
 * folders_personal_root_unique garantiza una sola por usuario; si dos
 * requests la crean a la vez, ON CONFLICT DO NOTHING evita el error y luego
 * releemos. La migración 0035 ya la sembró para los usuarios existentes; esto
 * cubre a los nuevos sin tocar el flujo de signup.
 */
export async function ensurePersonalRootFolder(
  firmId: string,
  userId: string,
): Promise<Folder> {
  return withFirm(firmId, userId, async (tx) => {
    const find = async (): Promise<Folder | null> => {
      const rows = await tx
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.firmId, firmId),
            eq(folders.ownerUserId, userId),
            isNull(folders.parentFolderId),
            isNull(folders.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    };
    const existing = await find();
    if (existing) return existing;
    await tx
      .insert(folders)
      .values({
        firmId,
        ownerUserId: userId,
        name: PERSONAL_ROOT_NAME,
        path: "/",
        createdBy: userId,
      })
      .onConflictDoNothing({
        target: [folders.firmId, folders.ownerUserId],
        where: sql`owner_user_id IS NOT NULL AND parent_folder_id IS NULL AND deleted_at IS NULL`,
      });
    const after = await find();
    if (!after) throw new Error("No se pudo asegurar la carpeta personal.");
    return after;
  });
}

/**
 * Devuelve (creándola si hace falta) la BIBLIOTECA compartida de la firma
 * (carpeta raíz firm-wide, owner NULL → todos la ven). Idempotente vía el
 * índice folders_firmwide_root_unique.
 */
export async function ensureLibraryRootFolder(
  firmId: string,
  userId: string,
): Promise<Folder> {
  return withFirm(firmId, userId, async (tx) => {
    const find = async (): Promise<Folder | null> => {
      const rows = await tx
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.firmId, firmId),
            isNull(folders.ownerUserId),
            isNull(folders.parentFolderId),
            isNull(folders.caseId),
            isNull(folders.clientId),
            eq(folders.name, LIBRARY_ROOT_NAME),
            isNull(folders.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    };
    const existing = await find();
    if (existing) return existing;
    await tx
      .insert(folders)
      .values({
        firmId,
        ownerUserId: null,
        name: LIBRARY_ROOT_NAME,
        path: "/",
        createdBy: userId,
      })
      .onConflictDoNothing({
        target: [folders.firmId, folders.name],
        where: sql`owner_user_id IS NULL AND parent_folder_id IS NULL AND case_id IS NULL AND client_id IS NULL AND deleted_at IS NULL`,
      });
    const after = await find();
    if (!after) throw new Error("No se pudo asegurar la biblioteca.");
    return after;
  });
}

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
    // Hard cap defensivo, el árbol no debería pasar de ~50 niveles.
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
    // Dueño de la carpeta (migración 0035). Se HEREDA del padre: si el padre
    // es una carpeta personal (owner set), la subcarpeta también es personal
    // del mismo dueño. Crear en la raíz del scope = compartida (owner null).
    // Invariante: el owner de una carpeta = el owner de su raíz de espacio.
    let ownerUserId: string | null = null;

    if (input.parentFolderId) {
      const parentRows = await tx
        .select()
        .from(folders)
        .where(and(eq(folders.id, input.parentFolderId), isNull(folders.deletedAt)))
        .limit(1);
      const parent = parentRows[0];
      if (!parent) throw new Error("Carpeta padre no encontrada.");
      // Path heredado del parent, concatenamos su path + nombre del parent
      // (path del parent es el camino HASTA el parent, no incluyéndolo).
      parentPath = parent.path === "/" ? `/${parent.name}` : `${parent.path}/${parent.name}`;
      caseId = parent.caseId;
      clientId = parent.clientId;
      ownerUserId = parent.ownerUserId;
    } else {
      // En la raíz del scope, derivamos caseId/clientId del scope.
      if (input.scope.kind === "case") caseId = input.scope.caseId;
      else if (input.scope.kind === "client") clientId = input.scope.clientId;
    }

    const values: NewFolder = {
      firmId,
      caseId,
      clientId,
      ownerUserId,
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
 * Renombra una carpeta. Su propio `path` NO cambia (path = ruta hasta el
 * padre, sin incluir el nombre propio), pero los descendientes SÍ porque
 * su path incluye el nombre de esta carpeta. Recalculamos en SQL con un
 * substring replace, igual que moveFolder.
 *
 * Devuelve { ok, error? }. El error típico es colisión de nombre con un
 * hermano (unique index folders_unique_name_per_parent).
 */
export async function renameFolder(
  firmId: string,
  userId: string,
  folderId: string,
  newName: string,
): Promise<{ ok: boolean; error?: string }> {
  return withFirm(firmId, userId, async (tx) => {
    const [folder] = await tx
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
      .limit(1);
    if (!folder) return { ok: false, error: "Carpeta no encontrada." };
    if (folder.name === newName) return { ok: true }; // no-op

    // Prefijos viejo/nuevo para reescribir los paths de los descendientes.
    // El path de un hijo directo es `folder.path + "/" + folder.name`.
    const oldPrefix =
      folder.path === "/" ? `/${folder.name}` : `${folder.path}/${folder.name}`;
    const newPrefix =
      folder.path === "/" ? `/${newName}` : `${folder.path}/${newName}`;

    try {
      // 1) Renombrar la carpeta.
      await tx
        .update(folders)
        .set({ name: newName, updatedAt: new Date() })
        .where(eq(folders.id, folderId));

      // 2) Reescribir el path de TODO el subárbol.
      await tx.execute(sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM folders WHERE parent_folder_id = ${folderId}
          UNION ALL
          SELECT f.id FROM folders f
          INNER JOIN descendants d ON f.parent_folder_id = d.id
        )
        UPDATE folders
        SET path = ${newPrefix} || substring(path FROM length(${oldPrefix}) + 1),
            updated_at = now()
        WHERE id IN (SELECT id FROM descendants);
      `);

      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("folders_unique_name_per_parent")) {
        return { ok: false, error: "Ya existe una carpeta con ese nombre en este nivel." };
      }
      return { ok: false, error: "No se pudo renombrar la carpeta." };
    }
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
    // Cargar el folder para saber a dónde reubicar sus documentos si NO se
    // borran: van a su carpeta PADRE, no a la raíz de la firma. Esto mantiene
    // el espacio (una carpeta personal borrada deja sus docs en el padre, que
    // sigue siendo personal → no se filtran a la firma). Para una carpeta raíz
    // (parent null) el destino es null = raíz del scope (comportamiento previo).
    const [target] = await tx
      .select({ parentFolderId: folders.parentFolderId })
      .from(folders)
      .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
      .limit(1);
    if (!target) return false;
    const reparentTo = target.parentFolderId;

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
    // docs del firm, catastrófico.
    //
    // Fix: mismo CTE del paso 1 (sin filtrar deleted_at, los folders
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
      // Reubicar los documentos en la carpeta padre (reparentTo). Si la
      // carpeta borrada era raíz, reparentTo = NULL = raíz del scope. Nunca
      // "sube" un documento personal a la raíz compartida de la firma salvo
      // que su carpeta ya fuera raíz.
      await tx.execute(sql`
        WITH RECURSIVE descendants AS (
          SELECT id FROM folders WHERE id = ${folderId}
          UNION ALL
          SELECT f.id
          FROM folders f
          INNER JOIN descendants d ON f.parent_folder_id = d.id
        )
        UPDATE documents
        SET folder_id = ${reparentTo}, updated_at = now()
        WHERE folder_id IN (SELECT id FROM descendants);
      `);
    }
    return true;
  });
}

/**
 * Mueve un documento a una carpeta. folder=null lo deja en la raíz.
 *
 * Regla (migración 0035): un documento que pertenece a un CASO no puede
 * moverse a una carpeta PERSONAL, se detacharía del equipo del caso y
 * quedaría oculto para el resto. Si alguien quiere una versión privada, que
 * suba una copia a su carpeta personal. Documentos sueltos (sin caso) sí
 * pueden ir a carpetas personales.
 */
export async function moveDocumentToFolder(
  firmId: string,
  userId: string,
  documentId: string,
  folderId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  return withFirm(firmId, userId, async (tx) => {
    const [doc] = await tx
      .select({ id: documents.id, caseId: documents.caseId, folderId: documents.folderId })
      .from(documents)
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .limit(1);
    if (!doc) return { ok: false, error: "Documento no encontrado." };

    if (folderId) {
      const [dest] = await tx
        .select({ ownerUserId: folders.ownerUserId })
        .from(folders)
        .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
        .limit(1);
      if (!dest) return { ok: false, error: "La carpeta destino no existe." };

      if (dest.ownerUserId !== null) {
        let sourceIsPersonal = false;
        if (doc.folderId) {
          const [src] = await tx
            .select({ ownerUserId: folders.ownerUserId })
            .from(folders)
            .where(eq(folders.id, doc.folderId))
            .limit(1);
          sourceIsPersonal = src?.ownerUserId === dest.ownerUserId;
        }
        if (!sourceIsPersonal) {
          return {
            ok: false,
            error: doc.caseId
              ? "No podés mover un documento de un caso a una carpeta personal. Si necesitás una versión privada, subí una copia."
              : "No podés mover un documento compartido a una carpeta personal. Subí una copia nueva en su lugar.",
          };
        }
      }
    }

    const [row] = await tx
      .update(documents)
      .set({ folderId, updatedAt: new Date() })
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
      .returning({ id: documents.id });
    return row ? { ok: true } : { ok: false, error: "Documento no encontrado." };
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

    // No se puede mover la carpeta personal raíz (owner set + sin padre): es la
    // base del espacio personal del usuario. Moverla la desanclaría y la app
    // recrearía otra vacía.
    if (folder.parentFolderId === null && folder.ownerUserId !== null) {
      return { ok: false, error: "No podés mover tu carpeta personal." };
    }

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
    // Dueño del espacio destino: el del parent, o null si va a la raíz.
    let destOwnerUserId: string | null = null;
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
      destOwnerUserId = parent.ownerUserId;
    } else {
      // Mover a raíz: heredamos el scope original del folder.
      newCaseId = folder.caseId;
      newClientId = folder.clientId;
    }

    // No permitir mover carpetas ENTRE espacios (personal ↔ compartido): el
    // owner de una carpeta debe coincidir con el de su raíz de espacio, y un
    // cruce expondría documentos personales al equipo (o escondería docs
    // compartidos dentro de un espacio personal). Ambos extremos deben tener
    // el mismo dueño (ambos null, o ambos el mismo usuario).
    if ((folder.ownerUserId ?? null) !== (destOwnerUserId ?? null)) {
      return {
        ok: false,
        error: "No podés mover carpetas entre tu espacio personal y las carpetas compartidas.",
      };
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
 * adentro, si el user quiere los docs también, tiene que restaurarlos
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
    // Visibilidad interna (Fase 13): docs de equipo + mis privados.
    const conds = [
      isNull(documents.deletedAt),
      or(eq(documents.visibility, "case"), eq(documents.uploadedBy, userId)),
    ];
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
        visibility: documents.visibility,
        uploadedById: documents.uploadedBy,
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
