import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { getUploadLimit, ANONYMOUS_LIMIT, LEAD_LIMIT, PLANS } from "@/lib/stripe/config";

export const dynamic = "force-dynamic";

/**
 * Check if the usage period has rolled over (monthly reset).
 * Returns true if uploadsUsed should be reset to 0.
 *
 * Period logic:
 * - If user has a Stripe subscription, use currentPeriodStart from sub
 * - Otherwise, use the periodStart field from the user doc
 * - If no periodStart exists, the current month boundary is used
 */
function shouldResetPeriod(userData: any): boolean {
  const now = new Date();
  const periodStart = userData.periodStart
    ? (userData.periodStart.toDate ? userData.periodStart.toDate() : new Date(userData.periodStart))
    : null;

  if (!periodStart) return false; // First time - will be set on first increment

  // Check if we're in a new calendar month relative to periodStart
  const periodMonth = periodStart.getUTCFullYear() * 12 + periodStart.getUTCMonth();
  const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();

  return currentMonth > periodMonth;
}

/**
 * GET /api/workspace/usage
 * Returns the user's current upload count and limit.
 * Automatically detects period rollover and resets count.
 *
 * Headers: Authorization: Bearer <firebase-id-token>
 * Also supports anonymous usage via ?anonId=<id> for trial tracking.
 */
