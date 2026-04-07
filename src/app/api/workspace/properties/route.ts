import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getAdminAuth } from "@/lib/firebase-admin";

/**
 * Server-side property fetching using Admin SDK.
 * This bypasses Firestore security rules which block client-side reads
 * on workspace_properties (no rules defined for that collection).
 */
export async function GET(req: NextRequest) {
  try {
    // Verify auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const userId = decoded.uid;

    const workspaceId = req.nextUrl.searchParams.get("workspaceId") || "default";

    const db = getAdminDb();
    const snap = await db.collection("workspace_properties")
      .where("userId", "==", userId)
      .get();

    let properties = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Filter by workspaceId — strict filtering, no fallback
    if (workspaceId === "default") {
      properties = properties.filter(p => !p.workspaceId || p.workspaceId === "default");
    } else {
      properties = properties.filter(p => p.workspaceId === workspaceId);
    }

    // Sort by propertyName
    properties.sort((a: any, b: any) => (a.propertyName || "").localeCompare(b.propertyName || ""));

    return NextResponse.json({ properties, total: properties.length });
  } catch (err: any) {
    console.error("[properties API] Error:", err.message);
    if (err.code === "auth/id-token-expired" || err.code === "auth/argument-error") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch properties" }, { status: 500 });
  }
}
