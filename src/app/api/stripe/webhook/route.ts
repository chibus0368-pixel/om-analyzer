import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { getStripe, PLANS } from "@/lib/stripe/config";
import Stripe from "stripe";
import { sendEmail } from "@/lib/email";
import { purchaseConfirmationTemplate } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

// Disable body parsing - Stripe needs raw body for signature verification
export const runtime = "nodejs";

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events for subscription lifecycle.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error("[stripe/webhook] Missing signature or webhook secret");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("[stripe/webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getAdminDb();

  try {
    switch (event.type) {
      // ── Checkout completed → activate subscription ──────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.metadata?.firebaseUid;
        const plan = session.metadata?.plan;
        if (!uid || !plan) break;

        const planConfig = PLANS[plan];
        if (!planConfig) break;

        console.log(`[stripe/webhook] checkout.session.completed uid=${uid} plan=${plan}`);

        // Check if subscription is in trial period
        let subStatus = "active";
        try {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          if (sub.status === "trialing") subStatus = "trialing";
        } catch { /* fallback to active */ }

        await db.collection("users").doc(uid).update({
          tier: planConfig.tier,
          tierStatus: subStatus === "trialing" ? "trialing" : "active",
          stripeSubscriptionId: session.subscription as string,
          stripeCustomerId: session.customer as string,
          uploadLimit: planConfig.uploadLimit,
          uploadsUsed: 0,           // Reset on new subscription
          periodStart: new Date(),  // Start billing period tracking
          trialEndsAt: subStatus === "trialing"
            ? new Date(Date.now() + (planConfig.trialDays || 7) * 24 * 60 * 60 * 1000)
            : null,
          updatedAt: new Date(),
        });

        // Update workspace plan tier
        const userSnap = await db.collection("users").doc(uid).get();
        const wsId = userSnap.data()?.defaultWorkspaceId;
        if (wsId) {
          await db.collection("workspaces").doc(wsId).update({
            planTier: planConfig.tier,
            planStatus: "active",
            updatedAt: new Date(),
          });
        }

        // Log event
        await db.collection("billing_events").add({
          uid,
          event: "subscription_created",
          plan: planConfig.tier,
          stripeSubscriptionId: session.subscription,
          timestamp: new Date(),
        });

        // Send purchase confirmation email
        try {
          const userSnap2 = await db.collection("users").doc(uid).get();
          const userData = userSnap2.data();
          if (userData?.email) {
            const html = purchaseConfirmationTemplate({
              name: userData.fullName || userData.firstName || '',
              email: userData.email,
              plan: planConfig.tier,
              uploadLimit: planConfig.uploadLimit,
            });
            const emailResult = await sendEmail(
              userData.email,
              `Your Deal Signals ${planConfig.tier === 'pro_plus' ? 'Pro+' : 'Pro'} Subscription Is Active`,
              html
            );
            if (!emailResult.success) {
              console.warn('[stripe/webhook] Purchase confirmation email failed:', emailResult.error);
            }
          }
        } catch (emailErr) {
          // Don't fail webhook if email fails
          console.warn('[stripe/webhook] Purchase email error:', emailErr);
        }
        break;
      }

      // ── Subscription updated (upgrade/downgrade) ────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = sub.metadata?.firebaseUid;
        if (!uid) break;

        const status = sub.status;
        const priceId = sub.items.data[0]?.price.id;

        // Find plan by price ID first, then fall back to subscription metadata.
        // The metadata fallback is critical: if STRIPE_PRICE_* env vars aren't set
        // on the deployment, price matching silently fails (stripePriceId is null)
        // and the user gets downgraded to free. The metadata.plan value is set at
        // checkout creation time and lives on the Stripe subscription object, so it
        // always reflects the correct plan regardless of env var configuration.
        let matchedPlan = Object.values(PLANS).find(p => p.stripePriceId === priceId);
        if (!matchedPlan && sub.metadata?.plan) {
          matchedPlan = PLANS[sub.metadata.plan];
          if (matchedPlan) {
            console.log(`[stripe/webhook] Price ID ${priceId} not matched via env vars, resolved via subscription metadata plan="${sub.metadata.plan}"`);
          }
        }
        if (!matchedPlan) {
          console.error(`[stripe/webhook] ⚠️ Unknown price ID ${priceId} for uid=${uid}. No metadata.plan fallback. Falling back to free tier. Check STRIPE_PRICE_* env vars.`);
        }
        const tier = matchedPlan?.tier || "free";
        const uploadLimit = matchedPlan?.uploadLimit ?? PLANS.free.uploadLimit;

        let tierStatus: string;
        switch (status) {
          case "active":
            tierStatus = "active";
            break;
          case "trialing":
            tierStatus = "trialing";
            break;
          case "past_due":
            tierStatus = "past_due";
            break;
          case "canceled":
          case "unpaid":
            tierStatus = "canceled";
            break;
          default:
            tierStatus = "none";
        }

        console.log(`[stripe/webhook] subscription.updated uid=${uid} tier=${tier} status=${tierStatus}`);

        await db.collection("users").doc(uid).update({
          tier,
          tierStatus,
          uploadLimit,
          updatedAt: new Date(),
        });

        await db.collection("billing_events").add({
          uid,
          event: "subscription_updated",
          plan: tier,
          stripeStatus: status,
          timestamp: new Date(),
        });
        break;
      }

      // ── Subscription deleted (cancellation) ─────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = sub.metadata?.firebaseUid;
        if (!uid) break;

        console.log(`[stripe/webhook] subscription.deleted uid=${uid}`);

        await db.collection("users").doc(uid).update({
          tier: "free",
          tierStatus: "canceled",
          stripeSubscriptionId: null,
          uploadLimit: PLANS.free.uploadLimit, // 5 (lifetime)
          trialEndsAt: null,
          updatedAt: new Date(),
        });

        const userSnap = await db.collection("users").doc(uid).get();
        const wsId = userSnap.data()?.defaultWorkspaceId;
        if (wsId) {
          await db.collection("workspaces").doc(wsId).update({
            planTier: "free",
            planStatus: "canceled",
            updatedAt: new Date(),
          });
        }

        await db.collection("billing_events").add({
          uid,
          event: "subscription_canceled",
          timestamp: new Date(),
        });
        break;
      }

      // ── Invoice paid (subscription renewal) → reset monthly usage ──
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Only reset on renewal invoices (not first payment)
        if (invoice.billing_reason === "subscription_cycle") {
          const userSnap = await db.collection("users")
            .where("stripeCustomerId", "==", customerId)
            .limit(1)
            .get();

          if (!userSnap.empty) {
            const uid = userSnap.docs[0].id;
            console.log(`[stripe/webhook] invoice.paid (renewal) uid=${uid} - resetting monthly usage`);

            await db.collection("users").doc(uid).update({
              uploadsUsed: 0,
              periodStart: new Date(),
              tierStatus: "active",
              updatedAt: new Date(),
            });

            await db.collection("billing_events").add({
              uid,
              event: "period_reset",
              reason: "invoice_paid_renewal",
              timestamp: new Date(),
            });
          }
        }
        break;
      }

      // ── Invoice payment failed ──────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find user by Stripe customer ID
        const userSnap = await db.collection("users")
          .where("stripeCustomerId", "==", customerId)
          .limit(1)
          .get();

        if (!userSnap.empty) {
          const uid = userSnap.docs[0].id;
          console.log(`[stripe/webhook] invoice.payment_failed uid=${uid}`);

          await db.collection("users").doc(uid).update({
            tierStatus: "past_due",
            updatedAt: new Date(),
          });

          await db.collection("billing_events").add({
            uid,
            event: "payment_failed",
            timestamp: new Date(),
          });
        }
        break;
      }

      default:
        console.log(`[stripe/webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[stripe/webhook] Processing error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
