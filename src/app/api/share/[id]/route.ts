import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

const db = () => getAdminDb();

/**
 * Public Share API — no auth required
 * Fetches share link config + all properties & extracted fields for the shared workspace.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shareId } = await params;

    // Find share link by shareId
    const snap = await db().collection("share_links")
      .where("shareId", "==", shareId)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ error: "Share link not found or has been deactivated" }, { status: 404 });
    }

    const shareDoc = snap.docs[0];
    const shareData = shareDoc.data();

    // Increment view count (fire and forget)
    shareDoc.ref.update({ viewCount: (shareData.viewCount || 0) + 1 }).catch(() => {});

    console.log("[share/[id]] shareData:", JSON.stringify({
      userId: shareData.userId,
      workspaceId: shareData.workspaceId,
      workspaceName: shareData.workspaceName,
    }));

    // Get properties for this workspace
    // Query by userId first (the owner of the share link)
    let propsSnap = await db().collection("workspace_properties")
      .where("userId", "==", shareData.userId)
      .get();

    console.log("[share/[id]] userId query found:", propsSnap.size, "docs for userId:", shareData.userId);

    // Fallback: if userId is "admin-user" (legacy links created before auth fix),
    // query all properties for the workspaceId instead
    if (propsSnap.empty && shareData.userId === "admin-user") {
      const wsId = shareData.workspaceId;
      console.log("[share/[id]] Fallback: admin-user detected, wsId:", wsId);
      if (wsId && wsId !== "default") {
        propsSnap = await db().collection("workspace_properties")
          .where("workspaceId", "==", wsId)
          .get();
      } else {
        // For default workspace, get all properties
        propsSnap = await db().collection("workspace_properties").get();
      }
      console.log("[share/[id]] Fallback query found:", propsSnap.size, "docs");
    }

    // Filter by workspace client-side (same pattern as workspace firestore.ts)
    const allProps = propsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const wsId = shareData.workspaceId;

    console.log("[share/[id]] allProps count:", allProps.length, "wsId:", wsId);
    if (allProps.length > 0) {
      console.log("[share/[id]] sample prop workspaceIds:", allProps.slice(0, 3).map((p: any) => p.workspaceId));
    }

    const properties = wsId === "default"
      ? allProps.filter((p: any) => !p.workspaceId || p.workspaceId === "default")
      : allProps.filter((p: any) => p.workspaceId === wsId);

    console.log("[share/[id]] filtered properties count:", properties.length);

    // Get extracted fields for each property
    const propertiesWithFields = [];
    for (const prop of properties) {
      let fields: any[] = [];
      try {
        const fieldsSnap = await db().collection("workspace_extracted_fields")
          .where("propertyId", "==", prop.id)
          .get();
        fields = fieldsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch { /* skip */ }

      // Get documents (only if not hidden)
      let documents: any[] = [];
      if (!shareData.hideDocuments) {
        try {
          const docsSnap = await db().collection("workspace_documents")
            .where("propertyId", "==", prop.id)
            .get();
          documents = docsSnap.docs.map(d => ({
            id: d.id,
            originalFilename: d.data().originalFilename,
            docCategory: d.data().docCategory,
            fileExt: d.data().fileExt,
          }));
        } catch { /* skip */ }
      }

      propertiesWithFields.push({
        ...prop,
        extractedFields: fields,
        documents,
      });
    }

    return NextResponse.json({
      share: {
        displayName: shareData.displayName || shareData.workspaceName,
        whiteLabel: shareData.whiteLabel,
        hideDocuments: shareData.hideDocuments,
        workspaceName: shareData.workspaceName,
        contactName: shareData.contactName || "",
        contactAgency: shareData.contactAgency || "",
        contactPhone: shareData.contactPhone || "",
      },
      properties: propertiesWithFields,
    });
  } catch (err: any) {
    console.error("[share/[id]] GET error:", err);
    return NextResponse.json({ error: err?.message || "Failed to load shared data" }, { status: 500 });
  }
}
