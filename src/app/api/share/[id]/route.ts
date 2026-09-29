import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

const db = () => getAdminDb();

/**
 * Public Share API - no auth required
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

    // Honor hard expiration if set. Empty string / missing field means "no expiration".
    if (shareData.expiresAt && typeof shareData.expiresAt === "string") {
      const expiry = new Date(shareData.expiresAt).getTime();
      if (Number.isFinite(expiry) && Date.now() > expiry) {
        return NextResponse.json({ error: "This share link has expired." }, { status: 410 });
      }
    }

    // Increment view count (fire and forget)
    shareDoc.ref.update({ viewCount: (shareData.viewCount || 0) + 1 }).catch(() => {});

    // ── Security: reject share links owned by anonymous users ──────
    // Anonymous Firebase users should never have share links (the POST
    // endpoint blocks them), but guard the read path too in case legacy
    // data exists.
    // Also reject the legacy "admin-user" userId which previously had a
    // dangerous fallback that could return every property in the database.
    if (!shareData.userId || shareData.userId === "admin-user") {
      console.warn(`[share/[id]] Blocked share link with unsafe userId: ${shareData.userId}`);
      return NextResponse.json(
        { error: "This share link is no longer valid. Please ask the owner to create a new one." },
        { status: 410 },
      );
    }

    // Get properties for this workspace, scoped strictly to the link owner
    const propsSnap = await db().collection("workspace_properties")
      .where("userId", "==", shareData.userId)
      .get();

    // Filter by workspace - strict matching, no fallbacks
    const allProps = propsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const wsId = shareData.workspaceId;

    let properties: any[];
    if (wsId === "default") {
      // "default" workspace: include properties with no workspaceId or workspaceId "default"
      properties = allProps.filter((p: any) => !p.workspaceId || p.workspaceId === "default");
    } else {
      properties = allProps.filter((p: any) => p.workspaceId === wsId);
    }

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
            storagePath: d.data().storagePath || "",
            fileSizeBytes: d.data().fileSizeBytes || 0,
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
