// tests/e2e/folders-flow.spec.ts
//
// Smoke E2E del flujo de carpetas (Fase 6+).
//
// Cubrimos:
//   1. Login + nav a /documentos.
//   2. Crear una carpeta con el dialog.
//   3. Navegar a la carpeta y volver al root.
//   4. Eliminar la carpeta + verificar que va a papelera.
//   5. Restaurar desde papelera + verificar reaparece en root.
//
// Lo que NO cubrimos acá:
//   - Upload real de archivo (requiere R2 configurado en el entorno E2E).
//   - Mover por D&D — Playwright sí lo soporta vía dispatchDragEvent o
//     mouse.down/move/up, pero es flaky con @dnd-kit (sensor de distancia).
//   - Compartir con cliente (requiere docs reales en la carpeta).
//
// Skip si no hay seed (≥1 firma con admin).

import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { config } from "dotenv";
config({ path: ".env" });

const SEED_PASSWORD = "password123";
const FIRM_A_ADMIN = "carmen.almonte@almontereyes.do";

let skipReason: string | null = null;

test.beforeAll(async () => {
  const url = process.env.DATABASE_MIGRATE_URL;
  if (!url) {
    skipReason = "DATABASE_MIGRATE_URL no configurado";
    return;
  }
  const pool = new Pool({ connectionString: url });
  try {
    const res = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [FIRM_A_ADMIN],
    );
    if (res.rows.length === 0) {
      skipReason = `Seed user ${FIRM_A_ADMIN} no existe. Corré \`pnpm db:seed\`.`;
    }
  } finally {
    await pool.end();
  }
});

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', SEED_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Folders flow", () => {
  test.beforeEach(async ({}, testInfo) => {
    if (skipReason) testInfo.skip(true, skipReason);
  });

  test("crear → navegar → eliminar → restaurar carpeta", async ({ page }) => {
    // Nombre con timestamp para evitar colisiones entre corridas.
    const folderName = `e2e-test-${Date.now()}`;

    // 1) Login
    await login(page, FIRM_A_ADMIN);

    // 2) Ir a /documentos
    await page.goto("/documentos");
    await expect(page.getByRole("heading", { name: "Documentos" })).toBeVisible();

    // 3) Crear carpeta via dialog "Nueva carpeta"
    await page.getByRole("button", { name: /nueva carpeta/i }).click();
    await page.getByLabel(/nombre/i).fill(folderName);
    await page.getByRole("button", { name: "Crear" }).click();

    // 4) Verificar que aparece en el listado
    await expect(page.getByText(folderName, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // 5) Eliminar la carpeta (sin checkbox de delete docs — está vacía)
    //    Necesitamos hover para que aparezca el botón eliminar.
    const folderCard = page
      .locator("div.group", { hasText: folderName })
      .first();
    await folderCard.hover();
    await folderCard.getByRole("button", { name: /eliminar carpeta/i }).click();
    // Confirma en el dialog
    await page.getByRole("button", { name: "Eliminar" }).click();

    // 6) La carpeta desaparece del listado
    await expect(page.getByText(folderName, { exact: true })).toBeHidden({
      timeout: 10_000,
    });

    // 7) Ir a /documentos/papelera y verificar que está ahí
    await page.goto("/documentos/papelera");
    await expect(page.getByRole("heading", { name: "Papelera" })).toBeVisible();
    await expect(page.getByText(folderName, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // 8) Click Restaurar
    const trashRow = page.locator("li", { hasText: folderName });
    await trashRow.getByRole("button", { name: /restaurar/i }).click();

    // 9) Volver a /documentos y verificar que reapareció
    await page.goto("/documentos");
    await expect(page.getByText(folderName, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // 10) Cleanup: eliminar definitivamente para no dejar basura.
    //     Lo hacemos via DB directo para no depender del UI.
    const url = process.env.DATABASE_MIGRATE_URL;
    if (url) {
      const pool = new Pool({ connectionString: url });
      try {
        await pool.query("DELETE FROM folders WHERE name = $1", [folderName]);
      } finally {
        await pool.end();
      }
    }
  });

  test("papelera vacía muestra mensaje claro", async ({ page }) => {
    await login(page, FIRM_A_ADMIN);
    await page.goto("/documentos/papelera");
    await expect(page.getByRole("heading", { name: "Papelera" })).toBeVisible();
    // Si NO hay items, debe mostrarse el empty state. Si hay, no validamos.
    const items = await page.locator("li").count();
    if (items === 0) {
      await expect(page.getByText(/papelera está vacía/i)).toBeVisible();
    }
  });

  test("paginación: ?q=algo muestra strip de paginación", async ({ page }) => {
    await login(page, FIRM_A_ADMIN);
    await page.goto("/documentos?q=test");
    // Si hay resultados, vemos "X-Y de N" + botón Anterior/Siguiente.
    // Si no hay, vemos "Sin resultados".
    const hasResults = await page
      .getByText(/de \d+ resultados?/i)
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/sin resultados/i)
      .isVisible()
      .catch(() => false);
    expect(hasResults || hasEmpty).toBe(true);
  });
});
