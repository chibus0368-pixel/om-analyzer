import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

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

/**
 * GET /api/admin/diag-share?shareId=TmvAn5SorT7K
 *
 * Diagnostic-only endpoint. For each property in the share it reports:
 *   - field count where propertyId == prop.id (canonical query)
 *   - field count where projectId == prop.projectId (any propertyId)
 *   - field count where projectId matches but propertyId field is missing
 *     (this is what the share API's join can't see)
 *   - sample fields from each bucket
 *   - parser_runs count for the projectId (to corroborate that parsing ran)
 *   - workspace_documents count for the propertyId (helps decide if we
 *     can re-parse via the backfill endpoint)
 */
export async function GET(req: NextRequest) {
  const adminUid = await verifyAdmin(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const db = getAdminDb();
    const shareId = req.nextUrl.searchParams.get("shareId");

    if (!shareId) {
      return NextResponse.json({ error: "shareId query param required" }, { status: 400 });
    }

    const shareSnap = await db
      .collection("share_links")
      .where("shareId", "==", shareId)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (shareSnap.empty) {
      return NextResponse.json(
        { error: "Share link not found or has been deactivated" },
        { status: 404 }
      );
    }

    const shareDoc = shareSnap.docs[0];
    const shareData = shareDoc.data();

    let propsSnap = await db
      .collection("workspace_properties")
      .where("userId", "==", shareData.userId)
      .get();

    if (propsSnap.empty && shareData.userId === "admin-user") {
      const wsId = shareData.workspaceId;
      if (wsId && wsId !== "default") {
        propsSnap = await db
          .collection("workspace_properties")
          .where("workspaceId", "==", wsId)
          .get();
      } else {
        propsSnap = await db.collection("workspace_properties").get();
      }
    }

    const allProps = propsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const wsId = shareData.workspaceId;

    let properties: any[];
    if (wsId === "default") {
      const defaultFiltered = allProps.filter(
        (p: any) => !p.workspaceId || p.workspaceId === "default"
      );
      properties = defaultFiltered.length > 0 ? defaultFiltered : allProps;
    } else {
      properties = allProps.filter((p: any) => p.workspaceId === wsId);
    }

    const propertyDiagnostics: any[] = [];

    for (const prop of properties) {
      const fieldsByPropertyId = await db
        .collection("workspace_extracted_fields")
        .where("propertyId", "==", prop.id)
        .get();

      const fieldsByProjectId = prop.projectId
        ? await db
            .collection("workspace_extracted_fields")
            .where("projectId", "==", prop.projectId)
            .get()
        : null;

      // Bucket the projectId-matching fields by whether they have a
      // propertyId at all, and whether it points to this property.
      let projOrphaned = 0;
      let projOtherProp = 0;
      const orphanSamples: any[] = [];
      const otherPropSamples: any[] = [];
      if (fieldsByProjectId) {
        for (const d of fieldsByProjectId.docs) {
          const data = d.data();
          const fieldPropId = data.propertyId;
          if (!fieldPropId) {
            projOrphaned++;
            if (orphanSamples.length < 3) {
              orphanSamples.push({
                id: d.id,
                fieldGroup: data.fieldGroup,
                fieldName: data.fieldName,
                propertyId: fieldPropId ?? null,
                projectId: data.projectId,
                documentId: data.documentId ?? null,
              });
            }
          } else if (fieldPropId !== prop.id) {
            projOtherProp++;
            if (otherPropSamples.length < 3) {
              otherPropSamples.push({
                id: d.id,
                fieldGroup: data.fieldGroup,
                fieldName: data.fieldName,
                propertyId: fieldPropId,
                projectId: data.projectId,
                documentId: data.documentId ?? null,
              });
            }
          }
        }
      }

      const parserRunsSnap = prop.projectId
        ? await db
            .collection("workspace_parser_runs")
            .where("projectId", "==", prop.projectId)
            .get()
        : null;

      const docsSnap = await db
        .collection("workspace_documents")
        .where("propertyId", "==", prop.id)
        .get();

      // Also look for documents that exist for this user/workspace but
      // might have lost their propertyId association. This tells us
      // whether the source PDFs are recoverable.
      const docsByUserSnap = prop.userId
        ? await db
            .collection("workspace_documents")
            .where("userId", "==", prop.userId)
            .get()
        : null;
      const docsForWorkspace = docsByUserSnap
        ? docsByUserSnap.docs
            .map((d) => d.data() as any)
            .filter((d) => !d.workspaceId || d.workspaceId === prop.workspaceId)
        : [];
      const docsOrphanedNoPropertyId = docsForWorkspace.filter(
        (d) => !d.propertyId
      );
      const docsForOtherProperty = docsForWorkspace.filter(
        (d) => d.propertyId && d.propertyId !== prop.id
      );

      const matchingSamples = fieldsByPropertyId.docs.slice(0, 3).map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fieldGroup: data.fieldGroup,
          fieldName: data.fieldName,
          propertyId: data.propertyId,
          projectId: data.projectId,
          documentId: data.documentId,
        };
      });

      propertyDiagnostics.push({
        propertyId: prop.id,
        propertyName: prop.propertyName,
        projectId: prop.projectId,
        workspaceId: prop.workspaceId,
        userId: prop.userId,
        parseStatus: prop.parseStatus,
        createdAt: prop.createdAt,
        counts: {
          fieldsByPropertyId: fieldsByPropertyId.size,
          fieldsByProjectIdTotal: fieldsByProjectId?.size ?? 0,
          fieldsByProjectIdOrphaned: projOrphaned,
          fieldsByProjectIdAttachedToOtherProperty: projOtherProp,
          parserRunsForProject: parserRunsSnap?.size ?? 0,
          documentsForProperty: docsSnap.size,
        },
        samples: {
          matching: matchingSamples,
          orphaned: orphanSamples,
          otherProperty: otherPropSamples,
        },
      });
    }

    return NextResponse.json({
      shareId,
      share: {
        displayName: shareData.displayName || shareData.workspaceName,
        workspaceName: shareData.workspaceName,
        workspaceId: shareData.workspaceId,
        userId: shareData.userId,
        isActive: shareData.isActive,
      },
      propertiesCount: properties.length,
      properties: propertyDiagnostics,
    });
  } catch (err: any) {
    console.error("[admin/diag-share] GET error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load diagnostic data" },
      { status: 500 }
    );
  }
}
