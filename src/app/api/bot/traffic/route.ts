import { NextRequest, NextResponse } from "next/server";
import { checkBotKey, NO_STORE } from "@/lib/bot-access";
import { parseDays } from "@/lib/analytics/range";
import { getTraffic, TrafficConfigError, TRAFFIC_DEFINITIONS } from "@/lib/analytics/vercel-traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/traffic?days=N (7, 14, 30 or 90; default 14). Read-only.
 * Vercel Web Analytics traffic: totals, by day, by utm source / campaign / content,
 * by referrer hostname and top paths. Same Bearer auth as the other bot endpoints.
 */
export async function GET(req: NextRequest) {
  const denied = checkBotKey(req);
  if (denied) return denied;
  try {
    const days = parseDays(req.nextUrl.searchParams.get("days"));
    const t = await getTraffic(days);
    return NextResponse.json({ generatedAt: new Date().toISOString(), ...t, definitions: TRAFFIC_DEFINITIONS }, { headers: NO_STORE });
  } catch (e: any) {
    const msg = e instanceof TrafficConfigError ? e.message : "Failed to load traffic from Vercel";
    console.error("[bot/traffic]", e?.message);
    return NextResponse.json({ error: msg }, { status: e instanceof TrafficConfigError ? 503 : 502, headers: NO_STORE });
  }
}
