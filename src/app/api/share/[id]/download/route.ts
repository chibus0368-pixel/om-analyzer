import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";

/**
 * Public Document Download for Shared Links
 *
 * Validates that the share link is active and documents are not hidden,
 * then generates a short-lived signed URL for the requested file.
 *
 * Query params:
 *   ?doc=<documentId>  - the workspace_documents doc ID
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

    // Honor hard expiration on downloads too.
    if (shareData.expiresAt && typeof shareData.expiresAt === "string") {
      const expiry = new Date(shareData.expiresAt).getTime();
      if (Number.isFinite(expiry) && Date.now() > expiry) {
        return NextResponse.json({ error: "This share link has expired." }, { status: 410 });
      }
    }

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
    // Verify the file actually exists before signing so we return a clean 404
    // instead of handing the caller a URL that Firebase will reject with an
    // opaque XML error. This also surfaces bucket-mismatch issues early.
    const bucket = getAdminStorage().bucket();
    const file = bucket.file(storagePath);

    try {
      const [exists] = await file.exists();
      if (!exists) {
        console.error("[share/download] File missing in storage:", {
          bucket: bucket.name,
          storagePath,
          docId,
        });
        return NextResponse.json({
          error: "File not found in storage. It may have been moved or deleted.",
          debug: { bucket: bucket.name, storagePath },
        }, { status: 404 });
      }
    } catch (existsErr: any) {
      console.error("[share/download] exists() check failed:", existsErr);
      return NextResponse.json({
        error: `Storage access error: ${existsErr?.message || "unknown"}`,
      }, { status: 500 });
    }

    try {
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        responseDisposition: `attachment; filename="${encodeURIComponent(docData.originalFilename || "document")}"`,
      });
      return NextResponse.json({ url: signedUrl });
    } catch (signErr: any) {
      // getSignedUrl requires a service-account-backed identity. If the admin
      // SDK was initialized without FIREBASE_SERVICE_ACCOUNT_KEY, this is
      // where it blows up - the error text usually mentions "iam.serviceAccounts.signBlob".
      console.error("[share/download] getSignedUrl failed:", signErr);
      return NextResponse.json({
        error: `Could not sign download URL: ${signErr?.message || "unknown"}`,
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error("[share/download] Error:", err);
    return NextResponse.json({ error: err?.message || "Download failed" }, { status: 500 });
  }
}
