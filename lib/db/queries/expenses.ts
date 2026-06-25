import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { withFirm } from "../with-firm";
import { expenses, users, type Expense, type NewExpense } from "../schema";

export async function listExpensesForCase(
  firmId: string,
  userId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: expenses.id,
        userId: expenses.userId,
        userName: users.name,
        description: expenses.description,
        amount: expenses.amount,
        currency: expenses.currency,
        incurredOn: expenses.incurredOn,
        billable: expenses.billable,
        status: expenses.status,
        receiptUrl: expenses.receiptUrl,
      })
      .from(expenses)
      .leftJoin(users, eq(users.id, expenses.userId))
      .where(
        and(
          eq(expenses.caseId, caseId),
          isNull(expenses.deletedAt),
        ),
      )
      .orderBy(desc(expenses.incurredOn));
  });
}

export async function createExpense(
  firmId: string,
  userId: string,
  data: Omit<
    NewExpense,
    "firmId" | "id" | "userId" | "createdAt" | "updatedAt" | "deletedAt"
  >,
): Promise<Expense> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({ ...data, firmId, userId })
      .returning();
    if (!row) throw new Error("createExpense: insert returned no row");
    return row;
  });
}

export async function updateExpense(
  firmId: string,
  userId: string,
  expenseId: string,
  data: Partial<Omit<NewExpense, "firmId" | "id" | "userId" | "createdAt" | "updatedAt" | "deletedAt">>,
): Promise<Expense | null> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(expenses)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(expenses.id, expenseId),
          // No permitimos editar gastos ya facturados — la factura los
          // congela. Si quieren cambiarlo deben anular la factura primero.
          ne(expenses.status, "invoiced"),
          isNull(expenses.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  });
}

export async function approveExpense(
  firmId: string,
  userId: string,
  expenseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(expenses)
      .set({
        status: "approved",
        approvedById: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.status, "draft"),
          isNull(expenses.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  });
}

export async function softDeleteExpense(
  firmId: string,
  userId: string,
  expenseId: string,
): Promise<boolean> {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .update(expenses)
      .set({ deletedAt: new Date() })
      .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
      .returning({ id: expenses.id });
    return !!row;
  });
}

export function totalAmount(rows: Array<{ amount: string }>): number {
  return rows.reduce((acc, r) => acc + Number(r.amount), 0);
}

// .ics generator helper — minimal RFC 5545 builder for export.
// We emit DTSTAMP/DTSTART/DTEND in UTC (ending with Z) since timestamptz is UTC.
export function buildIcs(eventsList: Array<{
  icalUid: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
}>): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LDP Legal Suite//ES",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of eventsList) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.icalUid}`);
    lines.push(`DTSTAMP:${fmt(new Date())}`);
    lines.push(`DTSTART:${fmt(new Date(e.startAt))}`);
    lines.push(`DTEND:${fmt(new Date(e.endAt))}`);
    lines.push(`SUMMARY:${escapeIcs(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeIcs(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeIcs(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
