// tests/integration/folders-rls.test.ts
//
// RLS tests para la tabla `folders` (Fase 6).
//
// Garantías que verificamos:
//   1. Aislamiento cross-firm: user de firm A NO ve folders de firm B.
//   2. Cascada de visibilidad: si un caso es `restricted` y el lawyer no
//      está asignado, las folders dentro de ese caso son invisibles.
//   3. El admin del firm SÍ ve folders en casos restringidos del mismo firm.
//   4. Folders firm-wide (case_id=NULL, client_id=NULL) son visibles a
//      todos los staff del firm.
//   5. Folders soft-deleted no se cuentan en queries con filter deleted_at.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const ADMIN_URL = process.env.DATABASE_MIGRATE_URL!;
const APP_URL = process.env.DATABASE_URL!;

let appPool: Pool;
let skipReason: string | null = null;
let f: {
  firmAId: string;
  firmBId: string;
  firmALawyerId: string;
  firmAAdminId: string;
  firmBLawyerId: string;
  restrictedCaseInFirmA: string;
  publicCaseInFirmA: string;
  // ids insertados por este suite
  firmWideFolderId: string;
  caseFolderPublicId: string;
  caseFolderRestrictedId: string;
  firmBFolderId: string;
  softDeletedFolderId: string;
};

/** Helper para skip dinámico en cada test cuando faltan condiciones (e.g. seed). */
function checkSkip(ctx: { skip: () => void }) {
  if (skipReason) {
    console.log(`[folders-rls] SKIP: ${skipReason}`);
    ctx.skip();
  }
}

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
  if (!ADMIN_URL || !APP_URL) {
    skipReason = "DATABASE_URL/DATABASE_MIGRATE_URL no configurados";
    return;
  }

  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    const firms = await admin.query<{ id: string }>(
      "SELECT id FROM firms WHERE deleted_at IS NULL ORDER BY name",
    );
    if (firms.rows.length < 2) {
      skipReason =
        "Necesitamos ≥2 firmas en la DB para tests cross-firm. Corré `pnpm db:seed` primero.";
      return;
    }
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
    const publicCase = await admin.query<{ id: string }>(
      "SELECT id FROM cases WHERE firm_id = $1 AND visibility = 'firm' LIMIT 1",
      [firmA.id],
    );

    if (
      lawyerA.rows.length === 0 ||
      adminA.rows.length === 0 ||
      lawyerB.rows.length === 0 ||
      restrictedCase.rows.length === 0 ||
      publicCase.rows.length === 0
    ) {
      skipReason =
        "Faltan seed: necesitamos lawyer+admin en cada firma, ≥1 caso public y ≥1 restricted en firmA.";
      await admin.end();
      return;
    }

    // Insertar folders de prueba (admin connection bypassa RLS).
    const fwFolder = await admin.query<{ id: string }>(
      `INSERT INTO folders (firm_id, name, path) VALUES ($1, 'Plantillas', '/')
       RETURNING id`,
      [firmA.id],
    );
    const publicCaseFolder = await admin.query<{ id: string }>(
      `INSERT INTO folders (firm_id, case_id, name, path) VALUES ($1, $2, 'Demandas', '/')
       RETURNING id`,
      [firmA.id, publicCase.rows[0]!.id],
    );
    const restrictedCaseFolder = await admin.query<{ id: string }>(
      `INSERT INTO folders (firm_id, case_id, name, path) VALUES ($1, $2, 'Confidencial', '/')
       RETURNING id`,
      [firmA.id, restrictedCase.rows[0]!.id],
    );
    const firmBFolder = await admin.query<{ id: string }>(
      `INSERT INTO folders (firm_id, name, path) VALUES ($1, 'Manuales', '/')
       RETURNING id`,
      [firmB.id],
    );
    const softDel = await admin.query<{ id: string }>(
      `INSERT INTO folders (firm_id, name, path, deleted_at) VALUES ($1, 'Archivada', '/', now())
       RETURNING id`,
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
      firmWideFolderId: fwFolder.rows[0]!.id,
      caseFolderPublicId: publicCaseFolder.rows[0]!.id,
      caseFolderRestrictedId: restrictedCaseFolder.rows[0]!.id,
      firmBFolderId: firmBFolder.rows[0]!.id,
      softDeletedFolderId: softDel.rows[0]!.id,
    };
  } finally {
    await admin.end();
  }

  appPool = new Pool({ connectionString: APP_URL });
});

