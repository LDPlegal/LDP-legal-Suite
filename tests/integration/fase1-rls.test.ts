// tests/integration/fase1-rls.test.ts
//
// Verifies the visibility cascade introduced by Fase 1: time_entries,
// expenses, tasks, events all sit "below" cases — when a case is
// `restricted` and the session user isn't assigned, those derived rows
// must be hidden too. Timers are personal — only the owner sees their own.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const ADMIN_URL = process.env.DATABASE_MIGRATE_URL;
const APP_URL = process.env.DATABASE_URL;
if (!ADMIN_URL || !APP_URL) {
  throw new Error("Fase 1 RLS test requires DATABASE_URL and DATABASE_MIGRATE_URL");
}

let appPool: Pool;
let f: {
  firmAId: string;
  firmBId: string;
  firmALawyerId: string; // a lawyer NOT assigned to the restricted case
  firmAAdminId: string;
  firmBLawyerId: string;
  restrictedCaseInFirmA: string;
  publicCaseInFirmA: string;
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
    const firmsRes = await admin.query<{ id: string; name: string }>(
      "SELECT id, name FROM firms WHERE deleted_at IS NULL ORDER BY name",
    );
    const firmA = firmsRes.rows[0]!;
    const firmB = firmsRes.rows[1]!;

    const lawyerA = await admin.query<{ id: string }>(
      "SELECT id FROM users WHERE firm_id = $1 AND role = 'lawyer' AND deleted_at IS NULL LIMIT 1",
      [firmA.id],
    );
    const adminA = await admin.query<{ id: string }>(
      "SELECT id FROM users WHERE firm_id = $1 AND role = 'admin' AND deleted_at IS NULL LIMIT 1",
      [firmA.id],
    );
    const lawyerB = await admin.query<{ id: string }>(
      "SELECT id FROM users WHERE firm_id = $1 AND role = 'lawyer' AND deleted_at IS NULL LIMIT 1",
      [firmB.id],
    );
    const restrictedCase = await admin.query<{ id: string }>(
      "SELECT id FROM cases WHERE firm_id = $1 AND visibility = 'restricted' LIMIT 1",
      [firmA.id],
    );
    const publicCase = await admin.query<{ id: string }>(
      "SELECT id FROM cases WHERE firm_id = $1 AND visibility = 'firm' LIMIT 1",
      [firmA.id],
    );

    f = {
      firmAId: firmA.id,
      firmBId: firmB.id,
      firmALawyerId: lawyerA.rows[0]!.id,
      firmAAdminId: adminA.rows[0]!.id,
      firmBLawyerId: lawyerB.rows[0]!.id,
      restrictedCaseInFirmA: restrictedCase.rows[0]!.id,
      publicCaseInFirmA: publicCase.rows[0]!.id,
    };
  } finally {
    await admin.end();
  }
  appPool = new Pool({ connectionString: APP_URL });
});

afterAll(async () => {
  await appPool.end();
});

