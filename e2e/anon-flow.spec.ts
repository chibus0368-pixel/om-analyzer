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
    await page.goto("/workspace/login?mode=register", { waitUntil: "domcontentloaded" });
    // The page must contain SOMETHING - black-screen bug returned null,
    // which would leave the body empty.
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length, "register page rendered empty (black screen regression)").toBeGreaterThan(50);
    // And specifically should reference creating an account or registering
    await expect(page.locator("body")).toContainText(/create\s*account|register|sign\s*up/i, { timeout: 10_000 });
  });

  test("/workspace/profile does not show editable profile form to anon visitors", async ({ page }) => {
    await page.goto("/workspace/profile", { waitUntil: "domcontentloaded" });
    const url = page.url();
    const bodyText = (await page.locator("body").innerText()).toLowerCase();

    // Acceptable outcomes:
    //   (a) Redirected to /workspace/login (anon auth disabled OR our auto-
    //       anon redirect to register fired)
    //   (b) Showing the trial empty state (anon auth worked + we caught it)
    // Unacceptable: showing the editable profile form (which would have
    // 'first name' / 'last name' / 'save profile' etc. as input labels).
    const onLoginPage = /\/workspace\/login/.test(url);
    const showsTrialEmptyState = /trial|sign\s*up|register/i.test(bodyText);
    const hasEditableForm = /first\s*name.*last\s*name|save\s+profile|company/.test(bodyText);

    expect(
      (onLoginPage || showsTrialEmptyState) && !hasEditableForm,
      `Anon profile must redirect/show empty state, not the editable form. URL: ${url}, hasForm=${hasEditableForm}`
    ).toBe(true);
  });

  test("workspace property URL renders something (anon-signed-in OR bounced gracefully)", async ({ page }) => {
    await page.goto("/workspace/properties/anon-test-id-no-such-prop", { waitUntil: "domcontentloaded" });
    // Two acceptable outcomes:
    //   (a) Auto-anon-sign-in worked - we're on the property page (or got
    //       a 404 view of it). URL stays on /workspace/properties/...
    //   (b) Anon auth not available - layout falls back to /workspace/login.
    // Unacceptable: hard error page, infinite spinner, or hung blank screen.
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length, "page rendered empty - probably crashed").toBeGreaterThan(50);
  });
});
