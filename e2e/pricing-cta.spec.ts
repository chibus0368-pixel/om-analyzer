import { test, expect } from "@playwright/test";

/**
 * The public /pricing page has three CTAs (Trial -> /om-analyzer,
 * Free -> /workspace/login?signup=1, Pro -> /workspace/login?upgrade=pro).
 * Verify each links to the right place so a regression doesn't silently
 * break the marketing funnel.
 */

test.describe("pricing CTAs", () => {
  test("Trial card links to /om-analyzer", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "load" });
    const link = page.getByRole("link", { name: /try it now/i }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    expect(await link.getAttribute("href")).toContain("/om-analyzer");
  });

  test("Free card links to /workspace/login (signup)", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "load" });
    const link = page.getByRole("link", { name: /sign up free/i }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    const href = await link.getAttribute("href");
    expect(href).toContain("/workspace/login");
    // Must trigger register form, not login form
    expect(href).toMatch(/mode=register|signup=1/);
  });

  test("Pro card links to /workspace/login with upgrade=pro", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "load" });
    const link = page.getByRole("link", { name: /start.*trial/i }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    const href = await link.getAttribute("href");
    expect(href).toContain("/workspace/login");
    expect(href).toContain("upgrade=pro");
  });
});
