import { test, expect } from "@playwright/test";

/**
 * Server-side guards. These hit the API directly (no browser), so they
 * run in seconds. They check that auth-required routes don't accidentally
 * leak to unauthenticated callers.
 */

test.describe("server guards", () => {
  test("POST /api/stripe/checkout without auth returns 4xx (not 200)", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", { data: { plan: "pro" } });
    expect(res.status(), "unauth checkout must NOT succeed").not.toBe(200);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/stripe/checkout with bogus token returns 4xx", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      headers: { Authorization: "Bearer not-a-real-token" },
      data: { plan: "pro" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("POST /api/om-analyzer/email-claim with empty body is rejected", async ({ request }) => {
    const res = await request.post("/api/om-analyzer/email-claim", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("public /api/share/[id] returns 404 for unknown shareId", async ({ request }) => {
    const res = await request.get("/api/share/totally-fake-share-id-xyz");
    // Could be 404 or 410 (expired); both are 'no such share' answers.
    expect([404, 410]).toContain(res.status());
  });
});

test.describe("usage API", () => {
  test("GET /api/workspace/usage with no auth and no anonId returns 401", async ({ request }) => {
    const res = await request.get("/api/workspace/usage");
    expect(res.status()).toBe(401);
  });

  test("GET /api/workspace/usage?anonId=test returns anon tier shape", async ({ request }) => {
    const res = await request.get("/api/workspace/usage?anonId=e2e-fake-anon-id-for-testing");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.tier).toMatch(/anonymous|lead/);
    expect(typeof data.uploadLimit).toBe("number");
    expect(data.uploadLimit).toBeGreaterThanOrEqual(1);
    expect(typeof data.uploadsUsed).toBe("number");
    expect(data.isAnonymous).toBe(true);
  });
});
