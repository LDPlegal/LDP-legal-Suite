import { and, eq, isNull } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { users, type User } from "../schema";

export async function listFirmUsers(firmId: string, userId: string): Promise<User[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(users.name);
  });
}

export async function getUserById(
  firmId: string,
  userId: string,
  targetId: string,
): Promise<User | null> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, targetId), isNull(users.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  });
}
