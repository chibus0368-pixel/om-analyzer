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

    // Run the properties query and a single doc-count query in parallel.
    // The documents query is scoped to this user so we get all their
    // document rows in one round-trip and group by propertyId in memory —
    // this replaces the previous N+1 pattern where the client fetched a
    // separate document query per property card.
    const [propsSnap, docsSnap] = await Promise.all([
      db.collection("workspace_properties").where("userId", "==", userId).get(),
      db.collection("workspace_documents").where("userId", "==", userId).get().catch(() => null),
    ]);

    let properties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Filter by workspaceId — strict filtering, no fallback
    if (workspaceId === "default") {
      properties = properties.filter(p => !p.workspaceId || p.workspaceId === "default");
    } else {
      properties = properties.filter(p => p.workspaceId === workspaceId);
    }

    // Build doc-count map keyed by propertyId (exclude soft-deleted)
    const docCounts: Record<string, number> = {};
    if (docsSnap) {
      for (const d of docsSnap.docs) {
        const data = d.data() as any;
        if (data.isDeleted) continue;
        const pid = data.propertyId;
        if (!pid) continue;
        docCounts[pid] = (docCounts[pid] || 0) + 1;
      }
    }

    // Attach the per-property count inline so the client doesn't have to
    // fan out N follow-up queries.
    properties = properties.map((p: any) => ({
      ...p,
      documentCount: docCounts[p.id] || 0,
    }));

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
