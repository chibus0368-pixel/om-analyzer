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
    const all = req.nextUrl.searchParams.get("all") === "true";

    const db = getAdminDb();

    // Normalize Firestore Timestamp fields to ISO strings at the API
    // boundary. Properties created by the parse engine store createdAt/
    // updatedAt as ISO strings, but properties created via the duplicate
    // route use FieldValue.serverTimestamp() which Admin SDK reads back
    // as a Timestamp instance. Without normalization those serialize as
    // { _seconds, _nanoseconds } and break any client-side code that
    // tries to sort them with .localeCompare.
    const normalizeTs = (v: any): any => {
      if (!v) return v;
      if (typeof v === "string") return v;
      if (typeof v === "object") {
        if (typeof v.toDate === "function") {
          try {
            return v.toDate().toISOString();
          } catch {
            /* fall through */
          }
        }
        if (typeof v._seconds === "number") {
          return new Date(v._seconds * 1000).toISOString();
        }
        if (typeof v.seconds === "number") {
          return new Date(v.seconds * 1000).toISOString();
        }
      }
      return v;
    };

    // Fetch properties — filter at the Firestore query level to avoid
    // reading the entire user's collection when only one board is needed.
    let propsQuery = db.collection("workspace_properties")
      .where("userId", "==", userId);

    if (!all && workspaceId !== "default") {
      // Direct Firestore filter — reads only the properties for this board
      propsQuery = propsQuery.where("workspaceId", "==", workspaceId);
    }

    const propsSnap = await propsQuery.get();

    let properties = propsSnap.docs.map(d => {
      const data = d.data() as any;
      return {
        id: d.id,
        ...data,
        createdAt: normalizeTs(data.createdAt),
        updatedAt: normalizeTs(data.updatedAt),
      };
    });

    // For the "default" workspace, we need client-side filtering because
    // default properties may have workspaceId="" or null or "default".
    if (!all && workspaceId === "default") {
      properties = properties.filter(p => !p.workspaceId || p.workspaceId === "default");
    }

    // Enrich with document counts, but DO NOT let this block the response.
    // We race the docs query against a 1.5s timeout; if it hasn't finished
    // in time (or errors), we serve with 0 counts — the dashboard still
    // works. We use .select() to only read two small fields.
    //
    // Optimization: when we have ≤30 property IDs we use Firestore's
    // `in` filter to only read documents for these specific properties
    // rather than scanning every document the user has ever uploaded.
    const docCounts: Record<string, number> = {};
    const propIds = properties.map((p: any) => p.id);
    try {
      let docsPromise;
      if (propIds.length > 0 && propIds.length <= 30) {
        // Firestore `in` supports up to 30 values — targeted query
        docsPromise = db
          .collection("workspace_documents")
          .where("propertyId", "in", propIds)
          .select("propertyId", "isDeleted")
          .get();
      } else {
        // Fallback: scan all user docs (large accounts)
        docsPromise = db
          .collection("workspace_documents")
          .where("userId", "==", userId)
          .select("propertyId", "isDeleted")
          .get();
      }

      const timeoutPromise = new Promise<null>(resolve =>
        setTimeout(() => resolve(null), 1500),
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
