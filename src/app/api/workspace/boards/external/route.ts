import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

/**
 * External Boards List — Chrome extension / bookmarklet helper.
 *
 * Returns the REAL DealBoards for the user that the extension is
 * attributed to (EXTENSION_USER_ID). Source of truth is the
 * `workspaces` Firestore collection (doc id = `${userId}__${wsId}`).
 *
 * Counts are enriched from `workspace_properties`. Property rows
 * tagged with a stale/orphaned workspaceId that has no matching row
 * in `workspaces` are intentionally NOT surfaced here — those are
 * exactly the "boards i don't recognize" the user was seeing.
 *
 * Auth: same X-API-Key pattern as /api/workspace/upload/external.
 *
 * Request:
 *   GET /api/workspace/boards/external
 *   Headers: X-API-Key: <EXTENSION_API_KEY>
 *
 * Response:
 *   { boards: [{ id: string, name: string, count: number }] }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_ORIGINS = [
  /^chrome-extension:\/\/.+$/,
  /^moz-extension:\/\/.+$/,
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.some(re => re.test(origin))
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // ── Auth ────────────────────────────────────────────────────────────
  const expected = process.env.EXTENSION_API_KEY;
  const userId = process.env.EXTENSION_USER_ID;
  if (!expected || !userId) {
    return NextResponse.json(
      { error: "Extension endpoint not configured. Set EXTENSION_API_KEY and EXTENSION_USER_ID." },
      { status: 500, headers: cors },
    );
  }
  const presented = req.headers.get("x-api-key") || "";
  if (presented !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
  }

  try {
    const db = getAdminDb();

    // ── Real boards: the user's rows in the `workspaces` collection ─
    const wsSnap = await db
      .collection("workspaces")
      .where("userId", "==", userId)
      .get();

    type Board = { id: string; name: string; count: number };
    const realBoards = new Map<string, Board>();
    wsSnap.docs.forEach(d => {
      const data = d.data() as any;
      const id = String(data?.id || d.id.split("__")[1] || "default");
      const name = String(data?.name || "Untitled DealBoard");
      realBoards.set(id, { id, name, count: 0 });
    });

    // Always surface "default" so new users have something to save to,
    // even before they've opened Pro for the first time.
    if (!realBoards.has("default")) {
      realBoards.set("default", { id: "default", name: "Default DealBoard", count: 0 });
    }

    // ── Enrich with property counts ────────────────────────────────
    const propsSnap = await db
      .collection("workspace_properties")
      .where("userId", "==", userId)
      .select("workspaceId")
      .get();
    propsSnap.docs.forEach(d => {
      const wsId = String((d.data() as any)?.workspaceId || "default");
      const existing = realBoards.get(wsId);
      if (existing) existing.count += 1;
      // Orphaned workspaceIds (no matching real board) are intentionally
      // dropped — they're the stale ghost boards the extension was showing.
    });

    const boards = Array.from(realBoards.values()).sort((a, b) => {
      if (a.id === "default" && b.id !== "default") return -1;
      if (b.id === "default" && a.id !== "default") return 1;
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ boards }, { headers: cors });
  } catch (err: any) {
    console.error("[boards/external] failed:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to list boards: " + (err?.message || "unknown") },
      { status: 500, headers: cors },
    );
  }
}