describe("Fase 1 RLS — visibility cascades from cases", () => {
  it("time_entries on the restricted case are hidden from non-assigned lawyer", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const res = await client.query(
          "SELECT id FROM time_entries WHERE case_id = $1",
          [f.restrictedCaseInFirmA],
        );
        expect(res.rowCount).toBe(0);
      });
    } finally {
      client.release();
    }
  });

  it("time_entries on the restricted case ARE visible to admin", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmAAdminId);
        const res = await client.query(
          "SELECT id FROM time_entries WHERE case_id = $1",
          [f.restrictedCaseInFirmA],
        );
        expect(res.rowCount).toBeGreaterThan(0);
      });
    } finally {
      client.release();
    }
  });

  it("time_entries from firm A are not visible from firm B context", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmBId, f.firmBLawyerId);
        const res = await client.query<{ firm_id: string }>(
          "SELECT firm_id FROM time_entries",
        );
        for (const row of res.rows) {
          expect(row.firm_id).toBe(f.firmBId);
        }
      });
    } finally {
      client.release();
    }
  });

  it("expenses on the restricted case are hidden from non-assigned lawyer", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const res = await client.query(
          "SELECT id FROM expenses WHERE case_id = $1",
          [f.restrictedCaseInFirmA],
        );
        expect(res.rowCount).toBe(0);
      });
    } finally {
      client.release();
    }
  });

  it("tasks on the restricted case are hidden from non-assigned lawyer", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const res = await client.query(
          "SELECT id FROM tasks WHERE case_id = $1",
          [f.restrictedCaseInFirmA],
        );
        expect(res.rowCount).toBe(0);
      });
    } finally {
      client.release();
    }
  });

  it("firm-wide tasks (case_id IS NULL) are visible to any member of the firm", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const res = await client.query(
          "SELECT id FROM tasks WHERE case_id IS NULL",
        );
        expect(res.rowCount).toBeGreaterThan(0);
      });
    } finally {
      client.release();
    }
  });

  it("events on the restricted case are hidden from non-assigned lawyer", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const res = await client.query(
          "SELECT id FROM events WHERE case_id = $1",
          [f.restrictedCaseInFirmA],
        );
        expect(res.rowCount).toBe(0);
      });
    } finally {
      client.release();
    }
  });

  it("WITH CHECK blocks INSERT into time_entries with foreign firm_id", async () => {
    const client = await appPool.connect();
    try {
      let threw = false;
      try {
        await withTx(client, async () => {
          await setCtx(client, f.firmAId, f.firmALawyerId);
          await client.query(
            `INSERT INTO time_entries (firm_id, case_id, user_id, started_at, ended_at, duration_seconds)
             VALUES ($1, $2, $3, now(), now(), 0)`,
            [f.firmBId, f.publicCaseInFirmA, f.firmALawyerId],
          );
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      client.release();
    }
  });
});

describe("Fase 1 RLS — active_timers are personal", () => {
  it("a user does NOT see another user's active timer in the same firm", async () => {
    // Setup: insert an active timer for the lawyer using admin connection.
    const admin = new Pool({ connectionString: ADMIN_URL });
    try {
      await admin.query("DELETE FROM active_timers WHERE user_id = $1", [f.firmALawyerId]);
      await admin.query(
        `INSERT INTO active_timers (user_id, firm_id, case_id, started_at, last_heartbeat_at)
         VALUES ($1, $2, $3, now(), now())`,
        [f.firmALawyerId, f.firmAId, f.publicCaseInFirmA],
      );

      const client = await appPool.connect();
      try {
        // Admin (different user, same firm) should see ZERO timers.
        await withTx(client, async () => {
          await setCtx(client, f.firmAId, f.firmAAdminId);
          const res = await client.query("SELECT user_id FROM active_timers");
          expect(res.rowCount).toBe(0);
        });

        // The owner DOES see their own.
        await withTx(client, async () => {
          await setCtx(client, f.firmAId, f.firmALawyerId);
          const res = await client.query<{ user_id: string }>(
            "SELECT user_id FROM active_timers",
          );
          expect(res.rowCount).toBe(1);
          expect(res.rows[0]?.user_id).toBe(f.firmALawyerId);
        });
      } finally {
        client.release();
      }
    } finally {
      // Cleanup
      await admin.query("DELETE FROM active_timers WHERE user_id = $1", [f.firmALawyerId]);
      await admin.end();
    }
  });

  it("upserting a timer twice for the same user replaces (no duplication)", async () => {
    const admin = new Pool({ connectionString: ADMIN_URL });
    try {
      await admin.query("DELETE FROM active_timers WHERE user_id = $1", [f.firmAAdminId]);

      // First insert
      await admin.query(
        `INSERT INTO active_timers (user_id, firm_id, case_id) VALUES ($1, $2, $3)`,
        [f.firmAAdminId, f.firmAId, f.publicCaseInFirmA],
      );
      // Replacement (same user_id PK conflicts; in app code we ON CONFLICT DO UPDATE)
      await admin.query(
        `INSERT INTO active_timers (user_id, firm_id, case_id) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET case_id = EXCLUDED.case_id`,
        [f.firmAAdminId, f.firmAId, f.restrictedCaseInFirmA],
      );

      const res = await admin.query<{ count: string }>(
        "SELECT count(*) FROM active_timers WHERE user_id = $1",
        [f.firmAAdminId],
      );
      expect(parseInt(res.rows[0]!.count, 10)).toBe(1);
    } finally {
      await admin.query("DELETE FROM active_timers WHERE user_id = $1", [f.firmAAdminId]);
      await admin.end();
    }
  });
});
