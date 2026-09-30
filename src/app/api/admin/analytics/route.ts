import { NextRequest, NextResponse } from "next/server";
import { isAllowlistedAdmin } from "@/lib/analytics/admin-gate";
import { parseDays } from "@/lib/analytics/range";
import { getTraffic, TrafficConfigError, TRAFFIC_DEFINITIONS } from "@/lib/analytics/vercel-traffic";
import { getOutcomes } from "@/lib/analytics/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/** GET /api/admin/analytics?days=14. Read-only. Anyone not on ADMIN_EMAILS gets a plain 404. */
export async function GET(req: NextRequest) {
  if (!(await isAllowlistedAdmin(req))) return new NextResponse("Not Found", { status: 404, headers: NO_STORE });
  const days = parseDays(req.nextUrl.searchParams.get("days"));
  const [traffic, outcomes] = await Promise.allSettled([getTraffic(days), getOutcomes(days)]);
  return NextResponse.json({
    days,
    traffic: traffic.status === "fulfilled" ? traffic.value : null,
    traffic_error: traffic.status === "rejected"
      ? (traffic.reason instanceof TrafficConfigError ? traffic.reason.message : String(traffic.reason?.message || traffic.reason).slice(0, 300))
      : null,
    outcomes: outcomes.status === "fulfilled" ? outcomes.value : null,
    outcomes_error: outcomes.status === "rejected" ? String(outcomes.reason?.message || outcomes.reason).slice(0, 300) : null,
    definitions: TRAFFIC_DEFINITIONS,
  }, { headers: NO_STORE });
}