export async function GET(req: NextRequest) {
  try {
    const db = getAdminDb();
    const { searchParams } = new URL(req.url);
    const anonId = searchParams.get("anonId");

    // ── Anonymous user ──────────────────────────────────────
    if (anonId) {
      const anonDoc = await db.collection("anonymous_trials").doc(anonId).get();
      const data = anonDoc.data();
      // Email-claimed users get tier="lead" with LEAD_LIMIT, otherwise anonymous.
      const docTier = data?.tier === "lead" ? "lead" : "anonymous";
      const docLimit = docTier === "lead" ? LEAD_LIMIT : ANONYMOUS_LIMIT;
      return NextResponse.json({
        uploadsUsed: data?.uploadsUsed || 0,
        uploadLimit: docLimit,
        tier: docTier,
        tierStatus: "none",
        isAnonymous: true,
        emailCaptured: Boolean(data?.email),
      });
    }

    // ── Authenticated user ──────────────────────────────────
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const isFirebaseAnon = (decoded.firebase?.sign_in_provider === "anonymous");

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    let userData = userDoc.data();

    // Auto-provision anonymous Firebase users on first read so the workspace
    // shell can render their tier/usage without a 404. Mirrors the
    // provisioning in tryme-analyze for users who arrive by upload.
    if (!userData && isFirebaseAnon) {
      const provisionNow = new Date().toISOString();
      const newDoc = {
        uid,
        tier: "anonymous",
        tierStatus: "none",
        uploadsUsed: 0,
        uploadLimit: 2,
        isLifetimeLimit: true,
        isAnonymous: true,
        authProviders: ["anonymous"],
        primaryProvider: "anonymous",
        accountStatus: "active",
        email: null,
        fullName: null,
        displayName: "Anonymous user",
        defaultWorkspaceId: null,
        createdAt: provisionNow,
        updatedAt: provisionNow,
      };
      await userRef.set(newDoc);
      userData = newDoc;
    }

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tier = userData.tier || "free";
    const tierStatus = userData.tierStatus || "none";
    let uploadsUsed = userData.uploadsUsed || 0;
    let uploadLimit = userData.uploadLimit || getUploadLimit(tier);

    // ── Backfill: if a paid user's stored uploadLimit is lower than the
    // current plan's configured limit (e.g. after a plan-wide quota bump
    // like Pro+ 200 → 500), sync the stored value up to the new limit so
    // existing subscribers get the upgrade without waiting for their
    // next Stripe webhook. Never silently downgrade an existing limit.
    const configuredLimit = getUploadLimit(tier);
    if ((tier === "pro" || tier === "pro_plus") && uploadLimit < configuredLimit) {
      uploadLimit = configuredLimit;
      // Fire-and-forget: don't block the response on a backfill write.
      // Next fetch will see the updated value; if this particular write
      // fails it'll just retry on the subsequent request.
      userRef.update({ uploadLimit, updatedAt: new Date() }).catch((e) => {
        console.warn("[usage] backfill update failed:", e?.message);
      });
    }

    // ── Auto-reset if new billing period (paid users only) ──
    // Free tier has a lifetime limit (no monthly reset)
    const planConfig = PLANS[tier];
    const isLifetime = planConfig?.isLifetimeLimit ?? (tier === "free");

    if (!isLifetime && (tier === "pro" || tier === "pro_plus" || tier === "free") && shouldResetPeriod(userData)) {
      uploadsUsed = 0;
      // Persist the reset so it only happens once per period
      await userRef.update({
        uploadsUsed: 0,
        periodStart: new Date(),
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({
      uploadsUsed,
      uploadLimit,
      tier,
      tierStatus,
      isAnonymous: false,
      isLifetimeLimit: isLifetime,
      stripeSubscriptionId: userData.stripeSubscriptionId || null,
    });
  } catch (err: any) {
    console.error("[usage] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/workspace/usage
 * Increment upload count after successful analysis.
 * Sets periodStart on first increment if missing.
 * Auto-resets count if period has rolled over.
 *
 * Body: { anonId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const db = getAdminDb();
    const body = await req.json().catch(() => ({}));

    // ── Anonymous increment ─────────────────────────────────
    if (body.anonId) {
      const ref = db.collection("anonymous_trials").doc(body.anonId);
      const doc = await ref.get();
      const data = doc.data() || {};
      const current = data.uploadsUsed || 0;
      // Per-doc tier so email-claimed leads keep their bumped limit.
      const docTier = data.tier === "lead" ? "lead" : "anonymous";
      const docLimit = docTier === "lead" ? LEAD_LIMIT : ANONYMOUS_LIMIT;

      if (current >= docLimit) {
        // Anonymous hits prompt the email gate; lead hits prompt full signup.
        const emailGate = docTier === "anonymous";
        return NextResponse.json({
          error: emailGate
            ? "Add your email to keep analyzing deals"
            : "Create a free account to keep analyzing deals",
          upgradeRequired: true,
          emailGate,
          signupRequired: !emailGate,
          tier: docTier,
        }, { status: 403 });
      }

      await ref.set({
        uploadsUsed: current + 1,
        lastUploadAt: new Date(),
        createdAt: doc.exists ? data.createdAt : new Date(),
        updatedAt: new Date(),
      }, { merge: true });

      return NextResponse.json({ uploadsUsed: current + 1, uploadLimit: docLimit, tier: docTier });
    }

    // ── Authenticated increment ─────────────────────────────
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const isFirebaseAnon = (decoded.firebase?.sign_in_provider === "anonymous");

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    let userData = userDoc.data();

    // Auto-provision anonymous Firebase users on first read so the workspace
    // shell can render their tier/usage without a 404. Mirrors the
    // provisioning in tryme-analyze for users who arrive by upload.
    if (!userData && isFirebaseAnon) {
      const provisionNow = new Date().toISOString();
      const newDoc = {
        uid,
        tier: "anonymous",
        tierStatus: "none",
        uploadsUsed: 0,
        uploadLimit: 2,
        isLifetimeLimit: true,
        isAnonymous: true,
        authProviders: ["anonymous"],
        primaryProvider: "anonymous",
        accountStatus: "active",
        email: null,
        fullName: null,
        displayName: "Anonymous user",
        defaultWorkspaceId: null,
        createdAt: provisionNow,
        updatedAt: provisionNow,
      };
      await userRef.set(newDoc);
      userData = newDoc;
    }

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tier = userData.tier || "free";
    const uploadLimit = userData.uploadLimit || getUploadLimit(tier);
    let currentUsed = userData.uploadsUsed || 0;

    // ── Auto-reset if new billing period (paid users only, not free lifetime) ──
    const postPlanConfig = PLANS[tier];
    const postIsLifetime = postPlanConfig?.isLifetimeLimit ?? (tier === "free");
    if (!postIsLifetime && (tier === "pro" || tier === "pro_plus" || tier === "free") && shouldResetPeriod(userData)) {
      currentUsed = 0;
    }

    const uploadsUsed = currentUsed + 1;

    if (uploadsUsed > uploadLimit) {
      return NextResponse.json({ error: "Upload limit reached", upgradeRequired: true }, { status: 403 });
    }

    // Set periodStart if missing (first upload ever, or after reset)
    const updateData: any = {
      uploadsUsed,
      updatedAt: new Date(),
    };
    if (!userData.periodStart || shouldResetPeriod(userData)) {
      updateData.periodStart = new Date();
    }

    await userRef.update(updateData);

    return NextResponse.json({ uploadsUsed, uploadLimit });
  } catch (err: any) {
    console.error("[usage] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
