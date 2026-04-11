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

    // Fetch properties first — this is the critical path. The dashboard
    // must render even if the document-count enrichment step fails or
    // times out.
    const propsSnap = await db
      .collection("workspace_properties")
      .where("userId", "==", userId)
      .get();

    let properties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Filter by workspaceId — strict filtering, no fallback
    if (workspaceId === "default") {
      properties = properties.filter(p => !p.workspaceId || p.workspaceId === "default");
    } else {
      properties = properties.filter(p => p.workspaceId === workspaceId);
    }

    // Enrich with document counts, but DO NOT let this block the response.
    // We race the docs query against a 2s timeout; if the query hasn't
    // finished in time (or errors), we serve without counts and the
    // dashboard will just show 0 files until the next refresh.
    //
    // Crucially, we use .select("propertyId", "isDeleted") so we don't
    // pull the heavy document blobs (parsed OM text etc.) — we only need
    // two small fields to build the count map.
    const docCounts: Record<string, number> = {};
    try {
      const docsPromise = db
        .collection("workspace_documents")
        .where("userId", "==", userId)
        .select("propertyId", "isDeleted")
        .get();

      const timeoutPromise = new Promise<null>(resolve =>
        setTimeout(() => resolve(null), 2000),
      );

      const docsSnap = await Promise.race([docsPromise, timeoutPromise]);

      if (docsSnap && (docsSnap as any).docs) {
        for (const d of (docsSnap as any).docs) {
          const data = d.data() as any;
          if (data.isDeleted) continue;
          const pid = data.propertyId;
          if (!pid) continue;
          docCounts[pid] = (docCounts[pid] || 0) + 1;
        }
      }
    } catch (e: any) {
      console.warn("[properties API] doc count enrichment failed:", e?.message);
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
