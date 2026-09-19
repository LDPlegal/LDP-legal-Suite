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
  proformaCounters,
  timeEntries,
  users,
  type Invoice,
  type NewInvoiceItem,
} from "../schema";
import { computeTotals, num, type LineInput } from "@/lib/invoicing/calculate";
import { assignNcf, type NcfType } from "@/lib/invoicing/ncf";

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

// Contador independiente para proformas, formato PRO-2026-001.
async function nextProformaNumber(tx: Tx, firmId: string, year: number): Promise<string> {
  const [row] = await tx
    .insert(proformaCounters)
    .values({ firmId, year, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [proformaCounters.firmId, proformaCounters.year],
      set: {
        lastSeq: sql`${proformaCounters.lastSeq} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastSeq: proformaCounters.lastSeq });
  if (!row) throw new Error("nextProformaNumber: counter upsert returned no row");
  return `PRO-${year}-${row.lastSeq.toString().padStart(3, "0")}`;
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
          kind: invoices.kind,
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

export type GenerateInvoiceInput = {
  caseId: string;
  clientId: string;
  // The drawer pre-builds the line items (with user edits to description /
  // qty / unit_price / tax_rate). This action no longer reads the source
  // rows to build defaults, it just inserts the lines as given and marks
  // the source IDs as `invoiced`.
  lines: LineInput[];
  // Source IDs to mark as `invoiced` (so they don't reappear in the next
  // billable picker). Independent from `lines` because a manual line has no
  // source, and a single source COULD be split across multiple invoice lines
  // in a future iteration.
  timeEntryIds: string[];
  expenseIds: string[];
  isrWithholding: boolean;
  dueOn: Date;
  notes?: string | null;
  terms?: string | null;
  // F2.5 Modo fiscal: if `fiscal: true` the invoice gets a real NCF assigned
  // atomically from the configured range for `ncfType`. Throws if no range
  // is configured or it's exhausted/expired.
  fiscal?: boolean;
  ncfType?: NcfType;
  // 'proforma' = cotización sin NCF, su propio contador (PRO-). Si es
  // proforma, `fiscal`/`ncfType` se ignoran (nunca lleva comprobante fiscal).
  kind?: "standard" | "proforma";
};

// Legacy alias, kept so we don't churn imports.
export type GenerateFromCaseInput = GenerateInvoiceInput;

export async function generateInvoiceFromCase(
  firmId: string,
  userId: string,
  input: GenerateInvoiceInput,
): Promise<Invoice> {
  return withFirm(firmId, userId, async (tx) => {
    if (input.lines.length === 0) {
      throw new Error("generateInvoice: no hay líneas para facturar");
    }
    const totals = computeTotals(input.lines, {
      isrWithholding: input.isrWithholding,
      itbisWithholding: false,
    });

    const isProforma = input.kind === "proforma";

    // 2. Reserve number atomically, contador separado para proformas.
    const issuedOn = new Date();
    const year = issuedOn.getUTCFullYear();
    const number = isProforma
      ? await nextProformaNumber(tx, firmId, year)
      : await nextInvoiceNumber(tx, firmId, year);

    // 2b. If fiscal mode, atomically assign the next NCF from the configured
    //     range. Throws NcfAssignmentError if range missing/exhausted/expired.
    //     Una proforma NUNCA lleva NCF (no es comprobante fiscal).
    let ncf: string | null = null;
    let ncfType: NcfType | null = null;
    if (!isProforma && input.fiscal) {
      if (!input.ncfType) {
        throw new Error("Modo fiscal requiere ncfType.");
      }
      ncf = await assignNcf(tx, firmId, input.ncfType);
      ncfType = input.ncfType;
    }

    // 3. Insert invoice header.
    const [head] = await tx
      .insert(invoices)
      .values({
        firmId,
        clientId: input.clientId,
        caseId: input.caseId,
        number,
        kind: isProforma ? "proforma" : "standard",
        ncf,
        ncfType,
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

// Edit allowed only on drafts.
// - Header fields: dueOn, notes, terms, isrWithholding (recomputes totals)
// - Lines: optional. If provided, replaces ALL invoice_items rows and
//   recomputes subtotal/itbis/total/balance from the new lines.
// - Source rows that disappear from the new lines are reverted from
//   'invoiced' back to 'approved' so they appear again in the billable
//   picker. New source rows in the new lines are marked 'invoiced'.
export async function updateInvoiceDraft(
  firmId: string,
  userId: string,
  invoiceId: string,
  patch: {
    dueOn?: Date;
    notes?: string | null;
    terms?: string | null;
    isrWithholding?: boolean;
    lines?: LineInput[];
  },
): Promise<Invoice | null> {
  return withFirm(firmId, userId, async (tx) => {
    // Verify it's a draft we can edit.
    const [existing] = await tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.status, "draft"),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) return null;

    if (patch.lines !== undefined) {
      // Re-snapshot the original source IDs so we can flip status correctly.
      const originalItems = await tx
        .select({ sourceType: invoiceItems.sourceType, sourceId: invoiceItems.sourceId })
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoiceId));

      const origTimeIds = originalItems
        .filter((i) => i.sourceType === "time_entry" && i.sourceId)
        .map((i) => i.sourceId as string);
      const origExpIds = originalItems
        .filter((i) => i.sourceType === "expense" && i.sourceId)
        .map((i) => i.sourceId as string);

      const newTimeIds = patch.lines
        .filter((l) => l.sourceType === "time_entry" && l.sourceId)
        .map((l) => l.sourceId as string);
      const newExpIds = patch.lines
        .filter((l) => l.sourceType === "expense" && l.sourceId)
        .map((l) => l.sourceId as string);

      const removedTimeIds = origTimeIds.filter((id) => !newTimeIds.includes(id));
      const removedExpIds = origExpIds.filter((id) => !newExpIds.includes(id));
      const addedTimeIds = newTimeIds.filter((id) => !origTimeIds.includes(id));
      const addedExpIds = newExpIds.filter((id) => !origExpIds.includes(id));

      // Recompute totals from the edited lines.
      const totals = computeTotals(patch.lines, {
        isrWithholding: patch.isrWithholding ?? num(existing.isrWithholdingAmount) > 0,
        itbisWithholding: false,
      });

      // Replace line items.
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
      if (totals.lines.length > 0) {
        await tx.insert(invoiceItems).values(
          totals.lines.map((l, idx) => ({
            invoiceId,
            sourceType: l.sourceType,
            sourceId: l.sourceId,
            description: l.description,
            quantity: l.quantity.toFixed(4),
            unitPrice: l.unitPrice.toFixed(2),
            taxRate: l.taxRate.toFixed(4),
            taxAmount: l.taxAmount.toFixed(2),
            amount: l.amount.toFixed(2),
            position: idx,
          })),
        );
      }

      // Update header totals.
      await tx
        .update(invoices)
        .set({
          subtotal: totals.subtotal.toFixed(2),
          itbisAmount: totals.itbisAmount.toFixed(2),
          isrWithholdingAmount: totals.isrWithholdingAmount.toFixed(2),
          itbisWithholdingAmount: totals.itbisWithholdingAmount.toFixed(2),
          total: totals.total.toFixed(2),
          balance: totals.total.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));

      // Flip statuses on source rows that came/went.
      if (removedTimeIds.length > 0) {
        await tx
          .update(timeEntries)
          .set({ status: "approved", invoiceId: null, updatedAt: new Date() })
          .where(
            sql`${timeEntries.id} = ANY(ARRAY[${sql.join(
              removedTimeIds.map((i) => sql`${i}::uuid`),
              sql`, `,
            )}])`,
          );
      }
      if (removedExpIds.length > 0) {
        await tx
          .update(expenses)
          .set({ status: "approved", invoiceId: null, updatedAt: new Date() })
          .where(
            sql`${expenses.id} = ANY(ARRAY[${sql.join(
              removedExpIds.map((i) => sql`${i}::uuid`),
              sql`, `,
            )}])`,
          );
      }
      if (addedTimeIds.length > 0) {
        await tx
          .update(timeEntries)
          .set({ status: "invoiced", invoiceId, updatedAt: new Date() })
          .where(
            sql`${timeEntries.id} = ANY(ARRAY[${sql.join(
              addedTimeIds.map((i) => sql`${i}::uuid`),
              sql`, `,
            )}])`,
          );
      }
      if (addedExpIds.length > 0) {
        await tx
          .update(expenses)
          .set({ status: "invoiced", invoiceId, updatedAt: new Date() })
          .where(
            sql`${expenses.id} = ANY(ARRAY[${sql.join(
              addedExpIds.map((i) => sql`${i}::uuid`),
              sql`, `,
            )}])`,
          );
      }
    }

    const [row] = await tx
      .update(invoices)
      .set({
        ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.terms !== undefined ? { terms: patch.terms } : {}),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
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
