import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { getAdminDb } from "@/lib/firebase-admin";

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
 * GET /api/admin/users - list all users with dealboard counts and billing info
 */
export async function GET(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const auth = getAdminAuth();
    const db = getAdminDb();

    // List all Firebase Auth users (paginated, up to 1000)
    const listResult = await auth.listUsers(1000);

    // Get all workspace data in parallel
    // Tier/subscription lives on the "users" collection (doc ID = uid), NOT a separate subscriptions collection
    const [workspacesSnap, propertiesSnap, usersSnap] = await Promise.all([
      db.collection("workspaces").get(),
      db.collection("workspace_properties").get(),
      db.collection("users").get(),
    ]);

    // Build lookup maps
    const workspacesByUser = new Map<string, number>();
    const dealsByUser = new Map<string, number>();
    const subsByUser = new Map<string, any>();

    workspacesSnap.docs.forEach(doc => {
      const d = doc.data();
      const uid = d.userId || d.ownerId;
      if (uid) workspacesByUser.set(uid, (workspacesByUser.get(uid) || 0) + 1);
    });

    propertiesSnap.docs.forEach(doc => {
      const d = doc.data();
      const uid = d.userId || d.ownerId;
      if (uid) dealsByUser.set(uid, (dealsByUser.get(uid) || 0) + 1);
    });

    usersSnap.docs.forEach(doc => {
      const d = doc.data();
      const uid = doc.id;
      subsByUser.set(uid, {
        tier: d.tier || "free",
        status: d.tierStatus || "active",
        stripeCustomerId: d.stripeCustomerId || null,
        stripeSubscriptionId: d.stripeSubscriptionId || null,
        stripePriceId: d.stripePriceId || null,
        currentPeriodStart: d.currentPeriodStart || null,
        currentPeriodEnd: d.currentPeriodEnd || null,
        uploadsUsed: d.uploadsUsed || 0,
        uploadLimit: d.uploadLimit || 0,
        cancelAtPeriodEnd: d.cancelAtPeriodEnd || false,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
      });
    });

    // Anonymous Firebase users (trial visitors) have an empty
    // providerData array. Pull them out of the main users list so the
    // admin table only shows registered accounts. We still surface
    // their count + activity as an aggregate stat for analytics.
    const allUsers = listResult.users.map(u => {
      const isAnon = !u.providerData || u.providerData.length === 0;
      return {
        uid: u.uid,
        email: u.email || "",
        displayName: u.displayName || "",
        photoURL: u.photoURL || "",
        createdAt: u.metadata.creationTime || "",
        lastSignIn: u.metadata.lastSignInTime || "",
        provider: isAnon ? "anonymous" : (u.providerData?.[0]?.providerId || "email"),
        isAnonymous: isAnon,
        disabled: u.disabled,
        dealboards: workspacesByUser.get(u.uid) || 0,
        deals: dealsByUser.get(u.uid) || 0,
        subscription: subsByUser.get(u.uid) || { tier: "free", status: "active" },
      };
    });

    const users = allUsers.filter(u => !u.isAnonymous);
    const anonymous = allUsers.filter(u => u.isAnonymous);

    // Sort by most recent sign-in first
    users.sort((a, b) => new Date(b.lastSignIn).getTime() - new Date(a.lastSignIn).getTime());
    anonymous.sort((a, b) => new Date(b.lastSignIn).getTime() - new Date(a.lastSignIn).getTime());

    // Anon analytics summary - what we actually care about for trial
    // visitors: how many, how many uploaded a deal, how many converted
    // (we can\'t know that here, but we can show recent activity).
    const anonStats = {
      total: anonymous.length,
      withDeals: anonymous.filter(a => a.deals > 0).length,
      activeLast24h: anonymous.filter(a => {
        const last = new Date(a.lastSignIn).getTime();
        return last && Date.now() - last < 24 * 60 * 60 * 1000;
      }).length,
      activeLast7d: anonymous.filter(a => {
        const last = new Date(a.lastSignIn).getTime();
        return last && Date.now() - last < 7 * 24 * 60 * 60 * 1000;
      }).length,
    };

    return NextResponse.json({
      users,
      total: users.length,
      anonymous,        // full list available if the UI wants it
      anonStats,        // summary for the dashboard tile
    });
  } catch (err: any) {
    console.error("[admin/users] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to list users" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users - disable/enable or delete a user
 * Body: { uid, action: "disable" | "enable" | "delete" }
 */
export async function PATCH(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { uid, action } = await req.json();
    if (!uid || !action) {
      return NextResponse.json({ error: "uid and action required" }, { status: 400 });
    }

    const auth = getAdminAuth();

    if (action === "disable") {
      await auth.updateUser(uid, { disabled: true });
      return NextResponse.json({ success: true, message: "User disabled" });
    }

    if (action === "enable") {
      await auth.updateUser(uid, { disabled: false });
      return NextResponse.json({ success: true, message: "User enabled" });
    }

    if (action === "delete") {
      await auth.deleteUser(uid);
      return NextResponse.json({ success: true, message: "User deleted" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[admin/users] PATCH error:", err?.message);
    return NextResponse.json({ error: err?.message || "Action failed" }, { status: 500 });
  }
}
