// GET /api/portal/documentos/<id>/download
//
// Portal-only document download endpoint. Distinct from
// /api/documentos/<id>/download so the portal user model is checked
// explicitly: only role='client' users with a non-null clientId may use
// this route, and only for documents that (a) belong to one of their cases
// and (b) have shared_with_client=true.

import { NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/auth/session";
import { getPortalDocumentForDownload } from "@/lib/db/queries/portal";
import { getStorage } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requirePortalUser();
  const { id } = await params;
  const doc = await getPortalDocumentForDownload(
    user.firmId,
    user.userId,
    user.clientId,
    id,
  );
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const storage = getStorage();
  const bytes = await storage.get(doc.storageKey);
  const filename = encodeURIComponent(doc.name);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
