// lib/db/queries/portal.ts
//
// Read-only queries for the Portal Cliente (Fase 4). Every function takes a
// `clientId` and ALWAYS filters by it, these are the only queries the
// portal layer ever calls. The portal layout enforces role='client' and a
// non-null clientId, so functions here can trust that the caller has been
// authorized for that specific client.
//
// What the portal can see:
//   - Cases owned by the client (cases.client_id = clientId).
//   - Events on those cases.
//   - Invoices on those cases.
//   - Documents on those cases that have shared_with_client = true.
//
// What the portal CANNOT see (enforced by absence of queries here):
//   - Time entries, expenses, internal notes, audit log, internal users,
//     other clients' anything.

import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { withFirm } from "../with-firm";
import {
  cases,
  documents,
  events,
  invoices,
  payments,
  users,
} from "../schema";

export async function listPortalCases(
  firmId: string,
  userId: string,
  clientId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: cases.id,
        code: cases.code,
        title: cases.title,
        status: cases.status,
        matterType: cases.matterType,
        openedAt: cases.openedAt,
        closedAt: cases.closedAt,
        leadLawyerId: cases.leadLawyerId,
        leadLawyerName: users.name,
      })
      .from(cases)
      .leftJoin(users, eq(users.id, cases.leadLawyerId))
      .where(and(isNull(cases.deletedAt), eq(cases.clientId, clientId)))
      .orderBy(desc(cases.openedAt));
  });
}

export async function getPortalCase(
  firmId: string,
  userId: string,
  clientId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select({
        id: cases.id,
        code: cases.code,
        title: cases.title,
        status: cases.status,
        matterType: cases.matterType,
        description: cases.description,
        openedAt: cases.openedAt,
        closedAt: cases.closedAt,
        court: cases.court,
        leadLawyerName: users.name,
      })
      .from(cases)
      .leftJoin(users, eq(users.id, cases.leadLawyerId))
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.clientId, clientId),
          isNull(cases.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

// Upcoming events on the client's cases. We hide past events from the portal
// home to keep it focused on what's coming next; case detail can show all.
export async function listPortalUpcomingEvents(
  firmId: string,
  userId: string,
  clientId: string,
  limit = 10,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: events.id,
        caseId: events.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
        title: events.title,
        startAt: events.startAt,
        endAt: events.endAt,
        location: events.location,
      })
      .from(events)
      .innerJoin(cases, eq(cases.id, events.caseId))
      .where(
        and(
          isNull(events.deletedAt),
          eq(cases.clientId, clientId),
          gte(events.startAt, new Date()),
        ),
      )
      .orderBy(asc(events.startAt))
      .limit(limit);
  });
}

export async function listPortalEventsForCase(
  firmId: string,
  userId: string,
  clientId: string,
  caseId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    // Verify the case belongs to this client first, without this a portal
    // user could pass any caseId and read its events. The double-check is
    // cheap and removes any reliance on UI to filter.
    const ok = await tx
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.clientId, clientId),
          isNull(cases.deletedAt),
        ),
      )
      .limit(1);
    if (ok.length === 0) return [];
    return tx
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        startAt: events.startAt,
        endAt: events.endAt,
        location: events.location,
      })
      .from(events)
      .where(and(eq(events.caseId, caseId), isNull(events.deletedAt)))
      .orderBy(asc(events.startAt));
  });
}

export async function listPortalInvoices(
  firmId: string,
  userId: string,
  clientId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    return tx
      .select({
        id: invoices.id,
        number: invoices.number,
        ncf: invoices.ncf,
        status: invoices.status,
        issuedOn: invoices.issuedOn,
        dueOn: invoices.dueOn,
        total: invoices.total,
        balance: invoices.balance,
        caseId: invoices.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
      })
      .from(invoices)
      .innerJoin(cases, eq(cases.id, invoices.caseId))
      .where(
        and(
          isNull(invoices.deletedAt),
          eq(invoices.clientId, clientId),
        ),
      )
      .orderBy(desc(invoices.issuedOn));
  });
}

export async function getPortalInvoice(
  firmId: string,
  userId: string,
  clientId: string,
  invoiceId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [head] = await tx
      .select({
        id: invoices.id,
        number: invoices.number,
        ncf: invoices.ncf,
        ncfType: invoices.ncfType,
        status: invoices.status,
        issuedOn: invoices.issuedOn,
        dueOn: invoices.dueOn,
        subtotal: invoices.subtotal,
        itbisAmount: invoices.itbisAmount,
        isrWithholdingAmount: invoices.isrWithholdingAmount,
        total: invoices.total,
        balance: invoices.balance,
        notes: invoices.notes,
        terms: invoices.terms,
        caseId: invoices.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
      })
      .from(invoices)
      .leftJoin(cases, eq(cases.id, invoices.caseId))
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.clientId, clientId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);
    if (!head) return null;

    const paymentRows = await tx
      .select({
        id: payments.id,
        amount: payments.amount,
        method: payments.method,
        paidOn: payments.paidOn,
        reference: payments.reference,
      })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(desc(payments.paidOn));

    return { invoice: head, payments: paymentRows };
  });
}

export async function listPortalSharedDocuments(
  firmId: string,
  userId: string,
  clientId: string,
  opts: { caseId?: string } = {},
) {
  return withFirm(firmId, userId, async (tx) => {
    const conds = [
      isNull(documents.deletedAt),
      eq(documents.sharedWithClient, true),
      // Filter by either: doc directly belongs to client, OR doc belongs to
      // a case owned by this client. We use the case join so we only return
      // docs whose case.client_id = the portal user's client_id.
      eq(cases.clientId, clientId),
    ];
    if (opts.caseId) conds.push(eq(documents.caseId, opts.caseId));
    return tx
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
        caseId: documents.caseId,
        caseCode: cases.code,
        caseTitle: cases.title,
      })
      .from(documents)
      .innerJoin(cases, eq(cases.id, documents.caseId))
      .where(and(...conds))
      .orderBy(desc(documents.createdAt));
  });
}

// Verify a document is shared and belongs to the portal user's client. Used
// by the download endpoint before streaming bytes.
export async function getPortalDocumentForDownload(
  firmId: string,
  userId: string,
  clientId: string,
  documentId: string,
) {
  return withFirm(firmId, userId, async (tx) => {
    const [row] = await tx
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        storageKey: documents.storageKey,
      })
      .from(documents)
      .innerJoin(cases, eq(cases.id, documents.caseId))
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.sharedWithClient, true),
          eq(cases.clientId, clientId),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}
