// GET /api/documentos/<id>/download
// Streams a document's bytes back to the user with the original filename and
// mime type. RLS-scoped: a user that can't see the document's case won't be
// able to fetch it via direct URL — getDocumentById returns null.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDocumentById } from "@/lib/db/queries/documents";
import { getStorage } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Portal-cliente users have a dedicated endpoint at
  // /api/portal/documentos/[id]/download with shared+client guards. Block
  // them here so they can't bypass the shared_with_client filter by
  // hitting the staff endpoint.
  if (user.role === "client") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const doc = await getDocumentById(user.firmId, user.userId, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const storage = getStorage();
  let bytes: Uint8Array;
  try {
    bytes = await storage.get(doc.storageKey);
  } catch (err) {
    // Distinguir error de "archivo no existe en storage" (caso común si el
    // STORAGE_DRIVER=local está corriendo en Vercel — el filesystem se
    // resetea entre deploys y entre lambdas) de un error de S3/red real.
    // En cualquier caso, devolvemos JSON 500 con detalle para que la UI
    // no muestre la página opaca de "Esta página no funciona — HTTP 500".
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[documentos/download] storage.get failed for storageKey=${doc.storageKey} (doc ${doc.id}):`,
      msg,
    );
    return NextResponse.json(
      {
        error: "storage_unavailable",
        detail:
          "El archivo no se pudo leer del almacenamiento. " +
          "Si estás en producción y STORAGE_DRIVER=local, los archivos no persisten en Vercel — " +
          "configurá STORAGE_DRIVER=s3 con credenciales R2/S3.",
        storageKey: doc.storageKey,
        underlyingError: msg.slice(0, 280),
      },
      { status: 500 },
    );
  }

  // Encode filename for Content-Disposition (RFC 5987) so accents / spaces don't break.
  const filename = encodeURIComponent(doc.name);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Content-Length": String(doc.sizeBytes),
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
