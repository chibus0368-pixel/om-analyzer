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
    await page.waitForURL(/\/workspace(?:$|\/|\?)/, { timeout: 15_000 });
  });

  test("free user clicking 'Upgrade to Pro' on /workspace/upgrade hits Stripe checkout", async ({ page }) => {
    await page.goto("/workspace/login");
    await page.fill('input[type="email"]', FREE_EMAIL);
    await page.fill('input[type="password"]', FREE_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/workspace(?:$|\/|\?)/, { timeout: 15_000 });

    await page.goto("/workspace/upgrade");
    // Click the Pro card's CTA - "Start 7-day free trial" or "Upgrade to Pro"
    const proCta = page.getByRole("button", { name: /start.*trial|upgrade to pro/i }).first();
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
    await page.waitForURL(/\/workspace(?:$|\/|\?)/, { timeout: 15_000 });

    await page.goto("/workspace/profile");

    const newFirst = `Test${Date.now() % 10000}`;
    await page.fill('input[name="firstName"], input:near(:text("First Name"))', newFirst);
    await page.getByRole("button", { name: /save profile/i }).click();

    // Wait for the success toast
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10_000 });

    // Header should reflect the new first name within a couple seconds
    await expect(page.locator("body")).toContainText(newFirst, { timeout: 10_000 });
  });
});
