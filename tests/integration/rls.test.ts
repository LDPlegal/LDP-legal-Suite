// tests/integration/rls.test.ts
//
// PRUEBA DE FUEGO de Fase 0 (BRIEF Paso 10).
// Connects to Postgres as the runtime app_user (BYPASSRLS = false) and
// verifies that Row Level Security correctly isolates firms and that the
// `case_assignments` + `cases.visibility` rules of § 9.2 hold.
//
// If any of these tests fail, RLS is broken — no further work on the app
// should happen until they pass.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const ADMIN_URL = process.env.DATABASE_MIGRATE_URL;
const APP_URL = process.env.DATABASE_URL;
if (!ADMIN_URL || !APP_URL) {
  throw new Error(
    "RLS test requires DATABASE_URL and DATABASE_MIGRATE_URL in .env. Run `pnpm db:seed` first.",
  );
}

let appPool: Pool;
let fixtures: {
  firmAId: string;
  firmBId: string;
  firmALawyerId: string;
  firmAAdminId: string;
  firmBLawyerId: string;
  restrictedCaseInFirmA: string;
  publicCaseInFirmA: string;
  publicClientInFirmB: string;
};

async function withTx<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

async function setContext(client: PoolClient, firmId: string, userId: string): Promise<void> {
  await client.query("SELECT set_config('app.firm_id', $1, true)", [firmId]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
}

beforeAll(async () => {
  // Use the admin connection to read fixtures (RLS bypassed).
  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    const firmsRes = await admin.query<{ id: string; name: string }>(
      "SELECT id, name FROM firms WHERE deleted_at IS NULL ORDER BY name",
    );
    if (firmsRes.rowCount !== 2) {
      throw new Error(
        `RLS test expected 2 seeded firms; found ${firmsRes.rowCount}. Run \`pnpm db:seed\`.`,
      );
    }
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
      "SELECT id FROM cases WHERE firm_id = $1 AND visibility = 'restricted' AND deleted_at IS NULL LIMIT 1",
      [firmA.id],
    );
    const publicCase = await admin.query<{ id: string }>(
      "SELECT id FROM cases WHERE firm_id = $1 AND visibility = 'firm' AND deleted_at IS NULL LIMIT 1",
      [firmA.id],
    );
    const publicClientB = await admin.query<{ id: string }>(
      "SELECT id FROM clients WHERE firm_id = $1 AND deleted_at IS NULL LIMIT 1",
      [firmB.id],
    );

    if (
      !lawyerA.rows[0] ||
      !adminA.rows[0] ||
      !lawyerB.rows[0] ||
      !restrictedCase.rows[0] ||
      !publicCase.rows[0] ||
      !publicClientB.rows[0]
    ) {
      throw new Error("RLS test fixtures incomplete. Re-run `pnpm db:seed`.");
    }

    fixtures = {
      firmAId: firmA.id,
      firmBId: firmB.id,
      firmALawyerId: lawyerA.rows[0].id,
      firmAAdminId: adminA.rows[0].id,
      firmBLawyerId: lawyerB.rows[0].id,
      restrictedCaseInFirmA: restrictedCase.rows[0].id,
      publicCaseInFirmA: publicCase.rows[0].id,
      publicClientInFirmB: publicClientB.rows[0].id,
    };
  } finally {
    await admin.end();
  }

  appPool = new Pool({ connectionString: APP_URL });
});

afterAll(async () => {
  await appPool.end();
});

describe("RLS / multi-tenant isolation (Fase 0 verification)", () => {
  it("app_user has rolbypassrls = false (Trampa #1)", async () => {
    const r = await appPool.query<{ rolbypassrls: boolean; current_user: string }>(
      "SELECT rolbypassrls, current_user FROM pg_roles WHERE rolname = current_user",
    );
    expect(r.rows[0]?.current_user).not.toBe("postgres");
    expect(r.rows[0]?.rolbypassrls).toBe(false);
  });

  it("Without firm context, SELECT on a firm-scoped table fails (no silent leak)", async () => {
    const client = await appPool.connect();
    try {
      let threw = false;
      try {
        await client.query("SELECT * FROM clients");
      } catch {
        threw = true;
      }
      // The cast NULL::uuid raises an error; the alternative would be returning
      // zero rows, both of which prevent leakage. Either is acceptable;
      // raising is the documented preferred outcome.
      expect(threw).toBe(true);
    } finally {
      client.release();
    }
  });

  it("With firm A context, SELECT on clients returns ONLY firm A rows", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setContext(client, fixtures.firmAId, fixtures.firmALawyerId);
        const res = await client.query<{ firm_id: string }>("SELECT firm_id FROM clients");
        expect(res.rowCount).toBeGreaterThan(0);
        for (const row of res.rows) {
          expect(row.firm_id).toBe(fixtures.firmAId);
        }
      });
    } finally {
      client.release();
    }
  });

  it("With firm A context, the public client of firm B is NOT visible by id", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setContext(client, fixtures.firmAId, fixtures.firmALawyerId);
        const res = await client.query("SELECT id FROM clients WHERE id = $1", [
          fixtures.publicClientInFirmB,
        ]);
        expect(res.rowCount).toBe(0);
      });
    } finally {
      client.release();
    }
  });

  it("WITH CHECK blocks INSERT into clients with a foreign firm_id (Trampa #3)", async () => {
    const client = await appPool.connect();
    try {
      let threw = false;
      try {
        await withTx(client, async () => {
          await setContext(client, fixtures.firmAId, fixtures.firmALawyerId);
          // Try to insert a client claiming to belong to firm B while in firm A's context.
          await client.query(
            `INSERT INTO clients (firm_id, type, display_name)
             VALUES ($1, 'individual', 'Tampered Insert')`,
            [fixtures.firmBId],
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

  it("Restricted case is hidden from a non-assigned lawyer in the same firm (§ 9.2)", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setContext(client, fixtures.firmAId, fixtures.firmALawyerId);
        const res = await client.query("SELECT id FROM cases WHERE id = $1", [
          fixtures.restrictedCaseInFirmA,
        ]);
        expect(res.rowCount).toBe(0);
      });
    } finally {
      client.release();
    }
  });

  it("Restricted case IS visible to admin of the same firm (§ 9.2 admin clause)", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setContext(client, fixtures.firmAId, fixtures.firmAAdminId);
        const res = await client.query("SELECT id FROM cases WHERE id = $1", [
          fixtures.restrictedCaseInFirmA,
        ]);
        expect(res.rowCount).toBe(1);
      });
    } finally {
      client.release();
    }
  });

  it("Public 'firm'-visibility case IS visible to any member of the firm", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setContext(client, fixtures.firmAId, fixtures.firmALawyerId);
        const res = await client.query("SELECT id FROM cases WHERE id = $1", [
          fixtures.publicCaseInFirmA,
        ]);
        expect(res.rowCount).toBe(1);
      });
    } finally {
      client.release();
    }
  });

  it("Lawyer of firm B cannot see firm A's restricted case", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setContext(client, fixtures.firmBId, fixtures.firmBLawyerId);
        const res = await client.query("SELECT id FROM cases WHERE id = $1", [
          fixtures.restrictedCaseInFirmA,
        ]);
        expect(res.rowCount).toBe(0);
      });
    } finally {
      client.release();
    }
  });

  it("verifications table is deny-all to runtime app_user", async () => {
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setContext(client, fixtures.firmAId, fixtures.firmALawyerId);
        const res = await client.query("SELECT id FROM verifications");
        expect(res.rowCount).toBe(0);
      });
    } finally {
      client.release();
    }
  });
});
