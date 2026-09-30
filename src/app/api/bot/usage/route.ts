import { NextRequest, NextResponse } from "next/server";
import { checkBotKey, loadMembers, dayKey, NO_STORE, DAY_MS, RETURN_WINDOW_MS } from "@/lib/bot-access";

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
    type SrcRow = { utm_source: string; utm_campaign: string | null; utm_content: string | null; referrer_host: string | null; signups: number; users_with_1plus_upload: number; total_uploads: number; returned_within_14d: number };
    const bySrc = new Map<string, SrcRow>();
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
      // by_source: grouped by first-touch utm_source / utm_campaign / utm_content.
      const k2 = `${m.source}|${m.campaign || ""}|${m.content || ""}|${m.source === "referral" ? m.referrerHost || "" : ""}`;
      if (!bySrc.has(k2)) bySrc.set(k2, { utm_source: m.source, utm_campaign: m.campaign, utm_content: m.content, referrer_host: m.source === "referral" ? m.referrerHost : null, signups: 0, users_with_1plus_upload: 0, total_uploads: 0, returned_within_14d: 0 });
      const r2 = bySrc.get(k2)!;
      r2.signups++;
      if (m.uploads.length) r2.users_with_1plus_upload++;
      r2.total_uploads += m.uploads.length;
      if (m.returnedAt) r2.returned_within_14d++;
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
        source: "First-touch utm_source from the som_attr cookie. 'referral' = no UTMs, arrived from another site (see referrer_host). 'direct' = no UTMs and no outside referrer. 'untracked' = signed up before source tracking existed.",
        by_source: "Aggregates for accounts that signed up in the window, grouped by first-touch utm_source / utm_campaign / utm_content. total_uploads counts deals (duplicated copies excluded). returned_within_14d uses the same rule as returnedWithin14d.",
      },
      totals: withRates(totals),
      by_source: [...bySrc.values()].sort((a, b) => b.signups - a.signups),
      bySource: [...bySource.values()].map(withRates).sort((a, b) => b.signups - a.signups),
      daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({ date, ...r })),
    }, { headers: NO_STORE });
  } catch (err: any) {
    console.error("[bot/usage]", err?.message);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500, headers: NO_STORE });
  }
}
