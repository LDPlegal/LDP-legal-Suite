import { and, eq, isNull, ne } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { users, type User } from "../schema";

// Returns staff users only (admin/partner/lawyer/paralegal/tester) — never
// portal clients. Use this for every "select assignee / lead lawyer /
// timekeeper" UI in the app. listing portal clients is a separate function
// (`listPortalUsersForClient`) so the contexts don't get confused.
export async function listFirmUsers(firmId: string, userId: string): Promise<User[]> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(users)
      .where(and(isNull(users.deletedAt), ne(users.role, "client")))
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

// Portal users (role='client') attached to a specific client. Used in the
// /clientes/[id] admin page to show who has access to the portal for that
// client and to manage invitations.
export async function listPortalUsersForClient(
  firmId: string,
  userId: string,
  clientId: string,
): Promise<Array<Pick<User, "id" | "name" | "email" | "status" | "lastLoginAt" | "createdAt">>> {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "client"),
          eq(users.clientId, clientId),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(users.name);
  });
}
