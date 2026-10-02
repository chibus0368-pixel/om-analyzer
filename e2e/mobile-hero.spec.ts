import { test, expect } from "@playwright/test";

/**
 * Mobile above-the-fold check for the homepage hero. 390x664 is the visible
 * area in iPhone Safari (390x844 minus the browser bars). The upload button
 * and the "See a sample result" link both have to be reachable without
 * scrolling. utm_source=test keeps this visit out of the usage reports.
 */
test.describe("mobile hero", () => {
  test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });

  test("Select File and the sample link sit above the fold", async ({ page }) => {
    await page.goto("/?utm_source=test&utm_campaign=e2e&utm_content=mobile_hero", { waitUntil: "load" });

    const selectFile = page.getByRole("button", { name: "Select File" });
    const sample = page.getByRole("link", { name: /See a sample result/i });
    await expect(selectFile).toBeVisible({ timeout: 15_000 });
    await expect(sample).toBeVisible();

    for (const [name, loc] of [["Select File", selectFile], ["sample link", sample]] as const) {
      const box = await loc.boundingBox();
      expect(box, `${name} has a layout box`).not.toBeNull();
      expect(box!.y, `${name} top is on screen`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `${name} bottom edge is within 664px`).toBeLessThanOrEqual(664);
    }

    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/workspace/login?mode=register");
  });
});
