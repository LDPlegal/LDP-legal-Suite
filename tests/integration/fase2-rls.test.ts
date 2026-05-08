// tests/integration/fase2-rls.test.ts
//
// Visibility cascade for Fase 2 tables: documents, notes, invoices,
// invoice_items, payments. Same pattern as Fase 1 — when a case is
// `restricted` and the session user isn't assigned, derived rows must be
// hidden. Invoice line items + payments cascade through invoices via
// app_user_can_see_invoice (SECURITY DEFINER).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const ADMIN_URL = process.env.DATABASE_MIGRATE_URL!;
const APP_URL = process.env.DATABASE_URL!;

let appPool: Pool;
let f: {
  firmAId: string;
  firmBId: string;
  firmALawyerId: string;
  firmAAdminId: string;
  firmBLawyerId: string;
  restrictedCaseInFirmA: string;
  publicCaseInFirmA: string;
  publicClientInFirmA: string;
  // ids inserted by this suite for assertions
  publicDocumentId: string;
  restrictedDocumentId: string;
  publicNoteId: string;
  restrictedNoteId: string;
  publicInvoiceId: string;
  restrictedInvoiceId: string;
  publicPaymentId: string;
  restrictedPaymentId: string;
};

async function withTx<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const r = await fn();
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

async function setCtx(client: PoolClient, firmId: string, userId: string) {
  await client.query("SELECT set_config('app.firm_id', $1, true)", [firmId]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
}

beforeAll(async () => {
  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    const firms = await admin.query<{ id: string }>(
      "SELECT id FROM firms WHERE deleted_at IS NULL ORDER BY name",
    );
    const firmA = firms.rows[0]!;
    const firmB = firms.rows[1]!;
    const lawyerA = await admin.query<{ id: string }>(
      "SELECT id FROM users WHERE firm_id = $1 AND role = 'lawyer' LIMIT 1",
      [firmA.id],
    );
    const adminA = await admin.query<{ id: string }>(
      "SELECT id FROM users WHERE firm_id = $1 AND role = 'admin' LIMIT 1",
      [firmA.id],
    );
    const lawyerB = await admin.query<{ id: string }>(
      "SELECT id FROM users WHERE firm_id = $1 AND role = 'lawyer' LIMIT 1",
      [firmB.id],
    );
    const restrictedCase = await admin.query<{ id: string }>(
      "SELECT id FROM cases WHERE firm_id = $1 AND visibility = 'restricted' LIMIT 1",
      [firmA.id],
    );
    const publicCase = await admin.query<{ id: string; client_id: string }>(
      "SELECT id, client_id FROM cases WHERE firm_id = $1 AND visibility = 'firm' LIMIT 1",
      [firmA.id],
    );

    // Insert one document on each (admin connection bypasses RLS).
    const pubDoc = await admin.query<{ id: string }>(
      `INSERT INTO documents (firm_id, case_id, name, mime_type, size_bytes, storage_key, ocr_status)
       VALUES ($1, $2, 'public.pdf', 'application/pdf', 100, 'k1', 'pending') RETURNING id`,
      [firmA.id, publicCase.rows[0]!.id],
    );
    const restDoc = await admin.query<{ id: string }>(
      `INSERT INTO documents (firm_id, case_id, name, mime_type, size_bytes, storage_key, ocr_status)
       VALUES ($1, $2, 'restricted.pdf', 'application/pdf', 100, 'k2', 'pending') RETURNING id`,
      [firmA.id, restrictedCase.rows[0]!.id],
    );
    const pubNote = await admin.query<{ id: string }>(
      `INSERT INTO notes (firm_id, case_id, content) VALUES ($1, $2, '{"type":"doc"}'::jsonb) RETURNING id`,
      [firmA.id, publicCase.rows[0]!.id],
    );
    const restNote = await admin.query<{ id: string }>(
      `INSERT INTO notes (firm_id, case_id, content) VALUES ($1, $2, '{"type":"doc"}'::jsonb) RETURNING id`,
      [firmA.id, restrictedCase.rows[0]!.id],
    );

    // Use the public case's client for both invoices to avoid client/case mismatch.
    const clientId = publicCase.rows[0]!.client_id;
    const pubInv = await admin.query<{ id: string }>(
      `INSERT INTO invoices (firm_id, client_id, case_id, number, issued_on, due_on, total, balance)
       VALUES ($1, $2, $3, 'INV-TEST-PUB', now(), now() + interval '30 days', 100, 100) RETURNING id`,
      [firmA.id, clientId, publicCase.rows[0]!.id],
    );
    const restInv = await admin.query<{ id: string }>(
      `INSERT INTO invoices (firm_id, client_id, case_id, number, issued_on, due_on, total, balance)
       VALUES ($1, $2, $3, 'INV-TEST-RES', now(), now() + interval '30 days', 200, 200) RETURNING id`,
      [firmA.id, clientId, restrictedCase.rows[0]!.id],
    );
    const pubPay = await admin.query<{ id: string }>(
      `INSERT INTO payments (invoice_id, paid_on, amount, method) VALUES ($1, now(), 50, 'cash') RETURNING id`,
      [pubInv.rows[0]!.id],
    );
    const restPay = await admin.query<{ id: string }>(
      `INSERT INTO payments (invoice_id, paid_on, amount, method) VALUES ($1, now(), 75, 'transfer') RETURNING id`,
      [restInv.rows[0]!.id],
    );

    f = {
      firmAId: firmA.id,
      firmBId: firmB.id,
      firmALawyerId: lawyerA.rows[0]!.id,
      firmAAdminId: adminA.rows[0]!.id,
      firmBLawyerId: lawyerB.rows[0]!.id,
      restrictedCaseInFirmA: restrictedCase.rows[0]!.id,
      publicCaseInFirmA: publicCase.rows[0]!.id,
      publicClientInFirmA: clientId,
      publicDocumentId: pubDoc.rows[0]!.id,
      restrictedDocumentId: restDoc.rows[0]!.id,
      publicNoteId: pubNote.rows[0]!.id,
      restrictedNoteId: restNote.rows[0]!.id,
      publicInvoiceId: pubInv.rows[0]!.id,
      restrictedInvoiceId: restInv.rows[0]!.id,
      publicPaymentId: pubPay.rows[0]!.id,
      restrictedPaymentId: restPay.rows[0]!.id,
    };
  } finally {
    await admin.end();
  }
  appPool = new Pool({ connectionString: APP_URL });
});

