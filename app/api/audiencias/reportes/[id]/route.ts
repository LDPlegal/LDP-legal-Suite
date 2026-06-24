// GET /api/audiencias/reportes/[id] — devuelve el contenido completo (JSON
// tiptap) de un reporte existente, para que el drawer del editor lo cargue
// al abrir. No expone HTML del contenido para evitar XSS si en algún
// momento alguien lo renderizara sin sanitizar; el cliente solo necesita el
// JSON tiptap, que tiptap renderiza de forma segura.

import { NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { withFirm } from "@/lib/db/with-firm";
import { hearingReports } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  const report = await withFirm(user.firmId, user.userId, async (tx) => {
    const [r] = await tx
      .select({
        id: hearingReports.id,
        title: hearingReports.title,
        contentJson: hearingReports.contentJson,
        eventId: hearingReports.eventId,
        caseId: hearingReports.caseId,
        updatedAt: hearingReports.updatedAt,
      })
      .from(hearingReports)
      .where(and(eq(hearingReports.id, id), isNull(hearingReports.deletedAt)))
      .limit(1);
    return r ?? null;
  });
  if (!report) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }
  return NextResponse.json(report);
}
