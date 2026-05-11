import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { withFirm, type Tx } from "../with-firm";
import {
  caseAssignments,
  caseCounters,
  cases,
  clients,
  users,
  type Case,
  type NewCase,
  type NewCaseAssignment,
} from "../schema";

// matter_type → 3-letter prefix for case codes (decided with user, see project memory).
const MATTER_PREFIX: Record<Case["matterType"], string> = {
  civil: "CIV",
  corporate: "COR",
  real_estate: "INM",
  criminal: "PEN",
  labor: "LAB",
  tax: "FIS",
  administrative: "ADM",
  other: "OTR",
};

export type ListCasesOptions = {
  search?: string;
  status?: Case["status"];
  matterType?: Case["matterType"];
  clientId?: string;
  leadLawyerId?: string;
  limit?: number;
  offset?: number;
  orderBy?: "code_desc" | "code_asc" | "opened_desc" | "title_asc";
};

export async function listCases(
  firmId: string,
  userId: string,
  opts: ListCasesOptions = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(cases.deletedAt)];
    if (opts.status) conds.push(eq(cases.status, opts.status));
    if (opts.matterType) conds.push(eq(cases.matterType, opts.matterType));
    if (opts.clientId) conds.push(eq(cases.clientId, opts.clientId));
    if (opts.leadLawyerId) conds.push(eq(cases.leadLawyerId, opts.leadLawyerId));
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      const s = or(
        ilike(cases.code, term),
        ilike(cases.title, term),
        ilike(cases.counterpartyName, term),
      );
      if (s) conds.push(s);
    }

    const order =
      opts.orderBy === "code_asc"
        ? asc(cases.code)
        : opts.orderBy === "opened_desc"
          ? desc(cases.openedAt)
          : opts.orderBy === "title_asc"
            ? asc(cases.title)
            : desc(cases.code);

    const [rows, totalRow] = await Promise.all([
      tx
        .select({
          // Explicit shape so we get client + lead lawyer names without N+1
          id: cases.id,
          code: cases.code,
          title: cases.title,
          status: cases.status,
          matterType: cases.matterType,
          openedAt: cases.openedAt,
          closedAt: cases.closedAt,
          billingMode: cases.billingMode,
          visibility: cases.visibility,
          tags: cases.tags,
          counterpartyName: cases.counterpartyName,
          clientId: cases.clientId,
          clientDisplayName: clients.displayName,
          leadLawyerId: cases.leadLawyerId,
          leadLawyerName: users.name,
        })
        .from(cases)
        .leftJoin(clients, eq(clients.id, cases.clientId))
        .leftJoin(users, eq(users.id, cases.leadLawyerId))
        .where(and(...conds))
        .orderBy(order)
        .limit(limit)
        .offset(offset),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cases)
        .where(and(...conds)),
    ]);

    return { rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });
}

export async function getCaseById(
  firmId: string,
  userId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select({
        case: cases,
        client: clients,
        leadLawyer: users,
      })
      .from(cases)
      .leftJoin(clients, eq(clients.id, cases.clientId))
      .leftJoin(users, eq(users.id, cases.leadLawyerId))
      .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)))
      .limit(1);
    if (!row) return null;

    const assignments = await tx
      .select({
        id: caseAssignments.id,
        userId: caseAssignments.userId,
        roleInCase: caseAssignments.roleInCase,
        userName: users.name,
        userEmail: users.email,
      })
      .from(caseAssignments)
      .innerJoin(users, eq(users.id, caseAssignments.userId))
      .where(eq(caseAssignments.caseId, caseId));

    return { ...row, assignments };
  });
}

// Atomic case-code generator (Trampa #7 of the BRIEF).
// Uses INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING to bump the
// (firm_id, year, matter_type) counter atomically. No race window.
async function nextCaseCode(
  tx: Tx,
  firmId: string,
  year: number,
  matterType: Case["matterType"],
): Promise<string> {
  const [row] = await tx
    .insert(caseCounters)
    .values({ firmId, year, matterType, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [caseCounters.firmId, caseCounters.year, caseCounters.matterType],
      set: {
        lastSeq: sql`${caseCounters.lastSeq} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastSeq: caseCounters.lastSeq });

  if (!row) throw new Error("nextCaseCode: counter upsert returned no row");

  const prefix = MATTER_PREFIX[matterType];
  const seqPadded = row.lastSeq.toString().padStart(3, "0");
  return `${year}-${prefix}-${seqPadded}`;
}

export async function createCase(
  firmId: string,
  userId: string,
  data: Omit<NewCase, "firmId" | "id" | "code" | "createdAt" | "updatedAt" | "deletedAt"> & {
    assignments?: Array<Pick<NewCaseAssignment, "userId" | "roleInCase">>;
  },
): Promise<Case> {
  const { assignments, ...caseData } = data;
  const year = new Date(caseData.openedAt ?? new Date()).getUTCFullYear();

  return withFirm(firmId, userId, async (tx) => {
    const code = await nextCaseCode(tx, firmId, year, caseData.matterType);

    const [row] = await tx
      .insert(cases)
      .values({ ...caseData, firmId, code })
      .returning();
    if (!row) throw new Error("createCase: insert returned no row");

    if (assignments && assignments.length > 0) {
      await tx.insert(caseAssignments).values(
        assignments.map((a) => ({
          caseId: row.id,
          userId: a.userId,
          roleInCase: a.roleInCase,
        })),
      );
    }
    return row;
  });
}

export async function updateCase(
  firmId: string,
  userId: string,
  caseId: string,
  data: Partial<Omit<NewCase, "firmId" | "id" | "code" | "createdAt">>,
): Promise<Case | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(cases)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)))
      .returning();
    return row ?? null;
  });
}

export async function softDeleteCase(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(cases)
      .set({ deletedAt: new Date() })
      .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)))
      .returning({ id: cases.id });
    return !!row;
  });
}

export async function listArchivedCases(firmId: string, userId: string) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(cases)
      .where(sql`${cases.deletedAt} IS NOT NULL`)
      .orderBy(desc(cases.deletedAt));
  });
}

export async function restoreCase(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(cases)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(cases.id, caseId), sql`${cases.deletedAt} IS NOT NULL`))
      .returning({ id: cases.id });
    return !!row;
  });
}

export async function listCasesForClient(
  firmId: string,
  userId: string,
  clientId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(cases)
      .where(and(eq(cases.clientId, clientId), isNull(cases.deletedAt)))
      .orderBy(desc(cases.openedAt));
  });
}

export async function setCaseAssignments(
  firmId: string,
  userId: string,
  caseId: string,
  assignments: Array<Pick<NewCaseAssignment, "userId" | "roleInCase">>,
) {
  return withFirm(firmId, userId, async (tx) => {
    await tx.delete(caseAssignments).where(eq(caseAssignments.caseId, caseId));
    if (assignments.length > 0) {
      await tx.insert(caseAssignments).values(
        assignments.map((a) => ({
          caseId,
          userId: a.userId,
          roleInCase: a.roleInCase,
        })),
      );
    }
  });
}

export const matterPrefix = MATTER_PREFIX;
