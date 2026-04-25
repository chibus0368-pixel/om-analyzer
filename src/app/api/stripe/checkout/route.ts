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
// Resolve the base URL to redirect users back to after Stripe checkout/portal.
// Prefer the request's own origin so users return to whichever domain they
// started on (dealsignals.app production, a Vercel preview, or localhost),
// falling back to NEXT_PUBLIC_BASE_URL and finally the canonical production URL.
function resolveBaseUrl(req: NextRequest): string {
  try {
    const origin = req.headers.get("origin");
    if (origin && /^https?:\/\//.test(origin)) return origin;

    const referer = req.headers.get("referer");
    if (referer) {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    }

    const host = req.headers.get("host");
    if (host) {
      const proto = req.headers.get("x-forwarded-proto") || "https";
      return `${proto}://${host}`;
    }
  } catch {}
  return process.env.NEXT_PUBLIC_BASE_URL || "https://www.dealsignals.app";
}

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

    // ── Block anonymous Firebase users ─────────────────────
    // Stripe checkout needs an email + a real customer. Anonymous trial
    // users have neither. Send them through the register flow first so
    // we capture an email and create a real account before they pay.
    const isAnonFirebase = (decoded.firebase?.sign_in_provider === "anonymous");
    if (isAnonFirebase) {
      return NextResponse.json({
        error: "Sign up required",
        signupRequired: true,
        message: "Sign up free to add an email before upgrading to Pro.",
      }, { status: 403 });
    }

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
      // Determine current plan from the existing subscription
      let currentPriceId: string | null = null;
      let currentItemId: string | null = null;
      try {
        const sub = await stripe.subscriptions.retrieve(userData.stripeSubscriptionId);
        currentPriceId = sub.items.data[0]?.price.id || null;
        currentItemId = sub.items.data[0]?.id || null;
      } catch (err) {
        console.warn("[stripe/checkout] failed to retrieve existing sub, falling back to generic portal", err);
      }

      // Same plan → generic portal (manage sub, cancel, update card)
      if (currentPriceId && currentPriceId === planConfig.stripePriceId) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${resolveBaseUrl(req)}/workspace`,
        });
        return NextResponse.json({ url: portalSession.url, type: "portal" });
      }

      // Different plan → deep-link into portal plan update/confirm flow
      if (currentItemId) {
        try {
          console.log(`[stripe/checkout] attempting plan_change flow_data: uid=${uid} from=${currentPriceId} to=${planConfig.stripePriceId}`);
          const flowSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://www.dealsignals.app"}/workspace?upgraded=true`,
            flow_data: {
              type: "subscription_update_confirm",
              subscription_update_confirm: {
                subscription: userData.stripeSubscriptionId,
                items: [{ id: currentItemId, price: planConfig.stripePriceId!, quantity: 1 }],
              },
              after_completion: {
                type: "redirect",
                redirect: {
                  return_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://www.dealsignals.app"}/workspace?upgraded=true`,
                },
              },
            },
          });
          console.log(`[stripe/checkout] plan_change flow_data OK: uid=${uid}`);
          return NextResponse.json({ url: flowSession.url, type: "plan_change" });
        } catch (err: any) {
          console.error(`[stripe/checkout] flow_data plan change FAILED uid=${uid} code=${err?.code} type=${err?.type} message=${err?.message}`);
          console.error(`[stripe/checkout] ⚠️ Enable plan switching in Stripe Dashboard → Settings → Billing → Customer portal → Subscriptions → "Customers can switch plans", and add Pro + Pro+ prices to allowed products.`);
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${resolveBaseUrl(req)}/workspace`,
          });
          return NextResponse.json({ url: portalSession.url, type: "portal", fallbackReason: "plan_change_flow_unavailable" });
        }
      }

      // Fallback: generic portal
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${resolveBaseUrl(req)}/workspace`,
      });
      return NextResponse.json({ url: portalSession.url, type: "portal" });
    }

    // ── Create Checkout Session ────────────────────────────
    const subscriptionData: any = {
      metadata: { firebaseUid: uid, plan: planConfig.id },
    };

    // Add 7-day free trial (card collected upfront, auto-converts after trial)
    if (planConfig.trialDays && planConfig.trialDays > 0) {
      subscriptionData.trial_period_days = planConfig.trialDays;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
      success_url: `${resolveBaseUrl(req)}/workspace?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${resolveBaseUrl(req)}/pricing`,
      subscription_data: subscriptionData,
      metadata: { firebaseUid: uid, plan: planConfig.id },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url, type: "checkout" });
  } catch (err: any) {
    console.error("[stripe/checkout] Error:", err);
    return NextResponse.json({ error: err.message || "Checkout failed" }, { status: 500 });
  }
}
