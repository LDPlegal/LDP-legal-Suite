"use server";

// Sube una carpeta del filesystem del usuario preservando su estructura
// interna en la app.
//
// Cómo funciona en el browser:
//   <input type="file" webkitdirectory multiple>
// El user pickea una carpeta — el browser entrega un FileList donde cada
// File tiene `webkitRelativePath` con el path interno
// ("MiCarpeta/sub1/archivo.pdf").
//
// Acá:
//   1. Recolectamos todos los files del FormData.
//   2. Calculamos el set de carpetas únicas a crear (ordenadas por profundidad
//      para que el padre exista antes que el hijo).
//   3. Para cada carpeta, hacemos findChildFolderByName + createFolder si
//      no existe (idempotente — re-subir la misma estructura no falla).
//   4. Construimos un mapa pathInZip → folderId.
//   5. Subimos cada archivo con su folder_id resuelto.
//
// Decisiones:
//   - OCR se dispara igual que en upload normal (after()) — pero acá podrían
//     ser DECENAS de archivos. Lo hacemos secuencial para no explotar la
//     memoria del worker tesseract.
//   - Si un archivo falla, el resto continúa — devolvemos un resumen con
//     los exitosos y los fallidos.
//   - Hay un cap de archivos (200) y de tamaño total (500 MB) para no
//     volar la action en una subida descomunal. Mensajes claros.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  createDocument,
  updateDocumentOcr,
} from "@/lib/db/queries/documents";
import {
  createFolder,
  findChildFolderByName,
  type FolderScope,
} from "@/lib/db/queries/folders";
import { getStorage } from "@/lib/storage";
import { getOcr } from "@/lib/ocr";
import {
  detectFileType,
  ensureFilenameExtension,
} from "@/lib/files/detect-type";

const MAX_FILES_PER_UPLOAD = 200;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_PER_FILE_BYTES = 25 * 1024 * 1024; // 25 MB (igual al upload normal)

const ScopeSchema = z.union([
  z.object({ kind: z.literal("firm") }),
  z.object({ kind: z.literal("case"), caseId: z.string().uuid() }),
  z.object({ kind: z.literal("client"), clientId: z.string().uuid() }),
]);

const InputSchema = z.object({
  scope: ScopeSchema,
  /** Carpeta padre dentro de la cual se va a depositar la carpeta subida.
   *  null = en la raíz del scope. */
  parentFolderId: z.string().uuid().nullable(),
});

export type SubirCarpetaState =
  | {
      ok: true;
      foldersCreated: number;
      filesUploaded: number;
      filesFailed: Array<{ name: string; error: string }>;
    }
  | { ok: false; error: string };

