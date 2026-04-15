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

    // 5. Stream the file bytes directly through this route.
    //
    // We previously handed the caller a `getSignedUrl()` URL and let the
    // browser download from GCS directly, but that requires the runtime
    // service account to have `iam.serviceAccounts.signBlob` on itself.
    // On Vercel that role is easy to miss, and the failure mode is either a
    // signing error at request time or an opaque XML 403 when the browser
    // opens the URL. Streaming avoids signing entirely: the server reads the
    // bytes with its admin credentials (which clearly work, since the same
    // credentials serve Firestore), then relays them.
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
      // Pull metadata so we can set Content-Type and Content-Length precisely.
      // Falls back to the Firestore-recorded mime type / size if the object
      // metadata doesn't expose them (older uploads).
      const [meta] = await file.getMetadata();
      const contentType =
        (meta?.contentType as string | undefined) ||
        docData.mimeType ||
        "application/octet-stream";
      const contentLength =
        meta?.size != null ? String(meta.size) :
        docData.fileSizeBytes ? String(docData.fileSizeBytes) :
        undefined;

      const rawName = (docData.originalFilename || "document") as string;
      const safeName = rawName.replace(/["\\]/g, "_");

      // Bridge the GCS Node stream into a Web ReadableStream so we can hand it
      // to a standard Response. We deliberately avoid file.download() here
      // because that buffers the full object in memory on the serverless
      // function, which would OOM on larger OMs.
      const nodeStream = file.createReadStream();
      const webStream = new ReadableStream<Uint8Array>({
        start(controller) {
          nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err) => {
            console.error("[share/download] stream error:", err);
            controller.error(err);
          });
        },
        cancel() {
          nodeStream.destroy();
        },
      });

      const headers: Record<string, string> = {
        "Content-Type": contentType,
        // Use RFC 5987 filename* so non-ASCII names survive; keep a plain
        // filename for older clients that don't understand the extension.
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
        "Cache-Control": "private, max-age=0, no-store",
      };
      if (contentLength) headers["Content-Length"] = contentLength;

      return new Response(webStream, { status: 200, headers });
    } catch (streamErr: any) {
      console.error("[share/download] streaming failed:", streamErr);
      return NextResponse.json({
        error: `Could not read file: ${streamErr?.message || "unknown"}`,
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error("[share/download] Error:", err);
    return NextResponse.json({ error: err?.message || "Download failed" }, { status: 500 });
  }
}

// Ensure this route runs on the Node.js runtime (not Edge). The admin SDK
// depends on Node crypto / streams that aren't available on Edge.
export const runtime = "nodejs";
// OMs can run tens of MB; give the function headroom past the 10s default.
export const maxDuration = 60;
