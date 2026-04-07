import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

/**
 * Server-side extracted fields fetching using Admin SDK.
 * Bypasses Firestore security rules for workspace_extracted_fields collection.
 */
export async function GET(req: NextRequest) {
  try {
    // Verify auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    await getAdminAuth().verifyIdToken(token);

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const projectId = req.nextUrl.searchParams.get("projectId");

    if (!propertyId && !projectId) {
      return NextResponse.json({ error: "propertyId or projectId required" }, { status: 400 });
    }

    const db = getAdminDb();
    let snap;

    if (propertyId) {
      snap = await db.collection("workspace_extracted_fields")
        .where("propertyId", "==", propertyId)
        .get();
    } else {
      snap = await db.collection("workspace_extracted_fields")
        .where("projectId", "==", projectId)
        .get();
    }

    const fields = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort by fieldGroup
    fields.sort((a: any, b: any) => (a.fieldGroup || "").localeCompare(b.fieldGroup || ""));

    return NextResponse.json({ fields, total: fields.length });
  } catch (err: any) {
    console.error("[extracted-fields API] Error:", err.message);
    if (err.code === "auth/id-token-expired" || err.code === "auth/argument-error") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch extracted fields" }, { status: 500 });
  }
}
