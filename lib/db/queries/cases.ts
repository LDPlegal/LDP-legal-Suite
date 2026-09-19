import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withFirm, type Tx } from "../with-firm";
import {
  caseAssignments,
  caseCounters,
  caseFees,
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
  /** Solo los expedientes vinculados de este caso padre. */
  parentCaseId?: string;
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
    if (opts.parentCaseId) conds.push(eq(cases.parentCaseId, opts.parentCaseId));
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      const s = or(
        ilike(cases.code, term),
        ilike(cases.title, term),
        ilike(cases.counterpartyName, term),
        // Cliente, join a clients abajo permite buscar por nombre del cliente
        // ("Constructora Caribe", "Juan Pérez") en el mismo input.
        ilike(clients.displayName, term),
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

    // Self-join para mostrar el código del padre en la lista. Si el padre no
    // es visible para el usuario (RLS) el join devuelve null y la fila se
    // muestra como expediente vinculado sin código de padre.
    const parentCases = alias(cases, "parent_cases");
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
          parentCaseId: cases.parentCaseId,
          parentCaseCode: parentCases.code,
        })
        .from(cases)
        .leftJoin(clients, eq(clients.id, cases.clientId))
        .leftJoin(users, eq(users.id, cases.leadLawyerId))
        .leftJoin(parentCases, eq(parentCases.id, cases.parentCaseId))
        .where(and(...conds))
        .orderBy(order)
        .limit(limit)
        .offset(offset),
      // El count tiene que tener el mismo leftJoin a clients que el select
      // arriba, si no, el filtro `ilike(clients.displayName)` falla porque
      // clients no está en el FROM.
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cases)
        .leftJoin(clients, eq(clients.id, cases.clientId))
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

    // Padre (si es expediente vinculado). Sin filtro deletedAt a propósito: si el padre
    // está archivado igual queremos mostrar su código (sin link).
    let parent: { id: string; code: string; title: string; deletedAt: Date | null } | null = null;
    if (row.case.parentCaseId) {
      const [p] = await tx
        .select({
          id: cases.id,
          code: cases.code,
          title: cases.title,
          deletedAt: cases.deletedAt,
        })
        .from(cases)
        .where(eq(cases.id, row.case.parentCaseId))
        .limit(1);
      parent = p ?? null;
    }

    // Expedientes vinculados activos de este caso.
    const subcases = await tx
      .select({
        id: cases.id,
        code: cases.code,
        title: cases.title,
        status: cases.status,
        matterType: cases.matterType,
        openedAt: cases.openedAt,
      })
      .from(cases)
      .where(and(eq(cases.parentCaseId, caseId), isNull(cases.deletedAt)))
      .orderBy(asc(cases.code));

    return { ...row, assignments, parent, subcases };
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

// Errores de dominio de expedientes vinculados, la action los traduce a mensajes de UI.
export class SubcaseError extends Error {
  constructor(
    public readonly reason: "parent_not_found" | "max_depth",
  ) {
    super(`subcase: ${reason}`);
  }
}