afterAll(async () => {
  // Cleanup: borrar los folders insertados por este suite.
  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    if (f) {
      await admin.query(
        "DELETE FROM folders WHERE id = ANY($1::uuid[])",
        [
          [
            f.firmWideFolderId,
            f.caseFolderPublicId,
            f.caseFolderRestrictedId,
            f.firmBFolderId,
            f.softDeletedFolderId,
          ],
        ],
      );
    }
  } finally {
    await admin.end();
    await appPool?.end();
  }
});

describe("folders RLS — cross-firm isolation", () => {
  it("lawyer de firm A NO ve folders de firm B", async (ctx) => {
    checkSkip(ctx);
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const r = await client.query<{ id: string }>(
          "SELECT id FROM folders WHERE id = $1",
          [f.firmBFolderId],
        );
        expect(r.rows).toHaveLength(0);
      });
    } finally {
      client.release();
    }
  });

  it("lawyer de firm B NO ve folders de firm A", async (ctx) => {
    checkSkip(ctx);
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmBId, f.firmBLawyerId);
        const r = await client.query<{ id: string }>(
          "SELECT id FROM folders WHERE id = ANY($1::uuid[])",
          [[f.firmWideFolderId, f.caseFolderPublicId, f.caseFolderRestrictedId]],
        );
        expect(r.rows).toHaveLength(0);
      });
    } finally {
      client.release();
    }
  });
});

describe("folders RLS — visibility cascade vía casos", () => {
  it("lawyer no asignado al caso restricted NO ve la folder de ese caso", async (ctx) => {
    checkSkip(ctx);
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const r = await client.query<{ id: string }>(
          "SELECT id FROM folders WHERE id = $1",
          [f.caseFolderRestrictedId],
        );
        expect(r.rows).toHaveLength(0);
      });
    } finally {
      client.release();
    }
  });

  it("admin del firm SÍ ve folders en casos restringidos del mismo firm", async (ctx) => {
    checkSkip(ctx);
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmAAdminId);
        const r = await client.query<{ id: string }>(
          "SELECT id FROM folders WHERE id = $1",
          [f.caseFolderRestrictedId],
        );
        expect(r.rows).toHaveLength(1);
      });
    } finally {
      client.release();
    }
  });

  it("lawyer SÍ ve folder en caso público del mismo firm", async (ctx) => {
    checkSkip(ctx);
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const r = await client.query<{ id: string }>(
          "SELECT id FROM folders WHERE id = $1",
          [f.caseFolderPublicId],
        );
        expect(r.rows).toHaveLength(1);
      });
    } finally {
      client.release();
    }
  });
});

describe("folders RLS — firm-wide folders y soft-delete", () => {
  it("lawyer SÍ ve folders firm-wide (case_id=NULL) del mismo firm", async (ctx) => {
    checkSkip(ctx);
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        const r = await client.query<{ id: string }>(
          "SELECT id FROM folders WHERE id = $1",
          [f.firmWideFolderId],
        );
        expect(r.rows).toHaveLength(1);
      });
    } finally {
      client.release();
    }
  });

  it("soft-deleted folder NO aparece en queries con filtro deleted_at IS NULL", async (ctx) => {
    checkSkip(ctx);
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmAAdminId);
        const r = await client.query<{ id: string }>(
          "SELECT id FROM folders WHERE id = $1 AND deleted_at IS NULL",
          [f.softDeletedFolderId],
        );
        expect(r.rows).toHaveLength(0);

        // Sin el filtro deleted_at, el admin SÍ la ve (para vista papelera).
        const r2 = await client.query<{ id: string }>(
          "SELECT id FROM folders WHERE id = $1",
          [f.softDeletedFolderId],
        );
        expect(r2.rows).toHaveLength(1);
      });
    } finally {
      client.release();
    }
  });
});

describe("folders RLS — WITH CHECK (INSERT)", () => {
  it("user de firm A NO puede insertar folder con firm_id de firm B", async (ctx) => {
    checkSkip(ctx);
    const client = await appPool.connect();
    try {
      await withTx(client, async () => {
        await setCtx(client, f.firmAId, f.firmALawyerId);
        await expect(
          client.query(
            `INSERT INTO folders (firm_id, name, path) VALUES ($1, 'Hack', '/')`,
            [f.firmBId],
          ),
        ).rejects.toThrow();
      });
    } finally {
      client.release();
    }
  });
});

