import { test, expect } from "@playwright/test";
import path from "path";

/**
 * The core trial flow that every beta visitor will exercise:
 *   1. Land on /om-analyzer (no auth)
 *   2. Drop a file
 *   3. Click Analyze
 *   4. Land on /workspace/properties/[id] (the real Pro page)
 *
 * Uses a small synthetic OM in TXT form (the parser accepts it).
 * Skips if anon Firebase auth is not enabled in production.
 */

const SAMPLE_OM = path.join(__dirname, "fixtures", "sample-om.txt");

test.describe("trial upload end-to-end", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("anon visitor: drop OM on /om-analyzer -> /workspace/properties/[id]", async ({ page }) => {
    // 90-second test timeout - the parse + score pipeline takes ~30-60s
    test.setTimeout(120_000);

    await page.goto("/om-analyzer", { waitUntil: "load" });
    // Wait for the marketing page to hydrate.
    await page.waitForFunction(
      () => (document.body.innerText || "").length > 200,
      { timeout: 15_000 }
    );

    // The page has at least one file input. Find the first one and attach.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SAMPLE_OM);

    // The Analyze CTA appears once a file is selected. Actual label is
    // "Get Deal Signal" - keep the regex permissive in case copy changes.
    const analyzeBtn = page.getByRole("button", { name: /get.*deal.*signal|analyze|start|submit/i }).first();
    await analyzeBtn.waitFor({ state: "visible", timeout: 15_000 });
    await analyzeBtn.click();

    // Either we land on /workspace/properties/[id] (success path), or the
    // anon auth fallback kicks us to the inline result view. The success
    // path is what we want to validate.
    await page.waitForURL(/\/workspace\/properties\//, { timeout: 90_000 });
    expect(page.url()).toMatch(/\/workspace\/properties\/[a-zA-Z0-9_-]+/);

    // Page should render the property name or address somewhere.
    await page.waitForFunction(
      () => (document.body.innerText || "").length > 200,
      { timeout: 30_000 }
    );
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(/west\s*bend|property|score|deal/i.test(bodyText),
      "property page should render some content"
    ).toBe(true);
  });
});
