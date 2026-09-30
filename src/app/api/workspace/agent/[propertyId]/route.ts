import { NextRequest, NextResponse, after } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { AGENT_DAILY_LIMIT, AGENT_RUNS, newRun, runDealAgent } from "@/lib/workspace/deal-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The agent keeps working after the POST returns (via after()), so this
// is the budget for the whole run, not the request.
export const maxDuration = 300;

async function authed(req: NextRequest, propertyId: string) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(h.slice(7))).uid; }
  catch { return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) }; }
  const prop = await getAdminDb().collection("workspace_properties").doc(propertyId).get();
  if (!prop.exists) return { error: NextResponse.json({ error: "Deal not found" }, { status: 404 }) };
  if ((prop.data() as any).userId !== uid) return { error: NextResponse.json({ error: "Not your deal" }, { status: 403 }) };
  return { uid };
}

/** GET: the latest agent run for this deal (or null). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const a = await authed(req, propertyId);
  if ("error" in a) return a.error;
  const snap = await getAdminDb().collection(AGENT_RUNS).doc(propertyId).get();
  return NextResponse.json({ run: snap.exists ? snap.data() : null, dailyLimit: AGENT_DAILY_LIMIT });
}

/** POST: activate the agent on this deal. Returns immediately; the agent keeps working. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const a = await authed(req, propertyId);
  if ("error" in a) return a.error;
  const db = getAdminDb();
  const ref = db.collection(AGENT_RUNS).doc(propertyId);

  // Already working on this deal? Don't start a second run.
  const cur = await ref.get();
  if (cur.exists) {
    const r = cur.data() as any;
    if (r.status === "running" && Date.now() - new Date(r.startedAt).getTime() < 6 * 60000) {
      return NextResponse.json({ run: r, alreadyRunning: true });
    }
  }

  // Per-user daily cap
  const day = new Date().toISOString().slice(0, 10);
  const userRef = db.collection("users").doc(a.uid);
  const allowed = await db.runTransaction(async tx => {
    const u = await tx.get(userRef);
    const usage = (u.exists ? (u.data() as any).agentUsage : null) || {};
    const count = usage.day === day ? Number(usage.count || 0) : 0;
    if (count >= AGENT_DAILY_LIMIT) return false;
    tx.set(userRef, { agentUsage: { day, count: count + 1 } }, { merge: true });
    return true;
  });
  if (!allowed) {
    return NextResponse.json({ error: `You've activated the agent ${AGENT_DAILY_LIMIT} times today. It resets tomorrow.` }, { status: 429 });
  }

  const run = newRun(propertyId, a.uid);
  await ref.set(run);
  await db.collection("workspace_properties").doc(propertyId).set({ agentStatus: "running", agentStartedAt: run.startedAt }, { merge: true });

  after(async () => {
    try { await runDealAgent(propertyId); }
    catch (e: any) {
      await ref.set({ status: "failed", finishedAt: new Date().toISOString(), error: String(e?.message || e).slice(0, 300) }, { merge: true });
      await db.collection("workspace_properties").doc(propertyId).set({ agentStatus: "failed" }, { merge: true });
    }
  });

  return NextResponse.json({ run });
}
