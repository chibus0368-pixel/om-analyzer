import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { getStripe, PLANS } from "@/lib/stripe/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/stripe/sync-subscription
 *
 * Self-healing endpoint: reads the user's actual Stripe subscription and
 * re-syncs the Firestore tier/status. Fixes drift caused by missed or
 * mis-matched webhooks (e.g. STRIPE_PRICE_* env vars not set, causing
 * the subscription.updated webhook to fall back to "free").
 *
 * Called by the workspace layout on mount when the UI detects a possible
 * mismatch (e.g. stripeSubscriptionId exists but tier is "free").
 *
 * No body required - reads stripeSubscriptionId from the user doc.
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
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const subId = userData.stripeSubscriptionId;
    if (!subId) {
      return NextResponse.json({ ok: true, tier: "free", reason: "no_subscription" });
    }

    const stripe = getStripe();
    let sub;
    try {
      sub = await stripe.subscriptions.retrieve(subId);
    } catch (err: any) {
      // Subscription deleted or invalid - revert to free
      if (err?.statusCode === 404 || err?.code === "resource_missing") {
        await userRef.update({
          tier: "free",
          tierStatus: "canceled",
          stripeSubscriptionId: null,
          uploadLimit: PLANS.free.uploadLimit,
          updatedAt: new Date(),
        });
        return NextResponse.json({ ok: true, tier: "free", reason: "subscription_not_found" });
      }
      throw err;
    }

    // Resolve plan: try price matching first, then metadata fallback
    const priceId = sub.items.data[0]?.price.id;
    let matchedPlan = Object.values(PLANS).find(p => p.stripePriceId === priceId);

    if (!matchedPlan && sub.metadata?.plan) {
      matchedPlan = PLANS[sub.metadata.plan];
    }

    // Last resort: match by price amount (monthly)
    if (!matchedPlan && priceId) {
      try {
        const price = await stripe.prices.retrieve(priceId);
        const amountDollars = (price.unit_amount || 0) / 100;
        matchedPlan = Object.values(PLANS).find(p => p.priceMonthly === amountDollars && p.tier !== "free");
      } catch {
        // ignore price lookup failure
      }
    }

    if (!matchedPlan) {
      console.error(`[stripe/sync-subscription] Could not resolve plan for uid=${uid} priceId=${priceId} metadata.plan=${sub.metadata?.plan}`);
      return NextResponse.json({ ok: false, error: "Could not resolve plan from Stripe subscription" }, { status: 400 });
    }

    // Determine status
    let tierStatus: string;
    switch (sub.status) {
      case "active": tierStatus = "active"; break;
      case "trialing": tierStatus = "trialing"; break;
      case "past_due": tierStatus = "past_due"; break;
      case "canceled":
      case "unpaid": tierStatus = "canceled"; break;
      default: tierStatus = "none";
    }

    const tier = (sub.status === "canceled" || sub.status === "unpaid")
      ? "free"
      : matchedPlan.tier;
    const uploadLimit = (tier === "free")
      ? PLANS.free.uploadLimit
      : matchedPlan.uploadLimit;

    // Write corrected tier to Firestore
    await userRef.update({
      tier,
      tierStatus,
      uploadLimit,
      stripeCustomerId: sub.customer as string,
      updatedAt: new Date(),
    });

    console.log(`[stripe/sync-subscription] Synced uid=${uid} tier=${tier} status=${tierStatus} (priceId=${priceId}, metadata.plan=${sub.metadata?.plan})`);

    // Log the correction event
    await db.collection("billing_events").add({
      uid,
      event: "subscription_synced",
      plan: tier,
      stripeStatus: sub.status,
      priceId,
      metadataPlan: sub.metadata?.plan || null,
      timestamp: new Date(),
    });

    return NextResponse.json({
      ok: true,
      tier,
      tierStatus,
      uploadLimit,
      reason: "synced_from_stripe",
    });
  } catch (err: any) {
    console.error("[stripe/sync-subscription] Error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
