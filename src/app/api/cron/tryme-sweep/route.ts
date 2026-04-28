import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

/**
 * GET /api/cron/tryme-sweep
 *
 * Deletes unclaimed Try Me records whose expiresAt has passed. Scheduled
 * via Vercel Cron (see vercel.json). Also callable manually with the
 * ADMIN_SECRET header for testing.
 *
 * A "tryme" record is one where userId starts with "tryme-" and isTryMe
 * is still true - claimed records have isTryMe flipped to false and
 * expiresAt cleared, so they're immune.
 */
export async function GET(request: NextRequest) {
  // Vercel Cron sends an Authorization: Bearer <CRON_SECRET> header.
  // Also accept x-admin-secret for manual testing.
  const auth = request.headers.get("authorization") || "";
  const adminSecret = request.headers.get("x-admin-secret");
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = cronSecret && auth === `Bearer ${cronSecret}`;
  const isAdmin = adminSecret && adminSecret === process.env.ADMIN_SECRET;
  if (!isVercelCron && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const nowIso = new Date().toISOString();

  try {
    // Find expired unclaimed tryme properties.
    const expiredSnap = await db
      .collection("workspace_properties")
      .where("isTryMe", "==", true)
      .where("expiresAt", "<", nowIso)
      .get();

    if (expiredSnap.empty) {
      return NextResponse.json({ swept: 0, propertiesChecked: 0 });
    }

    const propertyIds: string[] = [];
    const projectIds = new Set<string>();
    expiredSnap.docs.forEach((d: any) => {
      propertyIds.push(d.id);
      const data = d.data() || {};
      if (data.projectId) projectIds.add(data.projectId);
    });

    // Chunked deletes (Firestore caps at 500 ops per batch).
    const BATCH_LIMIT = 400;
    let batch = db.batch();
    let ops = 0;
    let deleted = 0;
    const flush = async () => {
      if (ops > 0) {
        await batch.commit();
        deleted += ops;
        batch = db.batch();
        ops = 0;
      }
    };
    const del = async (ref: any) => {
      batch.delete(ref);
      ops++;
      if (ops >= BATCH_LIMIT) await flush();
    };

    // Delete extracted_fields / notes keyed by propertyId
    for (const pid of propertyIds) {
      const fieldsSnap = await db
        .collection("workspace_extracted_fields")
        .where("propertyId", "==", pid)
        .get();
      for (const d of fieldsSnap.docs) await del(d.ref);

      const notesSnap = await db
        .collection("workspace_notes")
        .where("propertyId", "==", pid)
        .get();
      for (const d of notesSnap.docs) await del(d.ref);
    }

    // Delete scores / parser_runs / activity_logs keyed by projectId.
    // CRITICAL: skip the shared "workspace-default" projectId - it would
    // match records across every other (claimed, real) property in the
    // database and silently delete them. Only sweep projectIds that
    // belong to ephemeral tryme runs (those use the unique
    // "tryme-<uuid>" pattern set in tryme-analyze).
    for (const oldPid of projectIds) {
      if (!oldPid || oldPid === "workspace-default") continue;
      const scoresSnap = await db
        .collection("workspace_scores")
        .where("projectId", "==", oldPid)
        .get();
      for (const d of scoresSnap.docs) await del(d.ref);

      const runsSnap = await db
        .collection("workspace_parser_runs")
        .where("projectId", "==", oldPid)
        .get();
      for (const d of runsSnap.docs) await del(d.ref);

      const logsSnap = await db
        .collection("workspace_activity_logs")
        .where("projectId", "==", oldPid)
        .get();
      for (const d of logsSnap.docs) await del(d.ref);
    }

    // Finally delete the property docs themselves
    for (const d of expiredSnap.docs) await del(d.ref);

    await flush();

    console.log(
      `[tryme-sweep] Deleted ${propertyIds.length} expired Try Me properties (${deleted} total docs)`
    );

    return NextResponse.json({
      swept: propertyIds.length,
      totalDocs: deleted,
      propertiesChecked: expiredSnap.size,
    });
  } catch (err: any) {
    console.error("[tryme-sweep] Error:", err?.message || err);
    return NextResponse.json(
      { error: "Sweep failed", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
