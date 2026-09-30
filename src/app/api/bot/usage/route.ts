import { NextRequest, NextResponse } from "next/server";
import { checkBotKey, loadMembers, dayKey, memberIso, NO_STORE, DAY_MS, RETURN_WINDOW_MS } from "@/lib/bot-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/usage?days=30
 * Read-only usage numbers for grokbot. Registered accounts only (anonymous
 * trial visitors are left out). Days are US Central calendar days.
 */
export async function GET(req: NextRequest) {
  const denied = checkBotKey(req);
  if (denied) return denied;
  try {
    const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
    const now = Date.now();
    const from = now - days * DAY_MS;
    const members = (await loadMembers()).filter(m => m.signedUpAt >= from);

    // Cohort stats: counted by the day / source people signed up under.
    type Row = { signups: number; uploadedFirstOm: number; returnedWithin14d: number; eligibleFor14d: number; stillInWindow: number };
    const blank = (): Row => ({ signups: 0, uploadedFirstOm: 0, returnedWithin14d: 0, eligibleFor14d: 0, stillInWindow: 0 });
    const add = (r: Row, m: typeof members[number]) => {
      r.signups++;
      if (!m.firstUploadAt) return;
      r.uploadedFirstOm++;
      if (m.returnedAt) r.returnedWithin14d++;
      if (now - m.firstUploadAt >= RETURN_WINDOW_MS) r.eligibleFor14d++;
      else if (!m.returnedAt) r.stillInWindow++;
    };
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
    const withRates = (r: Row) => ({
      ...r,
      firstOmRatePct: pct(r.uploadedFirstOm, r.signups),
      returnRatePct: pct(r.returnedWithin14d, r.uploadedFirstOm - r.stillInWindow),
    });

    const totals = blank();
    const byDay = new Map<string, Row>();
    const bySource = new Map<string, Row & { source: string; medium: string | null; campaign: string | null }>();
    // Pre-fill every day so gaps show as zeros.
    for (let t = from; t <= now; t += DAY_MS) byDay.set(dayKey(t), blank());
    for (const m of members) {
      add(totals, m);
      const d = dayKey(m.signedUpAt);
      if (!byDay.has(d)) byDay.set(d, blank());
      add(byDay.get(d)!, m);
      const k = `${m.source}|${m.medium || ""}|${m.campaign || ""}`;
      if (!bySource.has(k)) bySource.set(k, { ...blank(), source: m.source, medium: m.medium, campaign: m.campaign });
      add(bySource.get(k)!, m);
    }

    return NextResponse.json({
      generatedAt: new Date(now).toISOString(),
      window: { days, from: new Date(from).toISOString(), to: new Date(now).toISOString(), timezone: "America/Chicago" },
      definitions: {
        signup: "A registered account (email or Google). Anonymous trial visitors who never registered are not counted.",
        uploadedFirstOm: "The account has at least one deal uploaded. Deals uploaded as a trial before registering count. Duplicated copies do not.",
        returnedWithin14d: "Uploaded another deal at least 1 hour and at most 14 days after their first upload (a separate visit, not the same sitting).",
        eligibleFor14d: "First upload was 14+ days ago, so the return window is closed.",
        stillInWindow: "Uploaded a first OM less than 14 days ago and has not come back yet. Too early to call.",
        returnRatePct: "returnedWithin14d / (uploadedFirstOm - stillInWindow). People still inside their 14 days are left out until they come back or the window closes.",
        source: "First tagged link the person arrived on (utm_source or ref), else the outside site that referred them, else 'direct'. 'untracked' = signed up before source tracking existed.",
      },
      totals: withRates(totals),
      bySource: [...bySource.values()].map(withRates).sort((a, b) => b.signups - a.signups),
      daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({ date, ...r })),
      signups: members
        .sort((a, b) => b.signedUpAt - a.signedUpAt)
        .map(m => ({
          signedUpAt: memberIso(m.signedUpAt),
          source: m.source, medium: m.medium, campaign: m.campaign,
          uploads: m.uploads.length,
          firstUploadAt: memberIso(m.firstUploadAt),
          returnedAt: memberIso(m.returnedAt),
        })),
    }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[bot/usage]", err?.message);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500, headers: NO_STORE });
  }
}
