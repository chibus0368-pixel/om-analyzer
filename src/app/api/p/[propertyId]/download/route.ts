import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";

/**
 * Public source-document download for the emailed single-deal page.
 *
 * URL: /api/p/[propertyId]/download?doc=<workspace_documents id>
 *
 * The /p/[propertyId] page is deliberately public (no token, no expiry) so
 * an emailed recipient can open it without signing in. This route is the
 * matching document channel: it only serves a document that actually
 * belongs to the property named in the path, so knowing a document ID on
 * its own is not enough to pull a file.
 *
 * Mirrors /api/share/[id]/download: we stream the bytes through the route
 * rather than handing out a signed GCS URL, because signing requires
 * `iam.serviceAccounts.signBlob` on the runtime service account and that
 * role is easy to miss on Vercel.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const { propertyId } = await params;
    const docId = req.nextUrl.searchParams.get("doc");

    if (!propertyId) {
      return NextResponse.json({ error: "Missing property" }, { status: 400 });
    }
    if (!docId) {
      return NextResponse.json({ error: "Missing doc parameter" }, { status: 400 });
    }

    const db = getAdminDb();

    // 1. Property must exist.
    const propSnap = await db.collection("workspace_properties").doc(propertyId).get();
    if (!propSnap.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // 2. Document must exist AND belong to this property. This binding is the
    //    entire access check for the public page - a doc ID from another
    //    property will not resolve here.
    const docSnap = await db.collection("workspace_documents").doc(docId).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const docData = docSnap.data()!;
    if (docData.propertyId !== propertyId) {
      return NextResponse.json({ error: "Document does not belong to this property" }, { status: 403 });
    }

    const storagePath = docData.storagePath;
    if (!storagePath) {
      return NextResponse.json({ error: "No file path available" }, { status: 404 });
    }

    const bucket = getAdminStorage().bucket();
    const file = bucket.file(storagePath);

    try {
      const [exists] = await file.exists();
      if (!exists) {
        console.error("[p/download] File missing in storage:", { bucket: bucket.name, storagePath, docId });
        return NextResponse.json({ error: "File not found in storage." }, { status: 404 });
      }
    } catch (existsErr: any) {
      console.error("[p/download] exists() check failed:", existsErr);
      return NextResponse.json(
        { error: `Storage access error: ${existsErr?.message || "unknown"}` },
        { status: 500 },
      );
    }

    try {
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

      // Bridge the GCS Node stream into a Web ReadableStream. We avoid
      // file.download() because it buffers the whole object in memory and
      // would OOM the serverless function on larger OMs.
      const nodeStream = file.createReadStream();
      const webStream = new ReadableStream<Uint8Array>({
        start(controller) {
          nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          nodeStream.on("end", () => controller.close());
          nodeStream.on("error", (err) => {
            console.error("[p/download] stream error:", err);
            controller.error(err);
          });
        },
        cancel() {
          nodeStream.destroy();
        },
      });

      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
        "Cache-Control": "private, max-age=0, no-store",
      };
      if (contentLength) headers["Content-Length"] = contentLength;

      return new Response(webStream, { status: 200, headers });
    } catch (streamErr: any) {
      console.error("[p/download] streaming failed:", streamErr);
      return NextResponse.json(
        { error: `Could not read file: ${streamErr?.message || "unknown"}` },
        { status: 500 },
      );
    }
  } catch (err: any) {
    console.error("[p/download] Error:", err);
    return NextResponse.json({ error: err?.message || "Download failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
