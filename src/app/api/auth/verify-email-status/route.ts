import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(authHeader.substring(7));
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const user = await adminAuth.getUser(decodedToken.uid);

    return NextResponse.json({
      emailVerified: user.emailVerified,
      email: user.email,
    });
  } catch (err) {
    console.error("Verify email status error:", err);
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
