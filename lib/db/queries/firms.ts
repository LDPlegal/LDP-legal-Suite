import { eq, isNull, and } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { firms } from "../schema";

export async function getCurrentFirm(firmId: string, userId: string) {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(firms)
      .where(and(eq(firms.id, firmId), isNull(firms.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  });
}
