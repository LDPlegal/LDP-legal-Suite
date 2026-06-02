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
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    console.error(
      `[documentos/download] storage.get failed for storageKey=${doc.storageKey} (doc ${doc.id}):`,
      msg,
    );

    // Caso #1: archivo no existe en el bucket. Esto pasa con docs de seed
    // (storageKey empieza con "seed/") cuyo metadata está en la DB pero los
    // bytes nunca se subieron — porque seed solo crea filas, no archivos.
    // También pasa si alguien borró el objeto manual desde R2 console.
    if (
      lower.includes("nosuchkey") ||
      lower.includes("specified key does not exist") ||
      lower.includes("not found")
    ) {
      const isSeedDoc = doc.storageKey.startsWith("seed/");
      return NextResponse.json(
        {
          error: "file_missing_in_storage",
          detail: isSeedDoc
            ? "Este documento es de los datos de prueba (seed). Solo tiene metadata en la DB, no tiene archivo físico. Borralo y subí uno real para probar el download."
            : "El archivo existe en la base de datos pero no en el bucket de storage. Puede haber sido borrado manualmente desde R2 o haber fallado el upload original.",
          storageKey: doc.storageKey,
          isSeedDoc,
        },
        { status: 404 },
      );
    }

    // Caso #2: error real de storage (credenciales mal, bucket inaccesible,
    // red caída, etc.). 500 con detalle.
    return NextResponse.json(
      {
        error: "storage_unavailable",
        detail:
          "No se pudo leer el archivo del bucket. " +
          "Verificá que las env vars S3_* estén bien configuradas en Vercel.",
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
      // Permitir explícitamente embedding desde la misma app (iframe del
      // preview drawer, etc.). Sin esto algunos browsers/servers añaden
      // X-Frame-Options DENY por default y el iframe muestra "rechazó la
      // conexión".
      "X-Frame-Options": "SAMEORIGIN",
      // Content-Security-Policy: solo permitir que LA APP misma haga frame
      // de este recurso. Más estricto que XFO. frame-ancestors 'self' es
      // lo equivalente moderno y robusto.
      "Content-Security-Policy": "frame-ancestors 'self'",
      // Permitir que <img> del mismo origen consuma este recurso (algunos
      // setups bloquean por CORP para archivos servidos por API).
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
