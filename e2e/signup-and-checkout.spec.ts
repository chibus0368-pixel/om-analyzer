import { test, expect } from "@playwright/test";

/**
 * Conversion flows that need real signed-up accounts.
 *
 * Skips automatically when the env vars aren't set, so a developer
 * without test credentials can still run the rest of the suite.
 */

const FREE_EMAIL = process.env.E2E_FREE_EMAIL || "";
const FREE_PASSWORD = process.env.E2E_FREE_PASSWORD || "";

test.describe("signup + checkout flow", () => {
  test.skip(!FREE_EMAIL || !FREE_PASSWORD,
    "Set E2E_FREE_EMAIL + E2E_FREE_PASSWORD to enable this suite");

  test("free user can sign in and lands on the workspace", async ({ page }) => {
    await page.goto("/workspace/login");
    await page.fill('input[type="email"]', FREE_EMAIL);
    await page.fill('input[type="password"]', FREE_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // Wait for actual navigation AWAY from the login page. The previous
    // regex /\/workspace(?:$|\/|\?)/ matched /workspace/login itself,
    // resolving instantly without waiting for sign-in to complete.
    await page.waitForURL(url => {
      const u = new URL(url);
      return u.pathname.startsWith("/workspace") && u.pathname !== "/workspace/login";
    }, { timeout: 20_000 });
  });

  test("free user clicking 'Upgrade to Pro' on /workspace/upgrade hits Stripe checkout", async ({ page }) => {
    await page.goto("/workspace/login");
    await page.fill('input[type="email"]', FREE_EMAIL);
    await page.fill('input[type="password"]', FREE_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // Wait for actual navigation AWAY from the login page. The previous
    // regex /\/workspace(?:$|\/|\?)/ matched /workspace/login itself,
    // resolving instantly without waiting for sign-in to complete.
    await page.waitForURL(url => {
      const u = new URL(url);
      return u.pathname.startsWith("/workspace") && u.pathname !== "/workspace/login";
    }, { timeout: 20_000 });

    await page.goto("/workspace/upgrade", { waitUntil: "load" });
    // Wait for the Pro card's CTA to appear (post-hydration). Actual labels:
    //   - "Start 7-day free trial" (free user, hitting the upgrade target)
    //   - "Upgrade to Pro" (less common path)
    const proCta = page.getByRole("button", { name: /start.*trial|upgrade.*pro/i }).first();
    await proCta.waitFor({ state: "visible", timeout: 20_000 });
    await proCta.click();

    // Should redirect to checkout.stripe.com
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    expect(page.url()).toContain("checkout.stripe.com");
  });

  test("profile name save updates the header avatar", async ({ page }) => {
    await page.goto("/workspace/login");
    await page.fill('input[type="email"]', FREE_EMAIL);
    await page.fill('input[type="password"]', FREE_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // Wait for actual navigation AWAY from the login page. The previous
    // regex /\/workspace(?:$|\/|\?)/ matched /workspace/login itself,
    // resolving instantly without waiting for sign-in to complete.
    await page.waitForURL(url => {
      const u = new URL(url);
      return u.pathname.startsWith("/workspace") && u.pathname !== "/workspace/login";
    }, { timeout: 20_000 });

    await page.goto("/workspace/profile", { waitUntil: "load" });
    // Wait for the editable form to hydrate. The Save Profile button is
    // the most reliable signal that the form is fully rendered.
    const saveBtn = page.getByRole("button", { name: /save profile/i });
    await saveBtn.waitFor({ state: "visible", timeout: 20_000 });

    const newFirst = `Test${Date.now() % 10000}`;
    // Use placeholder selector - the form inputs have placeholder="First name"
    // and there's no label htmlFor association on the actual page.
    await page.getByPlaceholder(/first name/i).fill(newFirst);
    await saveBtn.click();

    // Wait for the success toast
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10_000 });

    // Header should reflect the new first name within a couple seconds
    await expect(page.locator("body")).toContainText(newFirst, { timeout: 10_000 });
  });
});
