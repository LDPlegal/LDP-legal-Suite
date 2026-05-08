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
  const { id } = await params;
  const doc = await getDocumentById(user.firmId, user.userId, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const storage = getStorage();
  const bytes = await storage.get(doc.storageKey);
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
