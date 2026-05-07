import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { clients, type Client, type NewClient } from "../schema";

export type ListClientsOptions = {
  search?: string;
  status?: Client["status"];
  type?: Client["type"];
  limit?: number;
  offset?: number;
  orderBy?: "name_asc" | "name_desc" | "created_desc";
};

export async function listClients(
  firmId: string,
  userId: string,
  opts: ListClientsOptions = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(clients.deletedAt)];
    if (opts.status) conds.push(eq(clients.status, opts.status));
    if (opts.type) conds.push(eq(clients.type, opts.type));
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      const search = or(
        ilike(clients.displayName, term),
        ilike(clients.legalName, term),
        ilike(clients.taxId, term),
        ilike(clients.email, term),
      );
      if (search) conds.push(search);
    }

    const order =
      opts.orderBy === "name_desc"
        ? desc(clients.displayName)
        : opts.orderBy === "created_desc"
          ? desc(clients.createdAt)
          : asc(clients.displayName);

    const [rows, totalRow] = await Promise.all([
      tx
        .select()
        .from(clients)
        .where(and(...conds))
        .orderBy(order)
        .limit(limit)
        .offset(offset),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(clients)
        .where(and(...conds)),
    ]);

    return { rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });
}

export async function getClientById(
  firmId: string,
  userId: string,
  clientId: string,
): Promise<Client | null> {
  return withFirm(firmId, userId, async (tx) => {
    const rows = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function createClient(
  firmId: string,
  userId: string,
  data: Omit<NewClient, "firmId" | "createdBy" | "id" | "createdAt" | "updatedAt" | "deletedAt">,
): Promise<Client> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(clients)
      .values({ ...data, firmId, createdBy: userId })
      .returning();
    if (!row) throw new Error("createClient: insert returned no row");
    return row;
  });
}

export async function updateClient(
  firmId: string,
  userId: string,
  clientId: string,
  data: Partial<Omit<NewClient, "firmId" | "id" | "createdAt">>,
): Promise<Client | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(clients)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
      .returning();
    return row ?? null;
  });
}

export async function softDeleteClient(
  firmId: string,
  userId: string,
  clientId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(clients)
      .set({ deletedAt: new Date() })
      .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
      .returning({ id: clients.id });
    return !!row;
  });
}
