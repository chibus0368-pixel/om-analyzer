import { test, expect } from "@playwright/test";

/**
 * Smoke test for major workspace routes: each one renders past the
 * loading spinner and doesn't fire a 5xx. Catches the kind of full-
 * page regressions (black screens, empty bodies, server errors) that
 * the more specific tests miss.
 */

const ROUTES = [
  { path: "/om-analyzer",       expectText: /deal\s*signals|dealsignals|analyze/i },
  { path: "/pricing",           expectText: /free|pro|plan/i },
  { path: "/workspace",         expectText: /deal\s*board|dealboard|properties|workspace|upload/i },
  { path: "/workspace/upgrade", expectText: /pro|free|plan/i },
];

test.describe("workspace pages render", () => {
  for (const route of ROUTES) {
    test(`${route.path} renders without 5xx`, async ({ page }) => {
      const errors: string[] = [];
      page.on("response", r => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

      await page.goto(route.path, { waitUntil: "load" });
      // Wait for hydration / SPA content
      await page.waitForFunction(
        () => (document.body.innerText || "").trim().length > 50,
        { timeout: 20_000 }
      );
      await expect(page.locator("body")).toContainText(route.expectText, { timeout: 5_000 });
      expect(errors, `5xx responses while loading ${route.path}: ${errors.join(", ")}`).toHaveLength(0);
    });
  }
});