afterAll(async () => {
  // Clean up the rows this suite inserted.
  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    await admin.query("DELETE FROM payments WHERE id = ANY($1)", [
      [f.publicPaymentId, f.restrictedPaymentId],
    ]);
    await admin.query("DELETE FROM invoices WHERE id = ANY($1)", [
      [f.publicInvoiceId, f.restrictedInvoiceId],
    ]);
    await admin.query("DELETE FROM documents WHERE id = ANY($1)", [
      [f.publicDocumentId, f.restrictedDocumentId],
    ]);
    await admin.query("DELETE FROM notes WHERE id = ANY($1)", [
      [f.publicNoteId, f.restrictedNoteId],
    ]);
  } finally {
    await admin.end();
  }
  await appPool.end();
});

describe("Fase 2 RLS — visibility cascades from cases", () => {
  it("documents on the restricted case are hidden from non-assigned lawyer", async () => {
    const c = await appPool.connect();
    try {
      await withTx(c, async () => {
        await setCtx(c, f.firmAId, f.firmALawyerId);
        const res = await c.query("SELECT id FROM documents WHERE id = $1", [
          f.restrictedDocumentId,
        ]);
        expect(res.rowCount).toBe(0);
      });
    } finally {
      c.release();
    }
  });

  it("documents on the public case ARE visible to any firm member", async () => {
    const c = await appPool.connect();
    try {
      await withTx(c, async () => {
        await setCtx(c, f.firmAId, f.firmALawyerId);
        const res = await c.query("SELECT id FROM documents WHERE id = $1", [
          f.publicDocumentId,
        ]);
        expect(res.rowCount).toBe(1);
      });
    } finally {
      c.release();
    }
  });

  it("notes on the restricted case are hidden from non-assigned lawyer", async () => {
    const c = await appPool.connect();
    try {
      await withTx(c, async () => {
        await setCtx(c, f.firmAId, f.firmALawyerId);
        const res = await c.query("SELECT id FROM notes WHERE id = $1", [f.restrictedNoteId]);
        expect(res.rowCount).toBe(0);
      });
    } finally {
      c.release();
    }
  });

  it("invoices on the restricted case are hidden from non-assigned lawyer", async () => {
    const c = await appPool.connect();
    try {
      await withTx(c, async () => {
        await setCtx(c, f.firmAId, f.firmALawyerId);
        const res = await c.query("SELECT id FROM invoices WHERE id = $1", [
          f.restrictedInvoiceId,
        ]);
        expect(res.rowCount).toBe(0);
      });
    } finally {
      c.release();
    }
  });

  it("admin sees the restricted invoice (admin override clause)", async () => {
    const c = await appPool.connect();
    try {
      await withTx(c, async () => {
        await setCtx(c, f.firmAId, f.firmAAdminId);
        const res = await c.query("SELECT id FROM invoices WHERE id = $1", [
          f.restrictedInvoiceId,
        ]);
        expect(res.rowCount).toBe(1);
      });
    } finally {
      c.release();
    }
  });

  it("payments cascade: hidden when their invoice is hidden", async () => {
    const c = await appPool.connect();
    try {
      await withTx(c, async () => {
        await setCtx(c, f.firmAId, f.firmALawyerId);
        const res = await c.query("SELECT id FROM payments WHERE id = $1", [
          f.restrictedPaymentId,
        ]);
        expect(res.rowCount).toBe(0);
      });
    } finally {
      c.release();
    }
  });

  it("payments on a public invoice ARE visible to any firm member", async () => {
    const c = await appPool.connect();
    try {
      await withTx(c, async () => {
        await setCtx(c, f.firmAId, f.firmALawyerId);
        const res = await c.query("SELECT id FROM payments WHERE id = $1", [f.publicPaymentId]);
        expect(res.rowCount).toBe(1);
      });
    } finally {
      c.release();
    }
  });

  it("firm B cannot see firm A's documents/notes/invoices", async () => {
    const c = await appPool.connect();
    try {
      await withTx(c, async () => {
        await setCtx(c, f.firmBId, f.firmBLawyerId);
        const docs = await c.query("SELECT id FROM documents WHERE id = $1", [
          f.publicDocumentId,
        ]);
        const ns = await c.query("SELECT id FROM notes WHERE id = $1", [f.publicNoteId]);
        const inv = await c.query("SELECT id FROM invoices WHERE id = $1", [f.publicInvoiceId]);
        expect(docs.rowCount).toBe(0);
        expect(ns.rowCount).toBe(0);
        expect(inv.rowCount).toBe(0);
      });
    } finally {
      c.release();
    }
  });
});
