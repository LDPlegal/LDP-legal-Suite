import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { withFirm, type Tx } from "../with-firm";
import {
  cases,
  clients,
  expenses,
  invoiceCounters,
  invoiceItems,
  invoices,
  payments,
  timeEntries,
  users,
  type Invoice,
  type NewInvoiceItem,
} from "../schema";
import { computeTotals, num, type LineInput } from "@/lib/invoicing/calculate";

// =============================================================================
// Invoice number generator (race-safe per § Trampa #7 from Fase 0)
// =============================================================================

async function nextInvoiceNumber(tx: Tx, firmId: string, year: number): Promise<string> {
  const [row] = await tx
    .insert(invoiceCounters)
    .values({ firmId, year, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [invoiceCounters.firmId, invoiceCounters.year],
      set: {
        lastSeq: sql`${invoiceCounters.lastSeq} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastSeq: invoiceCounters.lastSeq });
  if (!row) throw new Error("nextInvoiceNumber: counter upsert returned no row");
  return `INV-${year}-${row.lastSeq.toString().padStart(3, "0")}`;
}

// =============================================================================
// Listing & detail
// =============================================================================

export async function listInvoices(
  firmId: string,
  userId: string,
  opts: { status?: Invoice["status"]; clientId?: string; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  return withFirm(firmId, userId, async (tx) => {
    const conds = [isNull(invoices.deletedAt)];
    if (opts.status) conds.push(eq(invoices.status, opts.status));
    if (opts.clientId) conds.push(eq(invoices.clientId, opts.clientId));

    const [rows, totalRow] = await Promise.all([
      tx
        .select({
          id: invoices.id,
          number: invoices.number,
          ncf: invoices.ncf,
          ncfType: invoices.ncfType,
          issuedOn: invoices.issuedOn,
          dueOn: invoices.dueOn,
          status: invoices.status,
          subtotal: invoices.subtotal,
          itbisAmount: invoices.itbisAmount,
          total: invoices.total,
          balance: invoices.balance,
          currency: invoices.currency,
          clientId: invoices.clientId,
          clientName: clients.displayName,
          caseId: invoices.caseId,
          caseCode: cases.code,
        })
        .from(invoices)
        .leftJoin(clients, eq(clients.id, invoices.clientId))
        .leftJoin(cases, eq(cases.id, invoices.caseId))
        .where(and(...conds))
        .orderBy(desc(invoices.issuedOn))
        .limit(limit)
        .offset(offset),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(and(...conds)),
    ]);
    return { rows, total: totalRow[0]?.count ?? 0, limit, offset };
  });
}

export async function getInvoiceById(firmId: string, userId: string, invoiceId: string) {
  return withFirm(firmId, userId, async (tx) => {
    const [head] = await tx
      .select({
        invoice: invoices,
        client: clients,
        case: cases,
        createdBy: users,
      })
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .leftJoin(cases, eq(cases.id, invoices.caseId))
      .leftJoin(users, eq(users.id, invoices.createdBy))
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)))
      .limit(1);
    if (!head) return null;
    const items = await tx
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId))
      .orderBy(asc(invoiceItems.position));
    const pays = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.deletedAt)))
      .orderBy(desc(payments.paidOn));
    return { ...head, items, payments: pays };
  });
}

// =============================================================================
// Generate from approved time_entries + expenses on a case
// =============================================================================

export type GenerateFromCaseInput = {
  caseId: string;
  clientId: string;
  timeEntryIds: string[];
  expenseIds: string[];
  manualLines?: LineInput[];
  isrWithholding: boolean;
  dueOn: Date;
  notes?: string | null;
  terms?: string | null;
};

export async function generateInvoiceFromCase(
  firmId: string,
  userId: string,
  input: GenerateFromCaseInput,
): Promise<Invoice> {
  return withFirm(firmId, userId, async (tx) => {
    // 1. Build lines from approved time entries (rate-snapshot * hours).
    const tEntries =
      input.timeEntryIds.length > 0
        ? await tx
            .select()
            .from(timeEntries)
            .where(
              and(
                eq(timeEntries.caseId, input.caseId),
                eq(timeEntries.status, "approved"),
                isNull(timeEntries.deletedAt),
                sql`${timeEntries.id} = ANY(ARRAY[${sql.join(
                  input.timeEntryIds.map((i) => sql`${i}::uuid`),
                  sql`, `,
                )}])`,
              ),
            )
        : [];

    const eEntries =
      input.expenseIds.length > 0
        ? await tx
            .select()
            .from(expenses)
            .where(
              and(
                eq(expenses.caseId, input.caseId),
                eq(expenses.status, "approved"),
                isNull(expenses.deletedAt),
                sql`${expenses.id} = ANY(ARRAY[${sql.join(
                  input.expenseIds.map((i) => sql`${i}::uuid`),
                  sql`, `,
                )}])`,
              ),
            )
        : [];

    const timeLines: LineInput[] = tEntries.map((t) => {
      const hours = num(t.durationSeconds) / 3600;
      const rate = num(t.hourlyRateSnapshot);
      return {
        description:
          t.description ??
          `Honorarios por hora (${(num(t.durationSeconds) / 3600).toFixed(2)}h)`,
        quantity: Math.round(hours * 100) / 100,
        unitPrice: rate,
        taxRate: 0.18,
        sourceType: "time_entry",
        sourceId: t.id,
      };
    });

    const expenseLines: LineInput[] = eEntries.map((e) => ({
      description: `Gasto: ${e.description}`,
      quantity: 1,
      unitPrice: num(e.amount),
      taxRate: 0, // expense reimbursements typically pass-through (no extra ITBIS)
      sourceType: "expense",
      sourceId: e.id,
    }));

    const allLines: LineInput[] = [
      ...timeLines,
      ...expenseLines,
      ...(input.manualLines ?? []),
    ];

    if (allLines.length === 0) {
      throw new Error("generateInvoiceFromCase: no hay líneas para facturar");
    }

    const totals = computeTotals(allLines, {
      isrWithholding: input.isrWithholding,
      itbisWithholding: false,
    });

    // 2. Reserve invoice number atomically.
    const issuedOn = new Date();
    const year = issuedOn.getUTCFullYear();
    const number = await nextInvoiceNumber(tx, firmId, year);

    // 3. Insert invoice header.
    const [head] = await tx
      .insert(invoices)
      .values({
        firmId,
        clientId: input.clientId,
        caseId: input.caseId,
        number,
        ncf: null,
        ncfType: null,
        issuedOn,
        dueOn: input.dueOn,
        status: "draft",
        subtotal: totals.subtotal.toFixed(2),
        itbisAmount: totals.itbisAmount.toFixed(2),
        isrWithholdingAmount: totals.isrWithholdingAmount.toFixed(2),
        itbisWithholdingAmount: totals.itbisWithholdingAmount.toFixed(2),
        total: totals.total.toFixed(2),
        balance: totals.total.toFixed(2),
        currency: "DOP",
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        createdBy: userId,
      })
      .returning();
    if (!head) throw new Error("generateInvoiceFromCase: invoice insert returned no row");

    // 4. Insert line items.
    const itemRows: NewInvoiceItem[] = totals.lines.map((l, idx) => ({
      invoiceId: head.id,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      description: l.description,
      quantity: l.quantity.toFixed(4),
      unitPrice: l.unitPrice.toFixed(2),
      taxRate: l.taxRate.toFixed(4),
      taxAmount: l.taxAmount.toFixed(2),
      amount: l.amount.toFixed(2),
      position: idx,
    }));
    if (itemRows.length > 0) await tx.insert(invoiceItems).values(itemRows);

    // 5. Mark source rows as "invoiced" so they don't appear in next invoice picker.
    if (input.timeEntryIds.length > 0) {
      await tx
        .update(timeEntries)
        .set({ status: "invoiced", invoiceId: head.id, updatedAt: new Date() })
        .where(
          sql`${timeEntries.id} = ANY(ARRAY[${sql.join(
            input.timeEntryIds.map((i) => sql`${i}::uuid`),
            sql`, `,
          )}])`,
        );
    }
    if (input.expenseIds.length > 0) {
      await tx
        .update(expenses)
        .set({ status: "invoiced", invoiceId: head.id, updatedAt: new Date() })
        .where(
          sql`${expenses.id} = ANY(ARRAY[${sql.join(
            input.expenseIds.map((i) => sql`${i}::uuid`),
            sql`, `,
          )}])`,
        );
    }

    return head;
  });
}

// =============================================================================
// Status transitions + payments
// =============================================================================

export async function markInvoiceSent(firmId: string, userId: string, invoiceId: string) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.status, "draft"),
          isNull(invoices.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  });
}

export async function voidInvoice(firmId: string, userId: string, invoiceId: string) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set({ status: "void", voidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)))
      .returning();
    return row ?? null;
  });
}

export async function recordPayment(
  firmId: string,
  userId: string,
  input: {
    invoiceId: string;
    amount: number;
    method: "cash" | "transfer" | "check" | "card" | "other";
    paidOn: Date;
    reference?: string | null;
    notes?: string | null;
  },
) {
  return withFirm(firmId, userId, async (tx) => {
    await tx.insert(payments).values({
      invoiceId: input.invoiceId,
      paidOn: input.paidOn,
      amount: input.amount.toFixed(2),
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
    });

    // Recompute balance and possibly transition status.
    const [head] = await tx
      .select({ total: invoices.total })
      .from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .limit(1);
    if (!head) throw new Error("recordPayment: invoice not found");

    const paidRows = await tx
      .select({ s: sql<string>`sum(${payments.amount})::text` })
      .from(payments)
      .where(and(eq(payments.invoiceId, input.invoiceId), isNull(payments.deletedAt)));
    const paidSoFar = num(paidRows[0]?.s ?? "0");
    const total = num(head.total);
    const balance = Math.max(0, Math.round((total - paidSoFar) * 100) / 100);
    const nextStatus: Invoice["status"] =
      balance === 0 ? "paid" : paidSoFar > 0 ? "partial" : "sent";

    await tx
      .update(invoices)
      .set({
        balance: balance.toFixed(2),
        status: nextStatus,
        paidAt: nextStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, input.invoiceId));
  });
}

export async function softDeleteInvoice(firmId: string, userId: string, invoiceId: string) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(invoices)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)))
      .returning({ id: invoices.id });
    return !!row;
  });
}

// =============================================================================
// Helpers for the "Generate" UI: list approved time/expenses NOT yet invoiced.
// =============================================================================

export async function listBillableForCase(
  firmId: string,
  userId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [tEntries, eEntries] = await Promise.all([
      tx
        .select({
          id: timeEntries.id,
          description: timeEntries.description,
          startedAt: timeEntries.startedAt,
          durationSeconds: timeEntries.durationSeconds,
          hourlyRateSnapshot: timeEntries.hourlyRateSnapshot,
          userName: users.name,
          billable: timeEntries.billable,
        })
        .from(timeEntries)
        .leftJoin(users, eq(users.id, timeEntries.userId))
        .where(
          and(
            eq(timeEntries.caseId, caseId),
            eq(timeEntries.status, "approved"),
            eq(timeEntries.billable, true),
            isNull(timeEntries.invoiceId),
            isNull(timeEntries.deletedAt),
          ),
        )
        .orderBy(asc(timeEntries.startedAt)),
      tx
        .select({
          id: expenses.id,
          description: expenses.description,
          incurredOn: expenses.incurredOn,
          amount: expenses.amount,
          currency: expenses.currency,
          userName: users.name,
          billable: expenses.billable,
        })
        .from(expenses)
        .leftJoin(users, eq(users.id, expenses.userId))
        .where(
          and(
            eq(expenses.caseId, caseId),
            eq(expenses.status, "approved"),
            eq(expenses.billable, true),
            isNull(expenses.invoiceId),
            isNull(expenses.deletedAt),
          ),
        )
        .orderBy(asc(expenses.incurredOn)),
    ]);
    return { timeEntries: tEntries, expenses: eEntries };
  });
}
