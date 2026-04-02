import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { getStripe, PLANS } from "@/lib/stripe/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for the given plan.
 *
 * Body: { plan: "pro" | "pro_plus" }
 * Headers: Authorization: Bearer <firebase-id-token>
 */
export async function POST(req: NextRequest) {
  try {
    // ── Authenticate ───────────────────────────────────────
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // ── Validate plan ──────────────────────────────────────
    const { plan } = await req.json();
    const planConfig = PLANS[plan];
    if (!planConfig || !planConfig.stripePriceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // ── Get or create Stripe customer ──────────────────────
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const stripe = getStripe();
    let customerId = userData.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.fullName || undefined,
        metadata: { firebaseUid: uid },
      });
      customerId = customer.id;
      await db.collection("users").doc(uid).update({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      });
    }

    // ── Check for existing active subscription ─────────────
    if (userData.stripeSubscriptionId) {
      // User already has a subscription — redirect to portal instead
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://www.dealsignals.app"}/workspace`,
      });
      return NextResponse.json({ url: portalSession.url, type: "portal" });
    }

    // ── Create Checkout Session ────────────────────────────
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://www.dealsignals.app"}/workspace?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://www.dealsignals.app"}/pricing`,
      subscription_data: {
        metadata: { firebaseUid: uid, plan: planConfig.id },
      },
      metadata: { firebaseUid: uid, plan: planConfig.id },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url, type: "checkout" });
  } catch (err: any) {
    console.error("[stripe/checkout] Error:", err);
    return NextResponse.json({ error: err.message || "Checkout failed" }, { status: 500 });
  }
}
