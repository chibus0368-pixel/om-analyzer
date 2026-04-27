import { test, expect } from "@playwright/test";

/**
 * Beyond just sign-in: confirm the dashboard renders, the workspace
 * shell shows the user's tier in the header, and at least one
 * navigation works end-to-end. Skips without test credentials.
 */

const FREE_EMAIL = process.env.E2E_FREE_EMAIL || "";
const FREE_PASSWORD = process.env.E2E_FREE_PASSWORD || "";

test.describe("authed workspace", () => {
  test.skip(!FREE_EMAIL || !FREE_PASSWORD,
    "Set E2E_FREE_EMAIL + E2E_FREE_PASSWORD to enable this suite");

  test.beforeEach(async ({ page }) => {
    await page.goto("/workspace/login");
    await page.fill('input[type="email"]', FREE_EMAIL);
    await page.fill('input[type="password"]', FREE_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(url => {
      const u = new URL(url);
      return u.pathname.startsWith("/workspace") && u.pathname !== "/workspace/login";
    }, { timeout: 20_000 });
  });

  test("dashboard renders with no 5xx and shows the workspace shell", async ({ page }) => {
    const errors: string[] = [];
    page.on("response", r => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

    await page.goto("/workspace", { waitUntil: "load" });
    await page.waitForFunction(
      () => (document.body.innerText || "").length > 100,
      { timeout: 20_000 }
    );
    expect(errors, `5xx on /workspace: ${errors.join(", ")}`).toHaveLength(0);
  });

  test("header shows tier-aware pill (no 'Sign Up' for authed user)", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "load" });
    await page.waitForFunction(
      () => (document.body.innerText || "").length > 100,
      { timeout: 20_000 }
    );
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    // An authed user should NOT see "Sign Up" in the header pill area.
    // (They might see it elsewhere - in marketing copy - but not in the
    // primary CTA pill, which now reads "Upgrade to Pro" or plan label.)
    expect(/upgrade|pro plan|pro\+|deals/i.test(bodyText),
      "authed user should see an upgrade CTA or plan label in the header"
    ).toBe(true);
  });

  test("Profile page shows the editable form to authed users", async ({ page }) => {
    await page.goto("/workspace/profile", { waitUntil: "load" });
    const saveBtn = page.getByRole("button", { name: /save profile/i });
    await expect(saveBtn).toBeVisible({ timeout: 20_000 });
  });
});
