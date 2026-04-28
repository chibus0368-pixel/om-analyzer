import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { runExtensionUploadPipeline } from "@/lib/workspace/extension-pipeline";

const ADMIN_EMAIL = "chibus0368@gmail.com";

/** Verify the caller is the admin by checking their Firebase ID token. */
async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

export const maxDuration = 300; // 5 minutes - parsing can be slow

/**
 * POST /api/admin/backfill-property
 *
 * One-shot recovery for properties whose workspace_extracted_fields rows
 * were written without a propertyId (so the share API's join returns
 * empty, even though parseStatus="parsed"). This re-runs the extension
 * upload pipeline against the property's source document, which writes
 * a fresh set of extracted_fields with propertyId populated.
 *
 * Body: { propertyId: string, shareId?: string }
 *   - When shareId is supplied, ALL properties in that share are
 *     backfilled in sequence. propertyId is ignored.
 */
export async function POST(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const db = getAdminDb();
    const body = await req.json().catch(() => ({}));
    const propertyId: string | undefined = body.propertyId;
    const shareId: string | undefined = body.shareId;

    // Resolve which propertyIds we need to backfill.
    let propertyIds: string[] = [];
    if (shareId) {
      const shareSnap = await db
        .collection("share_links")
        .where("shareId", "==", shareId)
        .where("isActive", "==", true)
        .limit(1)
        .get();
      if (shareSnap.empty) {
        return NextResponse.json({ error: "Share link not found" }, { status: 404 });
      }
      const shareData = shareSnap.docs[0].data();
      const propsSnap = await db
        .collection("workspace_properties")
        .where("userId", "==", shareData.userId)
        .get();
      const wsId = shareData.workspaceId;
      const allProps = propsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const filtered =
        wsId === "default"
          ? allProps.filter((p) => !p.workspaceId || p.workspaceId === "default")
          : allProps.filter((p) => p.workspaceId === wsId);
      propertyIds = (filtered.length > 0 ? filtered : allProps).map((p) => p.id);
    } else if (propertyId) {
      propertyIds = [propertyId];
    } else {
      return NextResponse.json(
        { error: "propertyId or shareId required" },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const pid of propertyIds) {
      try {
        const propSnap = await db.collection("workspace_properties").doc(pid).get();
        if (!propSnap.exists) {
          results.push({ propertyId: pid, ok: false, error: "Property not found" });
          continue;
        }
        const prop = propSnap.data() || {};

        // Find a source document with a Storage path so we can re-extract.
        const docsSnap = await db
          .collection("workspace_documents")
          .where("propertyId", "==", pid)
          .get();

        const docWithPath = docsSnap.docs
          .map((d) => d.data())
          .find((d: any) => d.storagePath && typeof d.storagePath === "string");

        if (!docWithPath) {
          results.push({
            propertyId: pid,
            ok: false,
            error: "No source document with storagePath found - cannot re-parse",
          });
          continue;
        }

        // Orphan cleanup intentionally REMOVED. Earlier version queried
        // workspace_extracted_fields where("projectId","==",prop.projectId)
        // and deleted rows with no propertyId. For prop.projectId =
        // "workspace-default" (the global default), that query matches
        // every other user's data too. The new parse engine writes a
        // proper propertyId on every row, so leaving any historical
        // orphans alone is the safer trade-off than a destructive
        // cross-tenant query.

        await runExtensionUploadPipeline({
          propertyId: pid,
          userId: prop.userId,
          workspaceId: prop.workspaceId || "default",
          storagePath: docWithPath.storagePath,
          fileName: docWithPath.originalFilename || "document.pdf",
          fallbackAnalysisType: prop.analysisType || "retail",
        });

        // Verify the new field count.
        const newFieldsSnap = await db
          .collection("workspace_extracted_fields")
          .where("propertyId", "==", pid)
          .get();

        results.push({
          propertyId: pid,
          ok: true,
          newFieldCount: newFieldsSnap.size,
        });
      } catch (perPropErr: any) {
        results.push({
          propertyId: pid,
          ok: false,
          error: perPropErr?.message || "Backfill failed",
        });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (err: any) {
    console.error("[admin/backfill-property] POST error:", err);
    return NextResponse.json(
      { error: err?.message || "Backfill failed" },
      { status: 500 }
    );
  }
}
