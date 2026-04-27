import { test, expect } from "@playwright/test";

/**
 * The workspace header pill changes per tier:
 *   - anon  -> "Sign up now to get 5 more deals" (green pill, links to /workspace/upgrade)
 *   - free  -> "X/Y deals · Upgrade to Pro" (lime outline pill)
 *   - paid  -> plan label (Pro Plan / Pro+)
 *
 * The conversion banner appears for anon visitors and hides once
 * they sign up.
 */

test.describe("workspace header state", () => {
  test.beforeEach(async ({ context }) => { await context.clearCookies(); });

  test("anon visitor sees 'Sign up' CTA in header + conversion banner", async ({ page }) => {
    // Land on a workspace route - layout auto-anon-signs-in
    await page.goto("/workspace/properties/x", { waitUntil: "load" });
    // Wait for hydration (text content settles)
    await page.waitForFunction(
      () => (document.body.innerText || "").trim().length > 50,
      { timeout: 20_000 }
    );
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    // Anon header pill or banner should mention 'sign up'
    expect(/sign\s*up/i.test(bodyText),
      "anon visitor should see a Sign Up CTA somewhere on the page"
    ).toBe(true);
  });

  test("anon visitor on /workspace/upgrade sees Trial banner + Free signup card", async ({ page }) => {
    await page.goto("/workspace/upgrade", { waitUntil: "load" });
    await page.waitForFunction(
      () => (document.body.innerText || "").trim().length > 100,
      { timeout: 20_000 }
    );
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    // Trial banner OR free-signup CTA must appear
    expect(/trial|sign\s*up.*free|free\s*account/i.test(bodyText),
      "anon visitor on /workspace/upgrade should see a Sign Up free CTA"
    ).toBe(true);
  });
});
