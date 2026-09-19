// lib/audit/log.ts
//
// Drop-in helper for server actions to record an audit_log entry. Pass the
// transaction handle from withFirm so the insert is part of the same atomic
// unit as the change being recorded.
//
// Usage from inside a withFirm callback:
//   await logAudit(tx, {
//     firmId, userId,
//     entityType: "invoice", entityId: inv.id,
//     action: "created",
//     summary: `Factura ${inv.number} generada`,
//     diff: { total: inv.total },
//   });
//
// Outside a withFirm context, use logAuditStandalone(firmId, userId, ...).

import { auditLog, type NewAuditLog } from "../db/schema";
import { withFirm, type Tx } from "../db/with-firm";

export type AuditAction = NewAuditLog["action"];

export type LogAuditInput = {
  firmId: string;
  userId: string;
  entityType: "case" | "client" | "invoice" | "payment" | "time_entry" | "expense" | "task" | "event" | "document" | "note" | "user" | "ncf_range" | "firm";
  entityId: string;
  // When the entity belongs to a case (invoice/time/expense/document/note/
  // task/event), set caseId so the case detail's Bitácora tab can list all
  // related events together, not just events whose entity_type='case'.
  caseId?: string;
  action: AuditAction;
  summary?: string;
  diff?: Record<string, unknown>;
};

export async function logAudit(tx: Tx, input: LogAuditInput): Promise<void> {
  await tx.insert(auditLog).values({
    firmId: input.firmId,
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    caseId: input.caseId ?? null,
    action: input.action,
    summary: input.summary ?? null,
    diff: input.diff ?? null,
  });
}

export async function logAuditStandalone(input: LogAuditInput): Promise<void> {
  await withFirm(input.firmId, input.userId, async (tx) => {
    await logAudit(tx, input);
  });
}
