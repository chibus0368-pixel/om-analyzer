import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

/**
 * External Boards List — Chrome extension / bookmarklet helper.
 *
 * Returns the list of active DealBoards for the user that the extension
 * is attributed to (EXTENSION_USER_ID). Workspaces themselves live in
 * browser localStorage in the web app, so "active boards" here means
 * distinct workspaceIds the user has at least one property row under.
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

/** Turn a workspace slug like "retail-2026" into a display name. */
function prettifySlug(slug: string): string {
  if (!slug || slug === "default") return "Default DealBoard";
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
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

  // ── Query Firestore for distinct workspaceIds on this user's rows ──
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("workspace_properties")
      .where("userId", "==", userId)
      .select("workspaceId")
      .get();

    const counts = new Map<string, number>();
    snap.docs.forEach(d => {
      const data = d.data() as any;
      const wsId: string = (data && data.workspaceId) || "default";
      counts.set(wsId, (counts.get(wsId) || 0) + 1);
    });

    // Always include "default" even if empty so new users have something
    if (!counts.has("default")) counts.set("default", 0);

    const boards = Array.from(counts.entries())
      .map(([id, count]) => ({ id, name: prettifySlug(id), count }))
      .sort((a, b) => {
        // "default" first, then by activity desc, then by name asc
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
