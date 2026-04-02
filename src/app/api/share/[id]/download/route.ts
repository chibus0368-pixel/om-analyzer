import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";

/**
 * Public Document Download for Shared Links
 *
 * Validates that the share link is active and documents are not hidden,
 * then generates a short-lived signed URL for the requested file.
 *
 * Query params:
 *   ?doc=<documentId>  — the workspace_documents doc ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shareId } = await params;
    const docId = req.nextUrl.searchParams.get("doc");

    if (!docId) {
      return NextResponse.json({ error: "Missing doc parameter" }, { status: 400 });
    }

    const db = getAdminDb();

    // 1. Verify share link is active
    const shareSnap = await db.collection("share_links")
      .where("shareId", "==", shareId)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (shareSnap.empty) {
      return NextResponse.json({ error: "Share link not found or deactivated" }, { status: 404 });
    }

    const shareData = shareSnap.docs[0].data();

    // 2. Documents must not be hidden on this share link
    if (shareData.hideDocuments) {
      return NextResponse.json({ error: "Documents are hidden on this share link" }, { status: 403 });
    }

    // 3. Fetch the document record
    const docSnap = await db.collection("workspace_documents").doc(docId).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const docData = docSnap.data()!;
    const storagePath = docData.storagePath;

    if (!storagePath) {
      return NextResponse.json({ error: "No file path available" }, { status: 404 });
    }

    // 4. Verify document belongs to a property in the shared workspace
    const propertyId = docData.propertyId;
    if (propertyId) {
      const propSnap = await db.collection("workspace_properties").doc(propertyId).get();
      if (propSnap.exists) {
        const propData = propSnap.data()!;
        // Check ownership: property must belong to the share link owner + workspace
        const ownerMatch = propData.userId === shareData.userId;
        const wsMatch = !shareData.workspaceId || shareData.workspaceId === "default"
          ? (!propData.workspaceId || propData.workspaceId === "default")
          : propData.workspaceId === shareData.workspaceId;

        if (!ownerMatch || !wsMatch) {
          return NextResponse.json({ error: "Document does not belong to shared workspace" }, { status: 403 });
        }
      }
    }

    // 5. Generate signed URL (valid for 1 hour)
    const bucket = getAdminStorage().bucket();
    const file = bucket.file(storagePath);

    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      responseDisposition: `attachment; filename="${encodeURIComponent(docData.originalFilename || "document")}"`,
    });

    return NextResponse.json({ url: signedUrl });
  } catch (err: any) {
    console.error("[share/download] Error:", err);
    return NextResponse.json({ error: err?.message || "Download failed" }, { status: 500 });
  }
}
