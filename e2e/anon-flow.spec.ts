import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Walks an anonymous visitor through the trial flow:
 *   land on /om-analyzer -> drop OM -> processing -> property page
 *   -> header shows the right pill
 *
 * Needs a sample OM PDF at e2e/fixtures/sample-om.pdf. If the fixture
 * doesn't exist the test is skipped (so CI doesn't fail on first run).
 */

const SAMPLE_OM = path.join(__dirname, "fixtures", "sample-om.pdf");

test.describe("anon trial flow", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure each test starts with no Firebase session
    await context.clearCookies();
  });

  test("anon visitor lands on /om-analyzer and sees the upload UI", async ({ page }) => {
    await page.goto("/om-analyzer");
    // The drop zone is the easiest unique anchor.
    await expect(page.getByText(/drop|drag/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("workspace property URL auto-anon-signs-in unauth visitors", async ({ page }) => {
    // Even with no shareId/property in their account, hitting any
    // /workspace/properties/[id] URL should NOT bounce to login - the
    // layout's auto-anon-sign-in fires.
    await page.goto("/workspace/properties/this-id-does-not-exist");
    await page.waitForLoadState("networkidle");
    // We should NOT be on the login page.
    expect(page.url()).not.toContain("/workspace/login");
  });

  test("header upgrade pill links to /workspace/upgrade", async ({ page }) => {
    // Land in workspace as an anon user - any property URL works.
    await page.goto("/workspace/properties/x");
    await page.waitForLoadState("networkidle");
    // The pill text varies by tier; for an anon user it should mention "Sign up".
    const pill = page.getByRole("link", { name: /sign up/i }).first();
    await expect(pill).toBeVisible({ timeout: 15_000 });
    const href = await pill.getAttribute("href");
    expect(href).toMatch(/\/workspace\/(upgrade|login)/);
  });

  test("anon hitting /workspace/profile redirects to register form", async ({ page }) => {
    await page.goto("/workspace/profile");
    await page.waitForURL(/workspace\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("mode=register");
  });

  test("anon hitting /workspace/login?mode=register sees register form (not blank)", async ({ page }) => {
    await page.goto("/workspace/login?mode=register");
    // The "Create Account" button or one of the register-only fields
    // must be visible. Empty page would fail this.
    const registerForm = page.getByRole("button", { name: /create account/i });
    await expect(registerForm).toBeVisible({ timeout: 10_000 });
  });

  test("trial upload runs inline on /om-analyzer and lands on /workspace/properties/[id]", async ({ page }) => {
    test.skip(!await fixtureExists(SAMPLE_OM), `Skipping: drop a sample OM PDF at ${SAMPLE_OM}`);
    await page.goto("/om-analyzer");

    // Find the file input and upload our sample
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SAMPLE_OM);

    // Click whatever the analyze/submit button is
    const analyzeBtn = page.getByRole("button", { name: /analyze|start|submit/i }).first();
    await analyzeBtn.click();

    // Wait for the workspace property page (this can be slow - 60s timeout)
    await page.waitForURL(/\/workspace\/properties\//, { timeout: 90_000 });
    expect(page.url()).toMatch(/\/workspace\/properties\/[a-zA-Z0-9_-]+/);

    // Sanity: the page should render some property content
    await expect(page.locator("body")).toContainText(/property|deal|score/i, { timeout: 10_000 });
  });
});

async function fixtureExists(p: string): Promise<boolean> {
  const fs = await import("fs/promises");
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
