import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { LEAD_LIMIT } from "@/lib/stripe/config";

/**
 * POST /api/om-analyzer/email-claim
 *
 * Anonymous lead capture. Trades an email address for a higher upload
 * quota without requiring a real account. The trial user keeps using
 * their existing anonId; we just promote their anonymous_trials doc
 * from tier="anonymous" (limit 1) to tier="lead" (limit LEAD_LIMIT).
 *
 * Idempotent: re-submitting the same email or anonId is a no-op when
 * the doc is already at tier="lead". The first valid email wins; we do
 * not overwrite a previously-captured email.
 *
 * Body: { anonId: string, email: string }
 * Response: { uploadsUsed, uploadLimit, tier, emailCaptured: true }
 */

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const anonId = typeof body.anonId === "string" ? body.anonId.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!anonId) {
      return NextResponse.json({ error: "anonId is required" }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("anonymous_trials").doc(anonId);
    const snap = await ref.get();
    const existing = snap.data() || {};

    // Idempotent promote. Keep the original email if one was already captured
    // (avoids letting a second visitor on the same browser overwrite the
    // first person's email association).
    const finalEmail = existing.email || email;
    const now = new Date();

    await ref.set({
      uploadsUsed: existing.uploadsUsed || 0,
      tier: "lead",
      email: finalEmail,
      // Always record this submission separately so we can audit churn /
      // multiple captures on the same browser later if needed.
      lastEmailSubmittedAt: now,
      lastEmailSubmitted: email,
      createdAt: snap.exists ? existing.createdAt : now,
      updatedAt: now,
    }, { merge: true });

    return NextResponse.json({
      uploadsUsed: existing.uploadsUsed || 0,
      uploadLimit: LEAD_LIMIT,
      tier: "lead",
      emailCaptured: true,
    });
  } catch (err: any) {
    console.error("[email-claim] Error:", err);
    return NextResponse.json({ error: err?.message || "Failed to claim email" }, { status: 500 });
  }
}