export async function createCase(
  firmId: string,
  userId: string,
  data: Omit<NewCase, "firmId" | "id" | "code" | "createdAt" | "updatedAt" | "deletedAt"> & {
    assignments?: Array<Pick<NewCaseAssignment, "userId" | "roleInCase">>;
    fees?: Array<{
      feeType: "flat_fee" | "retainer" | "success_fee" | "other";
      description?: string;
      amountUsd?: string;
      amountDop?: string;
    }>;
  },
): Promise<Case> {
  const { assignments, fees, ...caseData } = data;
  const year = new Date(caseData.openedAt ?? new Date()).getUTCFullYear();

  return withFirm(firmId, userId, async (tx) => {
    let code: string;
    if (caseData.parentCaseId) {
      // Expediente vinculado: el código se deriva del padre (2026-CIV-014-01). El bump de
      // subcase_last_seq con RETURNING dentro de la misma tx hace la
      // numeración atómica bajo creaciones concurrentes.
      const [parent] = await tx
        .select({
          id: cases.id,
          code: cases.code,
          parentCaseId: cases.parentCaseId,
        })
        .from(cases)
        .where(and(eq(cases.id, caseData.parentCaseId), isNull(cases.deletedAt)))
        .limit(1);
      if (!parent) throw new SubcaseError("parent_not_found");
      if (parent.parentCaseId) throw new SubcaseError("max_depth");

      const [bumped] = await tx
        .update(cases)
        .set({
          subcaseLastSeq: sql`${cases.subcaseLastSeq} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(cases.id, parent.id))
        .returning({ seq: cases.subcaseLastSeq });
      if (!bumped) throw new Error("createCase: subcase counter bump returned no row");
      code = `${parent.code}-${bumped.seq.toString().padStart(2, "0")}`;
    } else {
      code = await nextCaseCode(tx, firmId, year, caseData.matterType);
    }

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

    if (fees && fees.length > 0) {
      await tx.insert(caseFees).values(
        fees.map((f) => ({
          firmId,
          caseId: row.id,
          feeType: f.feeType,
          description: f.description ?? null,
          amountUsd: f.amountUsd ?? null,
          amountDop: f.amountDop ?? null,
        })),
      );
    }

    return row;
  });
}

/** Trae los honorarios de un caso, ordenados por orden de creación. */
export async function listCaseFees(
  firmId: string,
  userId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select()
      .from(caseFees)
      .where(eq(caseFees.caseId, caseId))
      .orderBy(caseFees.createdAt);
  });
}

type CaseFeeInput = {
  feeType: "flat_fee" | "retainer" | "success_fee" | "other";
  description?: string | null;
  amountUsd?: string | null;
  amountDop?: string | null;
};

/** Agrega un honorario a un caso existente (post-creación). */
export async function addCaseFee(
  firmId: string,
  userId: string,
  caseId: string,
  data: CaseFeeInput,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(caseFees)
      .values({
        firmId,
        caseId,
        feeType: data.feeType,
        description: data.description ?? null,
        amountUsd: data.amountUsd ?? null,
        amountDop: data.amountDop ?? null,
      })
      .returning();
    return row ?? null;
  });
}

/** Edita un honorario existente. Devuelve null si no existe (o RLS lo oculta). */
export async function updateCaseFee(
  firmId: string,
  userId: string,
  feeId: string,
  data: CaseFeeInput,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(caseFees)
      .set({
        feeType: data.feeType,
        description: data.description ?? null,
        amountUsd: data.amountUsd ?? null,
        amountDop: data.amountDop ?? null,
        updatedAt: new Date(),
      })
      .where(eq(caseFees.id, feeId))
      .returning();
    return row ?? null;
  });
}

/** Elimina un honorario. Hard delete: los honorarios no facturan solos,
 *  el registro histórico de lo cobrado vive en las facturas. */
export async function deleteCaseFee(
  firmId: string,
  userId: string,
  feeId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .delete(caseFees)
      .where(eq(caseFees.id, feeId))
      .returning({ id: caseFees.id });
    return !!row;
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

export type SoftDeleteCaseResult = "archived" | "not_found" | "has_subcases";

export async function softDeleteCase(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<SoftDeleteCaseResult> {
  return withFirm(firmId, userId, async (tx) => {
    // Un padre con expedientes vinculados activos no se archiva: quedarían huérfanos en la
    // UI (link roto al padre). Hay que archivar los expedientes vinculados primero.
    const [child] = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.parentCaseId, caseId), isNull(cases.deletedAt)))
      .limit(1);
    if (child) return "has_subcases";

    const [row] = await tx
      .update(cases)
      .set({ deletedAt: new Date() })
      .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)))
      .returning({ id: cases.id });
    return row ? "archived" : "not_found";
  });
}

export async function listArchivedCases(firmId: string, userId: string) {
  return withFirm(firmId, userId, async (tx) => {
    // Self-join para el código del padre (mismo patrón que listCases), así la
    // lista de archivados también distingue expedientes vinculados y a qué expediente
    // pertenecen. Orden: por código, de modo que padre y expedientes vinculados queden
    // contiguos (2026-CIV-014 junto a 2026-CIV-014-01) en vez de dispersos
    // por fecha de archivado.
    const parentCases = alias(cases, "parent_cases");
    return tx
      .select({
        id: cases.id,
        code: cases.code,
        title: cases.title,
        status: cases.status,
        matterType: cases.matterType,
        deletedAt: cases.deletedAt,
        parentCaseId: cases.parentCaseId,
        parentCaseCode: parentCases.code,
      })
      .from(cases)
      .leftJoin(parentCases, eq(parentCases.id, cases.parentCaseId))
      .where(sql`${cases.deletedAt} IS NOT NULL`)
      .orderBy(asc(cases.code));
  });
}

export type RestoreCaseResult = "restored" | "not_found" | "parent_archived";

export async function restoreCase(
  firmId: string,
  userId: string,
  caseId: string,
): Promise<RestoreCaseResult> {
  return withFirm(firmId, userId, async (tx) => {
    // Un expediente vinculado no puede restaurarse mientras su padre siga archivado:
    // quedaría en la lista activa colgando de un caso invisible. Hay que
    // restaurar el padre primero.
    const [target] = await tx
      .select({ parentCaseId: cases.parentCaseId })
      .from(cases)
      .where(and(eq(cases.id, caseId), sql`${cases.deletedAt} IS NOT NULL`))
      .limit(1);
    if (!target) return "not_found";
    if (target.parentCaseId) {
      const [parent] = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(and(eq(cases.id, target.parentCaseId), isNull(cases.deletedAt)))
        .limit(1);
      if (!parent) return "parent_archived";
    }

    const [row] = await tx
      .update(cases)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(cases.id, caseId), sql`${cases.deletedAt} IS NOT NULL`))
      .returning({ id: cases.id });
    return row ? "restored" : "not_found";
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

export async function setCaseConfidentialTier(
  firmId: string,
  userId: string,
  caseId: string,
  tier: "normal" | "confidential" | "ultra_confidential",
): Promise<{ id: string; code: string; title: string; previousTier: string } | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [caso] = await tx
      .select({
        id: cases.id,
        currentTier: cases.confidentialTier,
        code: cases.code,
        title: cases.title,
      })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);
    if (!caso) return null;
    if (caso.currentTier === tier) return { id: caso.id, code: caso.code, title: caso.title, previousTier: tier };

    await tx
      .update(cases)
      .set({ confidentialTier: tier, updatedAt: new Date() })
      .where(eq(cases.id, caseId));

    return { id: caso.id, code: caso.code, title: caso.title, previousTier: caso.currentTier };
  });
}

export const matterPrefix = MATTER_PREFIX;
