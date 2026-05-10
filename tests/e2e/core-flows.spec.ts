// tests/e2e/core-flows.spec.ts
//
// Smoke flows that exercise the most important user journeys end-to-end.
// Runs against the seeded dataset (pnpm db:seed); login uses the same
// password as the other E2E tests.

import { test, expect } from "@playwright/test";

const SEED_PASSWORD = "password123";
const ADMIN_EMAIL = "carmen.almonte@almontereyes.do";

async function login(page: import("@playwright/test").Page, email = ADMIN_EMAIL) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', SEED_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

test.describe("Core staff flows", () => {
  test("dashboard renders KPIs and recent activity", async ({ page }) => {
    await login(page);
    await expect(page.locator("h1")).toContainText(/Buen día/i);
    // KPI labels visible
    await expect(page.getByText("Casos abiertos")).toBeVisible();
    await expect(page.getByText("Clientes")).toBeVisible();
    await expect(page.getByText("Mis horas")).toBeVisible();
    await expect(page.getByText("Por cobrar")).toBeVisible();
  });

  test("can open the keyboard shortcuts dialog with ?", async ({ page }) => {
    await login(page);
    // Press '?' outside an input field — body is focused after navigation.
    await page.keyboard.press("Shift+/"); // '?' on US layouts
    await expect(page.getByRole("dialog")).toContainText(/Atajos de teclado/i);
  });

  test("can browse to casos and clientes", async ({ page }) => {
    await login(page);
    await page.click('a[href="/casos"]');
    await page.waitForURL(/\/casos/);
    await expect(page.locator("h1")).toContainText("Casos");
    await page.click('a[href="/clientes"]');
    await page.waitForURL(/\/clientes/);
    await expect(page.locator("h1")).toContainText("Clientes");
  });

  test("configuracion has all enabled tabs", async ({ page }) => {
    await login(page);
    await page.goto("/configuracion");
    for (const label of [
      "Fiscal (NCF)",
      "Datos del firm",
      "IA",
      "Plantillas",
      "Tarifas",
    ]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }
  });
});

test.describe("Password recovery", () => {
  test("forgot-password page loads and accepts an email", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("h1, h2, h3").first()).toContainText(/contraseña/i);
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.click('button[type="submit"]');
    // We always return ok:true (account enumeration prevention); the form
    // simply doesn't re-render an error.
  });

  test("reset-password without token shows guidance", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/Falta el token/i)).toBeVisible();
  });
});
