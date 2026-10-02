import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/save-prompt
 * Records that the "Save this deal" card (SavePromptCard) was shown to, or
 * dismissed by, an anonymous trial user. Stored on users/{uid}.savePrompt so
 * /api/bot/usage can report shown / dismissed / signups by first-touch source.
 * The first occurrence of each event wins; repeats are no-ops.
 *
 * Body: { event: "shown" | "dismissed" }
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const event = body.event === "shown" || body.event === "dismissed" ? (body.event as "shown" | "dismissed") : null;
    if (!event) return NextResponse.json({ error: "Unknown event" }, { status: 400 });

    const decoded = await getAdminAuth().verifyIdToken(token);
    const ref = getAdminDb().collection("users").doc(decoded.uid);
    const snap = await ref.get();
    // Only trial users have this card; never create a doc from here.
    if (!snap.exists || snap.data()?.tier !== "anonymous") return NextResponse.json({ ok: true, recorded: false });

    const field = event === "shown" ? "shownAt" : "dismissedAt";
    const existing = snap.data()?.savePrompt || {};
    if (existing[field]) return NextResponse.json({ ok: true, recorded: false });

    const now = new Date();
    const updates: Record<string, any> = { [`savePrompt.${field}`]: now };
    // A dismissal implies it was shown, even if the "shown" call was lost.
    if (event === "dismissed" && !existing.shownAt) updates["savePrompt.shownAt"] = now;
    await ref.update(updates);
    return NextResponse.json({ ok: true, recorded: true });
  } catch (err: any) {
    console.error("[save-prompt]", err?.message);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
