import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { PLANS } from "@/lib/stripe/config";

const ADMIN_EMAIL = "chibus0368@gmail.com";

/** Verify the caller is the admin by checking their Firebase ID token */
async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/beta-access
 * Body: { email, action: "grant" | "revoke", tier?: "pro" | "pro_plus" }
 *
 * Grants or revokes a tier directly on Firestore, bypassing Stripe. Intended
 * for beta testers and comp'd accounts (4-6 people at a time). We mark the
 * record with betaGranted=true + betaGrantedAt so we can tell Stripe-driven
 * subs apart from comp'd ones, and revoke wipes everything back to free.
 */
export async function POST(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { email, action, tier = "pro_plus" } = await req.json();
    if (!email || !action) {
      return NextResponse.json({ error: "email and action required" }, { status: 400 });
    }
    if (action !== "grant" && action !== "revoke") {
      return NextResponse.json({ error: "action must be 'grant' or 'revoke'" }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

    // Look up user by email
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch {
      return NextResponse.json({ error: `No user found for ${email}` }, { status: 404 });
    }
    const uid = userRecord.uid;

    const now = new Date();

    if (action === "grant") {
      const planConfig = PLANS[tier];
      if (!planConfig) {
        return NextResponse.json({ error: `Unknown tier: ${tier}` }, { status: 400 });
      }

      await db.collection("users").doc(uid).set({
        tier: planConfig.tier,
        tierStatus: "active",
        uploadLimit: planConfig.uploadLimit,
        uploadsUsed: 0,
        periodStart: now,
        betaGranted: true,
        betaGrantedAt: now,
        betaGrantedBy: adminUid,
        updatedAt: now,
      }, { merge: true });

      const userSnap = await db.collection("users").doc(uid).get();
      const wsId = userSnap.data()?.defaultWorkspaceId;
      if (wsId) {
        await db.collection("workspaces").doc(wsId).set({
          planTier: planConfig.tier,
          planStatus: "active",
          updatedAt: now,
        }, { merge: true });
      }

      await db.collection("billing_events").add({
        uid,
        event: "beta_access_granted",
        plan: planConfig.tier,
        grantedBy: adminUid,
        timestamp: now,
      });

      return NextResponse.json({
        success: true,
        message: `Granted ${planConfig.name} to ${email}`,
        uid,
        tier: planConfig.tier,
      });
    }

    // revoke
    const freeConfig = PLANS.free;
    await db.collection("users").doc(uid).set({
      tier: "free",
      tierStatus: "active",
      uploadLimit: freeConfig.uploadLimit,
      betaGranted: false,
      betaRevokedAt: now,
      updatedAt: now,
    }, { merge: true });

    const userSnap = await db.collection("users").doc(uid).get();
    const wsId = userSnap.data()?.defaultWorkspaceId;
    if (wsId) {
      await db.collection("workspaces").doc(wsId).set({
        planTier: "free",
        planStatus: "active",
        updatedAt: now,
      }, { merge: true });
    }

    await db.collection("billing_events").add({
      uid,
      event: "beta_access_revoked",
      revokedBy: adminUid,
      timestamp: now,
    });

    return NextResponse.json({
      success: true,
      message: `Revoked beta access for ${email}`,
      uid,
    });
  } catch (err: any) {
    console.error("[admin/beta-access] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Action failed" }, { status: 500 });
  }
}
