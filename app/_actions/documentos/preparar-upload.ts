"use server";

// Paso 1 del flow de direct upload (Fase 7).
//
// Recibe metadatos del archivo (NO los bytes) y devuelve un presigned URL
// para que el browser haga PUT directo al storage (R2/S3 en prod, endpoint
// local en dev). El payload de esta action es kBs — no choca con ningún
// bodySizeLimit.
//
// El client luego hace fetch(uploadUrl, { method: "PUT", body: file, headers }).
// Cuando termina, llama a completarUploadAction con el storageKey devuelto.

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";

const ScopeSchema = z.union([
  z.object({ kind: z.literal("case"), caseId: z.string().uuid() }),
  z.object({ kind: z.literal("client"), clientId: z.string().uuid() }),
  z.object({ kind: z.literal("firm") }),
]);

const InputSchema = z.object({
  scope: ScopeSchema,
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export type PrepararUploadInput = z.infer<typeof InputSchema>;

export type PrepararUploadState =
  | {
      ok: true;
      uploadUrl: string;
      storageKey: string;
      requiredHeaders: Record<string, string>;
      expiresAt: string; // ISO
    }
  | { ok: false; error: string };

export async function prepararUploadAction(
  input: PrepararUploadInput,
): Promise<PrepararUploadState> {
  // Big-net try/catch: requireUser, validación, storage init, presigned —
  // todo dentro. Cualquier throw inesperado (auth expirada, env var
  // faltante, problema de red) termina como `{ ok: false, error }` y se
  // muestra al user como toast, NO como crash de React tree.
  try {
    const user = await requireUser();

    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      console.error("[prepararUpload] validación falló:", parsed.error.message);
      return { ok: false, error: "Metadatos inválidos." };
    }

    const { scope, filename, contentType, sizeBytes } = parsed.data;

    // entityId para el layout del key:
    //   case → caseId, client → clientId, firm → "general"
    const entityId =
      scope.kind === "case"
        ? scope.caseId
        : scope.kind === "client"
          ? scope.clientId
          : "general";

    const storage = getStorage();
    const storageKey = storage.buildKey({
      firmId: user.firmId,
      scope: "documents",
      entityId,
      filename,
    });
    const presigned = await storage.presignedPut(
      storageKey,
      contentType,
      sizeBytes,
    );
    return {
      ok: true,
      uploadUrl: presigned.uploadUrl,
      storageKey,
      requiredHeaders: presigned.requiredHeaders,
      expiresAt: presigned.expiresAt.toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Log estructurado — esto aparece en Vercel Function Logs y ayuda a
    // identificar la causa raíz cuando el toast del cliente no es suficiente.
    console.error("[prepararUploadAction] uncaught:", {
      message: msg,
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5).join(" | ") : undefined,
      driver: process.env.STORAGE_DRIVER ?? "local",
      bucketSet: !!process.env.S3_BUCKET,
      endpointSet: !!process.env.S3_ENDPOINT,
    });
    return {
      ok: false,
      error: `No se pudo preparar el upload: ${msg}`,
    };
  }
}

// Nota: MAX_UPLOAD_BYTES vive ahora en "@/lib/uploads/limits" porque un
// archivo "use server" solo puede exportar funciones async. Importalo
// desde allá en cualquier client component que lo necesite.