export async function subirCarpetaAction(
  formData: FormData,
): Promise<SubirCarpetaState> {
  const user = await requireUser();

  const scopeRaw = formData.get("scope");
  const parentRaw = formData.get("parentFolderId");
  const parsed = InputSchema.safeParse({
    scope: typeof scopeRaw === "string" ? JSON.parse(scopeRaw) : null,
    parentFolderId:
      typeof parentRaw === "string" && parentRaw && parentRaw !== "null"
        ? parentRaw
        : null,
  });
  if (!parsed.success) return { ok: false, error: "Scope inválido." };

  // Reunir entries de archivo. Vienen como repeticiones de "files".
  // Junto con cada archivo, esperamos un "paths" entry (string) con el
  // webkitRelativePath del archivo correspondiente (mismo índice).
  const files: File[] = [];
  const relativePaths: string[] = [];

  for (const [key, value] of formData.entries()) {
    if (key === "files" && value instanceof File) {
      files.push(value);
    } else if (key === "paths" && typeof value === "string") {
      relativePaths.push(value);
    }
  }

  if (files.length === 0) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }
  if (files.length !== relativePaths.length) {
    return {
      ok: false,
      error: `Inconsistencia: ${files.length} archivos vs ${relativePaths.length} paths.`,
    };
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return {
      ok: false,
      error: `Demasiados archivos en una carga (${files.length}). Máximo: ${MAX_FILES_PER_UPLOAD}.`,
    };
  }

  let totalBytes = 0;
  for (const f of files) {
    if (f.size === 0) {
      return { ok: false, error: `El archivo "${f.name}" está vacío.` };
    }
    if (f.size > MAX_PER_FILE_BYTES) {
      return {
        ok: false,
        error: `"${f.name}" pesa ${(f.size / 1024 / 1024).toFixed(1)} MB. Máximo por archivo: 25 MB.`,
      };
    }
    totalBytes += f.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Total ${(totalBytes / 1024 / 1024).toFixed(0)} MB excede el máximo (${MAX_TOTAL_BYTES / 1024 / 1024} MB).`,
    };
  }

  const { scope, parentFolderId } = parsed.data;
  const scopeTyped: FolderScope = scope;

  // 1. Calcular set de directorios a crear (ordenados por profundidad).
  // Cada path es "Carpeta/sub/archivo.pdf" — el directorio es todo menos
  // el último segmento. El root del upload se considera la primera parte.
  const dirSet = new Set<string>();
  for (const p of relativePaths) {
    const segments = p.split("/").filter(Boolean);
    if (segments.length <= 1) continue; // archivo en la raíz, sin carpeta
    // Acumulamos los prefijos: "A", "A/B", "A/B/C"
    for (let i = 1; i < segments.length; i++) {
      dirSet.add(segments.slice(0, i).join("/"));
    }
  }
  const dirList = [...dirSet].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    return da !== db ? da - db : a.localeCompare(b);
  });

  // 2. Resolver / crear cada carpeta. Mantenemos pathToId.
  const pathToId = new Map<string, string>(); // "A/B" → uuid
  // El padre lógico de un path "A/B" es "A". Si está vacío, el padre es el
  // parentFolderId pasado a la action.
  let foldersCreated = 0;
  for (const dirPath of dirList) {
    const segments = dirPath.split("/");
    const name = segments[segments.length - 1] ?? "";
    if (!name) continue;
    const parentDirPath = segments.slice(0, -1).join("/");
    const parentId =
      parentDirPath === ""
        ? parentFolderId
        : (pathToId.get(parentDirPath) ?? null);

    // ¿Existe ya?
    const existing = await findChildFolderByName(
      user.firmId,
      user.userId,
      parentId,
      scopeTyped,
      name,
    );
    if (existing) {
      pathToId.set(dirPath, existing.id);
      continue;
    }

    try {
      const created = await createFolder(user.firmId, user.userId, {
        name,
        parentFolderId: parentId,
        scope: scopeTyped,
      });
      pathToId.set(dirPath, created.id);
      foldersCreated += 1;
    } catch (err) {
      // Si dos requests concurrentes lo crean al tiempo, el unique constraint
      // dispara — volvemos a leer.
      const fallback = await findChildFolderByName(
        user.firmId,
        user.userId,
        parentId,
        scopeTyped,
        name,
      );
      if (fallback) {
        pathToId.set(dirPath, fallback.id);
      } else {
        throw err;
      }
    }
  }

  // 3. Subir cada archivo a su carpeta target.
  const storage = getStorage();
  const ocr = await getOcr();
  let filesUploaded = 0;
  const filesFailed: Array<{ name: string; error: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const relPath = relativePaths[i] ?? file.name;
    const segments = relPath.split("/").filter(Boolean);
    const dirPath = segments.slice(0, -1).join("/");
    const targetFolderId =
      dirPath === "" ? parentFolderId : (pathToId.get(dirPath) ?? parentFolderId);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const detected = await detectFileType(bytes, file.type || null, file.name);
      const realMime = detected.mimeType;
      const finalFilename = ensureFilenameExtension(file.name, detected);

      const entityId =
        scope.kind === "case"
          ? scope.caseId
          : scope.kind === "client"
            ? scope.clientId
            : user.firmId;

      const key = storage.buildKey({
        firmId: user.firmId,
        scope: "documents",
        entityId,
        filename: finalFilename,
      });
      await storage.put(key, bytes, realMime);

      const newDoc = await createDocument(user.firmId, user.userId, {
        caseId: scope.kind === "case" ? scope.caseId : null,
        clientId: scope.kind === "client" ? scope.clientId : null,
        folderId: targetFolderId,
        name: finalFilename,
        mimeType: realMime,
        sizeBytes: file.size,
        storageKey: key,
        tags: [],
        ocrStatus: "processing",
        ocrText: null,
        version: 1,
        parentDocumentId: null,
      });

      // OCR fire-and-forget secuencial por archivo.
      const userId = user.userId;
      const firmId = user.firmId;
      const docId = newDoc.id;
      const docMime = newDoc.mimeType;
      const docName = newDoc.name;
      const docSize = newDoc.sizeBytes;
      after(async () => {
        try {
          const result = await ocr.recognize({
            mimeType: docMime,
            bytes,
            sizeBytes: docSize,
            filename: docName,
            firmId,
            userId,
          });
          if (result.status === "done") {
            await updateDocumentOcr(firmId, userId, docId, {
              ocrStatus: "done",
              ocrText: result.text,
            });
          } else if (result.status === "skipped") {
            await updateDocumentOcr(firmId, userId, docId, {
              ocrStatus: "skipped",
            });
          } else {
            await updateDocumentOcr(firmId, userId, docId, {
              ocrStatus: "failed",
            });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[OCR] doc ${docId} (folder upload) uncaught:`, msg);
          await updateDocumentOcr(firmId, userId, docId, { ocrStatus: "failed" });
        }
      });

      filesUploaded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      filesFailed.push({ name: file.name, error: msg });
    }
  }

  if (scope.kind === "firm") revalidatePath("/documentos");
  else if (scope.kind === "case") revalidatePath(`/casos/${scope.caseId}`);
  else revalidatePath(`/clientes/${scope.clientId}`);

  return {
    ok: true,
    foldersCreated,
    filesUploaded,
    filesFailed,
  };
}
