import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

// DELETE /api/workspace/cleanup - removes all workspace test data
export async function DELETE(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const collections = [
    "workspace_projects",
    "workspace_properties",
    "workspace_documents",
    "workspace_extracted_fields",
    "workspace_underwriting_models",
    "workspace_underwriting_outputs",
    "workspace_scores",
    "workspace_property_snapshots",
    "workspace_outputs",
    "workspace_notes",
    "workspace_tasks",
    "workspace_activity_logs",
    "workspace_parser_runs",
  ];

  let totalDeleted = 0;

  for (const collName of collections) {
    try {
      const snap = await db.collection(collName).get();
      for (const doc of snap.docs) {
        await doc.ref.delete();
        totalDeleted++;
      }
    } catch (err: any) {
      console.warn(`Failed to clean ${collName}:`, err?.message);
    }
  }

  return NextResponse.json({ success: true, totalDeleted, collections: collections.length });
}

// GET /api/workspace/cleanup - shows counts of all workspace data
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const collections = [
    "workspace_projects",
    "workspace_properties",
    "workspace_documents",
    "workspace_extracted_fields",
    "workspace_scores",
    "workspace_notes",
    "workspace_tasks",
    "workspace_activity_logs",
    "workspace_parser_runs",
  ];

  const counts: Record<string, number> = {};
  for (const collName of collections) {
    try {
      const snap = await db.collection(collName).get();
      counts[collName] = snap.size;
    } catch {
      counts[collName] = -1;
    }
  }

  return NextResponse.json(counts);
}
