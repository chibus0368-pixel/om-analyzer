import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { COLL, SITE_URL } from "@/lib/marketing/server";
import { PLATFORMS, exchangeCode, type Platform } from "@/lib/marketing/social";

export const dynamic = "force-dynamic";

/** OAuth redirect target for X / Instagram / TikTok. Register this exact URL in each developer portal. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = (q: string) => NextResponse.redirect(`${SITE_URL}/workspace/admin/marketing?tab=social&${q}`);
  if (!PLATFORMS.includes(platform as Platform)) return back("error=unknown_platform");
  const sp = req.nextUrl.searchParams;
  const err = sp.get("error_description") || sp.get("error");
  if (err) return back(`error=${encodeURIComponent(err)}`);
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return back("error=missing_code");

  const db = getAdminDb();
  const stRef = db.collection(COLL.oauthStates).doc(state);
  const st = await stRef.get();
  if (!st.exists || st.data()!.platform !== platform) return back("error=invalid_state");
  const age = Date.now() - new Date(st.data()!.createdAt).getTime();
  await stRef.delete();
  if (age > 15 * 60000) return back("error=expired_state");

  try {
    const acc = await exchangeCode(platform as Platform, code.replace(/#_$/, ""), st.data()!.verifier);
    await db.collection(COLL.accounts).doc(platform).set({ ...acc, connectedAt: new Date().toISOString() });
    return back(`connected=${platform}`);
  } catch (e: any) {
    return back(`error=${encodeURIComponent(e?.message || "connect_failed")}`);
  }
}
