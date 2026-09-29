import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/marketing/server";
import { runMarketing } from "@/lib/marketing/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/marketing
 * Sends due broadcasts and drip steps and publishes due social posts.
 * Called every 15 minutes by .github/workflows/marketing-cron.yml, plus a
 * daily Vercel Cron as a backup. Auth: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runMarketing(req.headers.get("user-agent")?.includes("vercel-cron") ? "vercel-cron" : "scheduler"));
}
