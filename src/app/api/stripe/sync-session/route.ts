import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { getStripe, PLANS } from "@/lib/stripe/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/stripe/sync-session
 * Body: { sessionId: string }
 *
 * Called by the workspace layout when the user returns from Stripe checkout
 * with `?upgraded=true&session_id=...`. Fetches the checkout session + its
 * subscription directly from Stripe and writes the tier to Firestore
 * immediately, so we don't have to wait for the async `checkout.session.completed`
 * webhook to race in before the UI refreshes the tier pill.
 *
 * Idempotent - the webhook may also write the same fields, but the final
 * state is identical.
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

    const { sessionId } = await req.json();
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    // Verify the session belongs to this user
    const sessionUid = session.metadata?.firebaseUid;
    if (sessionUid && sessionUid !== uid) {
      return NextResponse.json({ error: "Session does not belong to user" }, { status: 403 });
    }

    const planKey = session.metadata?.plan;
    const planConfig = planKey ? PLANS[planKey] : null;
    if (!planConfig) {
      return NextResponse.json({ error: "Plan not found on session" }, { status: 400 });
    }

    const sub = session.subscription as any;
    const subStatus: string = sub?.status || "active";
    const tierStatus = subStatus === "trialing" ? "trialing" : "active";

    const db = getAdminDb();
    await db.collection("users").doc(uid).update({
      tier: planConfig.tier,
      tierStatus,
      stripeSubscriptionId: typeof sub === "string" ? sub : sub?.id || session.subscription,
      stripeCustomerId: session.customer as string,
      uploadLimit: planConfig.uploadLimit,
      uploadsUsed: 0,
      periodStart: new Date(),
      trialEndsAt:
        tierStatus === "trialing"
          ? new Date(Date.now() + (planConfig.trialDays || 7) * 24 * 60 * 60 * 1000)
          : null,
      updatedAt: new Date(),
    });

    // Keep default workspace in sync with the new plan
    const userSnap = await db.collection("users").doc(uid).get();
    const wsId = userSnap.data()?.defaultWorkspaceId;
    if (wsId) {
      await db.collection("workspaces").doc(wsId).update({
        planTier: planConfig.tier,
        planStatus: "active",
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({
      ok: true,
      tier: planConfig.tier,
      tierStatus,
    });
  } catch (err: any) {
    console.error("[stripe/sync-session] Error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}
