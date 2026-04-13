import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { getStripe } from "@/lib/stripe/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/cancel
 * Cancels the user's Stripe subscription at end of current billing period.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const subscriptionId = userData?.stripeSubscriptionId;

    if (!subscriptionId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    const stripe = getStripe();

    // Cancel at period end - user keeps access until billing period ends
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({
      success: true,
      cancelAt: subscription.cancel_at,
      currentPeriodEnd: subscription.current_period_end,
      status: subscription.status,
    });
  } catch (err: any) {
    console.error("[stripe/cancel] Error:", err);
    return NextResponse.json({ error: err.message || "Cancellation failed" }, { status: 500 });
  }
}
