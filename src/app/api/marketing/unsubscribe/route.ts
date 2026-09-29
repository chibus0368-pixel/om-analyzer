import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { COLL, SITE_URL, emailKey, verifyUnsubToken } from "@/lib/marketing/server";

export const dynamic = "force-dynamic";

async function suppress(email: string, reason: string) {
  await getAdminDb().collection(COLL.suppressions).doc(emailKey(email)).set({ email: email.toLowerCase(), reason, at: new Date().toISOString() });
}

function params(req: NextRequest) {
  const e = (req.nextUrl.searchParams.get("e") || "").trim().toLowerCase();
  const t = req.nextUrl.searchParams.get("t") || "";
  return { e, t, ok: !!e && !!t && verifyUnsubToken(e, t) };
}

/** One-click unsubscribe (RFC 8058) from the List-Unsubscribe header, and the /unsubscribe page's confirm button. */
export async function POST(req: NextRequest) {
  const { e, ok } = params(req);
  if (!ok) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  await suppress(e, "unsubscribe");
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { e, t } = params(req);
  return NextResponse.redirect(`${SITE_URL}/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`);
}
