// GET /api/marketing/photos/[id]/file
//
// Sirve el binario de una foto subida al firm. Valida que el usuario
// pertenezca al firm dueño. Sin auth pública, los URLs no son
// adivinables (UUID) pero igual chequeamos sesión por defensa en
// profundidad.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb } from "@/lib/db/admin";
import { marketingPhotos } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [row] = await adminDb
    .select({
      storageKey: marketingPhotos.storageKey,
      mimeType: marketingPhotos.mimeType,
      firmId: marketingPhotos.firmId,
    })
    .from(marketingPhotos)
    .where(
      and(
        eq(marketingPhotos.id, id),
        isNull(marketingPhotos.deletedAt),
      ),
    )
    .limit(1);

  if (!row || row.firmId !== user.firmId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const bytes = await getStorage().get(row.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": row.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
