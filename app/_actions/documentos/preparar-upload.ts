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

const ScopeSchema = z.union([
  z.object({ kind: z.literal("case"), caseId: z.string().uuid() }),
  z.object({ kind: z.literal("client"), clientId: z.string().uuid() }),
  z.object({ kind: z.literal("firm") }),
]);

const InputSchema = z.object({
  scope: ScopeSchema,
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024), // 500 MB hard cap
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
  const user = await requireUser();

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Metadatos inválidos." };
  }

  const { scope, filename, contentType, sizeBytes } = parsed.data;

  // entityId para el layout del key:
  //   case → caseId, client → clientId, firm → "general"
  // Eso replica el comportamiento previo de upload.ts / upload-global.ts.
  const entityId =
    scope.kind === "case"
      ? scope.caseId
      : scope.kind === "client"
        ? scope.clientId
        : "general";

  // Wrap getStorage() + presignedPut() en el mismo try/catch — el
  // constructor de S3Storage tira si faltan env vars (S3_BUCKET, etc.) y
  // sin este wrapper la excepción se propaga al React tree como
  // "server-side exception" (en vez de mostrarse como toast claro).
  try {
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
    console.error("[prepararUploadAction] storage error:", msg);
    return {
      ok: false,
      error: `No se pudo generar URL de subida: ${msg}`,
    };
  }
}

// Tope visible — usado por el cliente para validar antes de pedir presigned.
// Se mantiene en sync con el .max() del schema arriba.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
