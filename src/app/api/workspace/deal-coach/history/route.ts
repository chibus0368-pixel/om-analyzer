import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-property chat history persistence for the CRE Chatbot.
 *
 * GET  /api/workspace/deal-coach/history?propertyId=<id>
 *      → { messages: [{role, content, at}], updatedAt }
 *
 * PUT  /api/workspace/deal-coach/history
 *      body: { propertyId, messages: [...] }
 *      → { ok: true }
 *
 * Storage: workspace_chats/{propertyId} owned by the property's userId.
 * We cap stored history at the last 60 turns so a chatty conversation
 * doesn't bloat Firestore storage costs.
 */

const HISTORY_CAP = 60;

async function authedUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(auth.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

async function ownsProperty(uid: string, propertyId: string): Promise<boolean> {
  const db = getAdminDb();
  const snap = await db.collection("workspace_properties").doc(propertyId).get();
  if (!snap.exists) return false;
  const owner = (snap.data() as any)?.userId;
  return !owner || owner === uid;
}

export async function GET(req: NextRequest) {
  const uid = await authedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const propertyId = req.nextUrl.searchParams.get("propertyId");
  if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

  if (!(await ownsProperty(uid, propertyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("workspace_chats").doc(propertyId).get();
    if (!snap.exists) return NextResponse.json({ messages: [], updatedAt: null });
    const data = snap.data() as any;
    return NextResponse.json({
      messages: Array.isArray(data?.messages) ? data.messages : [],
      updatedAt: data?.updatedAt || null,
    });
  } catch (err: any) {
    console.error("[deal-coach/history GET]", err?.message);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await authedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const propertyId: string = String(body?.propertyId || "");
    const incoming: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(body?.messages)
      ? body.messages
      : [];
    if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });
    if (!(await ownsProperty(uid, propertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Cap + normalize. Each message gets a server-assigned timestamp so
    // chronological order survives roundtrips even if the client clock
    // is wrong.
    const trimmed = incoming
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-HISTORY_CAP)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000), at: new Date().toISOString() }));

    const db = getAdminDb();
    await db.collection("workspace_chats").doc(propertyId).set({
      userId: uid,
      propertyId,
      messages: trimmed,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[deal-coach/history PUT]", err?.message);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
