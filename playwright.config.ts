import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for DealSignals e2e tests.
 *
 * Default target is the production deploy at https://www.dealsignals.app.
 * Override via the E2E_BASE_URL env var to test a Vercel preview deploy
 * or a local dev server (`E2E_BASE_URL=http://localhost:3000 npm run test:e2e`).
 *
 * Test accounts:
 *   E2E_FREE_EMAIL    - a real signed-up free-tier account in Firebase
 *   E2E_FREE_PASSWORD - its password
 *   E2E_PRO_EMAIL     - optional: an account with an active Stripe Pro sub
 *                       (test mode subscription against your test-mode price IDs)
 *   E2E_PRO_PASSWORD  - its password
 *
 * Without the test accounts, only the anon-flow specs will run.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,            // OM uploads + parse can take ~60s
  fullyParallel: false,       // some specs share state (anon-then-signup)
  retries: 1,                 // flaky network is normal against prod
  workers: 1,                 // serialize so we don't trip rate limits
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "e2e-report" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://www.dealsignals.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
