// tests/e2e/cross-tenant.spec.ts
//
// End-to-end check that the UI honors the same firm-isolation guarantees
// that RLS enforces at the DB layer (BRIEF Paso 10).
// Pairs with tests/integration/rls.test.ts: that one ATTACKS the DB
// directly, this one walks through the user-facing flow.

import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { config } from "dotenv";
config({ path: ".env" });

const SEED_PASSWORD = "password123";

async function lookupFirmBPublicClientId(): Promise<string> {
  const url = process.env.DATABASE_MIGRATE_URL;
  if (!url) throw new Error("DATABASE_MIGRATE_URL required");
  const pool = new Pool({ connectionString: url });
  try {
    const res = await pool.query<{ id: string }>(
      `SELECT c.id
       FROM clients c
       JOIN firms f ON f.id = c.firm_id
       WHERE f.name = 'Pichardo Legal Group'
         AND c.deleted_at IS NULL
       LIMIT 1`,
    );
    if (!res.rows[0]) throw new Error("No firm B client found — run `pnpm db:seed`");
    return res.rows[0].id;
  } finally {
    await pool.end();
  }
}

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', SEED_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Cross-tenant isolation", () => {
  test("Firm A user sees only firm A clientes (and not firm B's)", async ({ page }) => {
    await login(page, "carmen.almonte@almontereyes.do");
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    // A firm A seed client must be visible
    await expect(page.getByText("Industrias Caribeñas, S.R.L.")).toBeVisible();
    // A firm B seed client must NOT be visible
    await expect(page.getByText("Banco Atlántico")).toHaveCount(0);
  });

  test("Firm A user reaching a firm B cliente by direct URL gets 404", async ({ page }) => {
    const firmBClientId = await lookupFirmBPublicClientId();
    await login(page, "carmen.almonte@almontereyes.do");
    const response = await page.goto(`/clientes/${firmBClientId}`);
    // notFound() in Next.js renders the 404 boundary; check status or text.
    expect(response?.status()).toBe(404);
  });

  test("Firm B user sees only firm B clientes (symmetric check)", async ({ page }) => {
    await login(page, "francisco.pichardo@pichardolegal.do");
    await page.goto("/clientes");
    await expect(page.getByText("Bahía Real Estate")).toBeVisible();
    await expect(page.getByText("Industrias Caribeñas")).toHaveCount(0);
  });

  test("A non-assigned lawyer in firm A does not see the restricted case in the list", async ({
    page,
  }) => {
    // Luis Peralta is a lawyer in firm A; the restricted case is assigned to a
    // partner only, not to him. So the case should not appear in his list.
    await login(page, "luis.peralta@almontereyes.do");
    await page.goto("/casos");
    await expect(page.getByRole("heading", { name: "Casos" })).toBeVisible();
    // The restricted case title from seeds:
    await expect(page.getByText("Defensa penal preliminar")).toHaveCount(0);
  });

  test("Admin in firm A does see the restricted case", async ({ page }) => {
    await login(page, "carmen.almonte@almontereyes.do");
    await page.goto("/casos");
    await expect(page.getByText("Defensa penal preliminar")).toBeVisible();
  });
});
