import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import type { AnalysisType } from "@/lib/workspace/types";

/**
 * Authenticated Workspaces (DealBoards) CRUD.
 *
 * Up until now, workspaces lived ONLY in browser localStorage, which
 * meant clearing cache blew away all the user's boards (and orphaned
 * every property that was attributed to them). This route makes
 * workspaces durable by persisting them to Firestore under the
 * `workspaces` collection with composite doc ids `{userId}__{wsId}`.
 *
 * The client still keeps localStorage as a write-behind cache so the
 * UI renders instantly on load; on mount the context hydrates from
 * the server and reconciles.
 *
 * Shape of a stored workspace doc:
 *   {
 *     userId: string,
 *     id: string,          // logical id used by client (e.g. "default" or "ws_abc")
 *     name: string,
 *     slug: string,
 *     analysisType: "retail" | "industrial" | "office" | "land",
 *     createdAt: string,   // ISO
 *     updatedAt: string,   // ISO
 *   }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COLLECTION = "workspaces";

function toSlug(name: string): string {
  return (
    (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace"
  );
}

function docIdFor(userId: string, wsId: string): string {
  return `${userId}__${wsId}`;
}

function isValidAnalysisType(v: any): v is AnalysisType {
  return v === "retail" || v === "industrial" || v === "office" || v === "land" || v === "multifamily";
}

async function authUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

// ─── GET: list all of the user's workspaces ───────────────────────────
export async function GET(req: NextRequest) {
  const userId = await authUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTION).where("userId", "==", userId).get();
    const workspaces = snap.docs.map(d => {
      const data = d.data() as any;
      return {
        id: data.id,
        userId: data.userId,
        name: data.name,
        slug: data.slug,
        analysisType: data.analysisType || "retail",
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

    // Guarantee the default board always exists server-side. First-time
    // users will get it auto-created here so the dashboard has something
    // to render against.
    if (!workspaces.some(w => w.id === "default")) {
      const now = new Date().toISOString();
      const def = {
        userId,
        id: "default",
        name: "Default DealBoard",
        slug: "default",
        analysisType: "retail" as AnalysisType,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await db.collection(COLLECTION).doc(docIdFor(userId, "default")).set(def);
        workspaces.unshift(def);
      } catch (e: any) {
        console.warn("[boards] failed to seed default board:", e?.message);
      }
    }

    workspaces.sort((a, b) => {
      if (a.id === "default") return -1;
      if (b.id === "default") return 1;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });

    // Fetch property counts per workspace — lightweight: only reads the
    // workspaceId field. Raced against a 1.5s timeout so the boards list
    // is never blocked by a slow property scan.
    const propertyCounts: Record<string, number> = {};
    try {
      const countPromise = db.collection("workspace_properties")
        .where("userId", "==", userId)
        .select("workspaceId")
        .get();
      const timeout = new Promise<null>(r => setTimeout(() => r(null), 1500));
      const propsSnap = await Promise.race([countPromise, timeout]);
      if (propsSnap && (propsSnap as any).docs) {
        for (const doc of (propsSnap as any).docs) {
          const wsId = (doc.data() as any).workspaceId || "default";
          propertyCounts[wsId] = (propertyCounts[wsId] || 0) + 1;
        }
      }
    } catch (e: any) {
      console.warn("[boards] failed to count properties:", e?.message);
    }

    // Attach count to each workspace
    for (const ws of workspaces) {
      (ws as any).propertyCount = propertyCounts[ws.id] || 0;
    }

    return NextResponse.json({ workspaces });
  } catch (err: any) {
    console.error("[boards GET] failed:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to list boards: " + (err?.message || "unknown") },
      { status: 500 },
    );
  }
}

// ─── POST: create a new workspace ─────────────────────────────────────
export async function POST(req: NextRequest) {
  const userId = await authUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = String(body?.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const analysisType: AnalysisType = isValidAnalysisType(body?.analysisType) ? body.analysisType : "retail";
  const clientId: string | undefined = typeof body?.id === "string" ? body.id : undefined;

  try {
    const db = getAdminDb();

    // Deduplicate slug so two boards with the same name don't collide.
    let slug = toSlug(name);
    const existingSnap = await db.collection(COLLECTION).where("userId", "==", userId).get();
    const existingSlugs = new Set(existingSnap.docs.map(d => (d.data() as any).slug));
    if (existingSlugs.has(slug)) {
      let i = 2;
      while (existingSlugs.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }

    const id = clientId || `ws_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const ws = {
      userId,
      id,
      name,
      slug,
      analysisType,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTION).doc(docIdFor(userId, id)).set(ws);
    return NextResponse.json({ workspace: ws });
  } catch (err: any) {
    console.error("[boards POST] failed:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to create board: " + (err?.message || "unknown") },
      { status: 500 },
    );
  }
}

// ─── PATCH: rename / update an existing workspace ─────────────────────
export async function PATCH(req: NextRequest) {
  const userId = await authUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, any> = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
    updates.slug = toSlug(body.name);
  }
  if (isValidAnalysisType(body?.analysisType)) {
    updates.analysisType = body.analysisType;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid updates" }, { status: 400 });
  }
  updates.updatedAt = new Date().toISOString();

  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(docIdFor(userId, id));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ref.set(updates, { merge: true });
    const merged = { ...(snap.data() as any), ...updates };
    return NextResponse.json({ workspace: merged });
  } catch (err: any) {
    console.error("[boards PATCH] failed:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to update board: " + (err?.message || "unknown") },
      { status: 500 },
    );
  }
}

// ─── DELETE: remove a workspace (never the default) ───────────────────
export async function DELETE(req: NextRequest) {
  const userId = await authUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === "default") {
    return NextResponse.json({ error: "Cannot delete default board" }, { status: 400 });
  }
  try {
    const db = getAdminDb();
    await db.collection(COLLECTION).doc(docIdFor(userId, id)).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[boards DELETE] failed:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to delete board: " + (err?.message || "unknown") },
      { status: 500 },
    );
  }
}
