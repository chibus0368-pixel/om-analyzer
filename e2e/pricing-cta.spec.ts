import { test, expect } from "@playwright/test";

/**
 * The public /pricing page has three CTAs (Trial -> /om-analyzer,
 * Free -> /workspace/login?signup=1, Pro -> /workspace/login?upgrade=pro).
 * Verify each links to the right place so a regression doesn't silently
 * break the marketing funnel.
 */

test.describe("pricing CTAs", () => {
  test("Trial card has a link to /om-analyzer", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "load" });
    // Wait for hydration so DOM is fully rendered
    await page.waitForFunction(
      () => (document.body.innerText || "").length > 100,
      { timeout: 15_000 }
    );
    // Match by href attribute - more robust than accessible name
    const link = page.locator('a[href*="/om-analyzer"]').first();
    await expect(link).toBeVisible({ timeout: 10_000 });
  });

  test("Free card has a link to /workspace/login (signup mode)", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "load" });
    await page.waitForFunction(
      () => (document.body.innerText || "").length > 100,
      { timeout: 15_000 }
    );
    // Find any login link with the register/signup query param
    const links = await page.locator('a[href*="/workspace/login"]').all();
    const hrefs = await Promise.all(links.map(l => l.getAttribute("href")));
    const registerLink = hrefs.find(h => h && /mode=register|signup=1/.test(h));
    expect(registerLink, `expected at least one login link with mode=register or signup=1, got: ${hrefs.join(", ")}`).toBeTruthy();
  });

  test("Pro card has a link to /workspace/login with upgrade=pro", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "load" });
    await page.waitForFunction(
      () => (document.body.innerText || "").length > 100,
      { timeout: 15_000 }
    );
    const links = await page.locator('a[href*="/workspace/login"]').all();
    const hrefs = await Promise.all(links.map(l => l.getAttribute("href")));
    const upgradeLink = hrefs.find(h => h && h.includes("upgrade=pro"));
    expect(upgradeLink, `expected a login link with upgrade=pro, got: ${hrefs.join(", ")}`).toBeTruthy();
  });
});
