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

export async function updateFirm(
  firmId: string,
  userId: string,
  patch: {
    name?: string;
    rnc?: string | null;
    address?: string | null;
    timezone?: string;
    defaultCurrency?: string;
  },
) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(firms)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(firms.id, firmId), isNull(firms.deletedAt)))
      .returning();
    return row ?? null;
  });
}
