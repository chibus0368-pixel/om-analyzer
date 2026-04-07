import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Server-side property duplicate using Admin SDK.
 * Copies property + all related data (extracted fields, scores, documents, notes, outputs).
 * Bypasses Firestore security rules for reliable copying.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json();
    const { propertyId, targetWorkspaceId } = body;

    if (!propertyId || !targetWorkspaceId) {
      return NextResponse.json({ error: "propertyId and targetWorkspaceId required" }, { status: 400 });
    }

    const db = getAdminDb();

    // 1. Read the original property
    const propRef = db.collection("workspace_properties").doc(propertyId);
    const propSnap = await propRef.get();
    if (!propSnap.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    const original = propSnap.data()!;

    // Verify user owns this property
    if (original.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Create the copy
    const copyData: Record<string, any> = { ...original };
    copyData.propertyName = (original.propertyName || "Untitled") + " (Copy)";
    copyData.workspaceId = targetWorkspaceId;
    copyData.createdAt = FieldValue.serverTimestamp();
    copyData.updatedAt = FieldValue.serverTimestamp();

    const newRef = await db.collection("workspace_properties").add(copyData);
    const newPropertyId = newRef.id;

    // 3. Copy all related collections
    const collectionsToClone = [
      "workspace_extracted_fields",
      "workspace_scores",
      "workspace_documents",
      "workspace_notes",
      "workspace_outputs",
    ];

    let totalCopied = 0;

    for (const collName of collectionsToClone) {
      try {
        const snap = await db.collection(collName)
          .where("propertyId", "==", propertyId)
          .get();

        if (snap.empty) continue;

        // Batch writes for efficiency (max 500 per batch)
        for (let i = 0; i < snap.docs.length; i += 450) {
          const batch = db.batch();
          const slice = snap.docs.slice(i, i + 450);
          for (const docSnap of slice) {
            const data = { ...docSnap.data() };
            data.propertyId = newPropertyId;
            data.createdAt = FieldValue.serverTimestamp();
            const newDocRef = db.collection(collName).doc();
            batch.set(newDocRef, data);
          }
          await batch.commit();
          totalCopied += slice.length;
        }
      } catch (e: any) {
        console.warn(`[duplicate API] Error copying ${collName}:`, e.message);
        // Continue with other collections
      }
    }

    console.log(`[duplicate API] Duplicated property ${propertyId} → ${newPropertyId} in workspace ${targetWorkspaceId}: ${totalCopied} related docs copied`);

    return NextResponse.json({
      success: true,
      newPropertyId,
      copied: totalCopied,
    });
  } catch (err: any) {
    console.error("[duplicate API] Error:", err.message);
    if (err.code === "auth/id-token-expired" || err.code === "auth/argument-error") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to duplicate property" }, { status: 500 });
  }
}
