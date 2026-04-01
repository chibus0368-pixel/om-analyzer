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

    if (body.confirmText !== "DELETE") {
      return NextResponse.json({ error: 'confirmText must be "DELETE"' }, { status: 400 });
    }

    const db = getAdminDb();
    const now = Timestamp.now();

    // Mark user as deleted
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await userRef.update({ accountStatus: "deleted", updatedAt: now });

    // Write auth event
    await db.collection("auth_events").add({
      uid,
      event: "account_deleted",
      timestamp: now,
      metadata: {
        ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
