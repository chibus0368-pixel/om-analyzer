import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const body = await request.json();

    // Validate
    const validTiers = ["pro", "team", "enterprise"];
    if (!body.intendedTier || !validTiers.includes(body.intendedTier)) {
      return NextResponse.json({ error: "Invalid intendedTier" }, { status: 400 });
    }
    const validSources = ["pricing_page", "upgrade_cta", "account_billing"];
    if (!body.source || !validSources.includes(body.source)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    const db = getAdminDb();

    // Get user's workspace
    const userSnap = await db.collection("users").doc(uid).get();
    const workspaceId = userSnap.data()?.defaultWorkspaceId || `ws_${uid}`;

    // Create billing stub
    await db.collection("billing_stubs").add({
      workspaceId,
      uid,
      intendedTier: body.intendedTier,
      intendedBillingCycle: body.intendedBillingCycle || null,
      source: body.source,
      notes: body.notes || null,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Upgrade intent error:", err);
    return NextResponse.json({ error: "Failed to record" }, { status: 500 });
  }
}
