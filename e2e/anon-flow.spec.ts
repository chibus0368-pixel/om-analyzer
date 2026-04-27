import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the anonymous trial flow. Deliberately permissive -
 * we test "page reachable + key copy present" rather than specific
 * widget locators so small DOM changes don't break the suite.
 */

test.describe("anon trial flow", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("/om-analyzer renders without server errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("response", r => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto("/om-analyzer", { waitUntil: "domcontentloaded" });
    // Generic check: we got an HTML page with the brand somewhere on it
    await expect(page.locator("body")).toContainText(/deal\s*signals|dealsignals/i, { timeout: 15_000 });
    expect(errors, `5xx responses: ${errors.join(", ")}`).toHaveLength(0);
  });

  test("/pricing renders all three plans", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/free/i, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/pro\b/i);
    await expect(page.locator("body")).toContainText(/pro\+|pro plus/i);
  });

  test("/workspace/login?mode=register renders the register form (no black screen)", async ({ page }) => {
    await page.goto("/workspace/login?mode=register", { waitUntil: "load" });
    // Wait for hydration - Next.js fills body AFTER DCL.
    await page.waitForFunction(
      () => (document.body.innerText || "").trim().length > 50,
      { timeout: 15_000 }
    );
    // Specifically should reference creating an account / register form text.
    await expect(page.locator("body")).toContainText(/create\s*account|register|sign\s*up/i, { timeout: 10_000 });
  });

  test("/workspace/profile does not show editable profile form to anon visitors", async ({ page }) => {
    await page.goto("/workspace/profile", { waitUntil: "load" });
    // Wait for hydration or a redirect away.
    await Promise.race([
      page.waitForFunction(() => (document.body.innerText || "").trim().length > 30, { timeout: 20_000 }),
      page.waitForURL(/\/workspace\/login/, { timeout: 20_000 }).catch(() => null),
    ]);
    const url = page.url();
    const bodyText = (await page.locator("body").innerText()).toLowerCase();

    // The whole point of this test is to confirm we do NOT leak the
    // editable Save Profile form to an anonymous user. Whatever else
    // is on the page (empty state, redirect, workspace shell with
    // upgrade pill) is fine.
    const hasEditableForm = /save\s+profile|edit\s+profile/.test(bodyText);
    expect(hasEditableForm,
      `Anon profile must NOT show the editable Save Profile form. URL: ${url}`
    ).toBe(false);
  });

  test("workspace property URL renders something (anon-signed-in OR bounced gracefully)", async ({ page }) => {
    await page.goto("/workspace/properties/anon-test-id-no-such-prop", { waitUntil: "load" });
    // Next.js App Router hydrates after DCL; wait for any rendered text
    // or for a navigation away (which is also acceptable - the layout
    // may router.replace() to /workspace/login when anon auth is off).
    // We give the SPA up to 20s to either render content or navigate.
    await Promise.race([
      page.waitForFunction(() => (document.body.innerText || "").trim().length > 30, { timeout: 20_000 }),
      page.waitForURL(/\/workspace\/login/, { timeout: 20_000 }).catch(() => null),
    ]);
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length, "page never rendered any content").toBeGreaterThan(20);
  });
});

test.describe("forgot password recovery", () => {
  test("login form has a 'Forgot password?' link to /forgot-password", async ({ page }) => {
    await page.goto("/workspace/login", { waitUntil: "load" });
    await page.waitForFunction(
      () => (document.body.innerText || "").length > 50,
      { timeout: 15_000 }
    );
    const link = page.locator('a[href*="/forgot-password"]').first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    expect(await link.getAttribute("href")).toContain("/forgot-password");
  });

  test("/forgot-password page renders with an email input", async ({ page }) => {
    await page.goto("/forgot-password", { waitUntil: "load" });
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10_000 });
  });
});
