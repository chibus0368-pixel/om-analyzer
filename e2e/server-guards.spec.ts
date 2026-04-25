import { test, expect } from "@playwright/test";

/**
 * Server-side guards that protect against client bugs.
 *
 * These tests don't need any real auth - they just hit the public API
 * surface and confirm the right errors come back. Fast and deterministic.
 */

test.describe("server guards", () => {
  test("POST /api/stripe/checkout rejects unauthenticated requests with 401", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      data: { plan: "pro" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/stripe/checkout with a bogus token returns 401, not 200", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      headers: { Authorization: "Bearer not-a-real-token" },
      data: { plan: "pro" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/om-analyzer/email-claim requires anonId + email", async ({ request }) => {
    const res = await request.post("/api/om-analyzer/email-claim", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/om-analyzer/email-claim rejects invalid emails", async ({ request }) => {
    const res = await request.post("/api/om-analyzer/email-claim", {
      data: { anonId: "test-anon-id", email: "not-an-email" },
    });
    expect(res.status()).toBe(400);
  });

  test("public /api/share/[id] returns 404 for unknown shareId", async ({ request }) => {
    const res = await request.get("/api/share/totally-fake-share-id-xyz");
    expect(res.status()).toBe(404);
  });
});
