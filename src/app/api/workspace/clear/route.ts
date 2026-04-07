import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

/**
 * Server-side workspace clear using Admin SDK.
 * Deletes all properties and related data for a workspace.
 * Bypasses Firestore security rules.
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
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const db = getAdminDb();

    // Get all properties for this workspace + unmigrated legacy properties
    const propSnap = await db.collection("workspace_properties")
      .where("userId", "==", userId)
      .get();

    // Filter to workspace (or unmigrated)
    const matchingDocs = propSnap.docs.filter(d => {
      const data = d.data();
      if (workspaceId === "default") {
        return !data.workspaceId || data.workspaceId === "default";
      }
      return data.workspaceId === workspaceId;
    });

    // Also include legacy "admin-user" properties without workspaceId
    const legacySnap = await db.collection("workspace_properties")
      .where("userId", "==", "admin-user")
      .get();
    const legacyDocs = legacySnap.docs.filter(d => !d.data().workspaceId);

    // Deduplicate
    const seenIds = new Set<string>();
    const allDocs = [...matchingDocs, ...legacyDocs].filter(d => {
      if (seenIds.has(d.id)) return false;
      seenIds.add(d.id);
      return true;
    });

    const propIds = allDocs.map(d => d.id);
    const projectIds = allDocs.map(d => d.data().projectId).filter(Boolean);

    let totalDeleted = 0;

    // Delete properties in batches
    for (let i = 0; i < allDocs.length; i += 450) {
      const batch = db.batch();
      allDocs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += Math.min(450, allDocs.length - i);
    }

    // Delete related data from all workspace collections
    const relatedCollections = [
      "workspace_projects", "workspace_documents", "workspace_extracted_fields",
      "workspace_underwriting_models", "workspace_underwriting_outputs",
      "workspace_scores", "workspace_property_snapshots", "workspace_outputs",
      "workspace_notes", "workspace_tasks", "workspace_activity_logs",
      "workspace_parser_runs",
    ];

    for (const coll of relatedCollections) {
      try {
        // Delete by propertyId
        for (const pid of propIds) {
          const snap = await db.collection(coll).where("propertyId", "==", pid).get();
          for (let i = 0; i < snap.docs.length; i += 450) {
            const batch = db.batch();
            snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
            await batch.commit();
            totalDeleted += Math.min(450, snap.docs.length - i);
          }
        }
        // Delete by projectId
        for (const pid of projectIds) {
          const snap = await db.collection(coll).where("projectId", "==", pid).get();
          for (let i = 0; i < snap.docs.length; i += 450) {
            const batch = db.batch();
            snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
            await batch.commit();
            totalDeleted += Math.min(450, snap.docs.length - i);
          }
        }
      } catch {
        // Continue with other collections
      }
    }

    console.log(`[clear API] Cleared workspace "${workspaceId}" for user ${userId}: ${totalDeleted} documents deleted`);
    return NextResponse.json({ success: true, deleted: totalDeleted, properties: propIds.length });
  } catch (err: any) {
    console.error("[clear API] Error:", err.message);
    if (err.code === "auth/id-token-expired" || err.code === "auth/argument-error") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to clear workspace" }, { status: 500 });
  }
}
