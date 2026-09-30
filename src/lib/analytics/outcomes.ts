/**
 * ScoreOM outcomes (signups, first upload, 14-day return) grouped by the
 * first-touch UTM tags saved at signup. Same member data and definitions as
 * GET /api/bot/usage (loadMembers + RETURN_* rules). Aggregate counts only:
 * no emails, names or deal contents.
 */
import { loadMembers, isTestSource, RETURN_WINDOW_MS } from "@/lib/bot-access";
import { chicagoRange, utcDayKey } from "./range";

export interface Counts {
  signups: number;
  first_uploads: number;          // users_with_1plus_upload
  total_uploads: number;
  returned_within_14d: number;
  return_denominator: number;     // first uploaders minus those still inside their 14-day window
}
const blank = (): Counts => ({ signups: 0, first_uploads: 0, total_uploads: 0, returned_within_14d: 0, return_denominator: 0 });

export interface OutcomeRow extends Counts { utm_source: string; utm_campaign: string | null; utm_content: string | null }

export async function getOutcomes(days: number) {
  const now = Date.now();
  const { since } = chicagoRange(days, now);
  const members = (await loadMembers()).filter(m => m.signedUpAt >= since && !isTestSource(m.source));

  const totals = blank();
  const bySource = new Map<string, Counts>();
  const bySourceCampaign = new Map<string, OutcomeRow>();
  const byFull = new Map<string, OutcomeRow>();
  const daily = new Map<string, number>();

  const add = (c: Counts, m: typeof members[number]) => {
    c.signups++;
    c.total_uploads += m.uploads.length;
    if (!m.firstUploadAt) return;
    c.first_uploads++;
    const stillInWindow = !m.returnedAt && now - m.firstUploadAt < RETURN_WINDOW_MS;
    if (m.returnedAt) c.returned_within_14d++;
    if (!stillInWindow) c.return_denominator++;
  };

  for (const m of members) {
    add(totals, m);
    const s = (m.source || "untracked").toLowerCase();
    if (!bySource.has(s)) bySource.set(s, blank());
    add(bySource.get(s)!, m);
    const k2 = `${s}|${m.campaign || ""}`;
    if (!bySourceCampaign.has(k2)) bySourceCampaign.set(k2, { ...blank(), utm_source: s, utm_campaign: m.campaign, utm_content: null });
    add(bySourceCampaign.get(k2)!, m);
    const k3 = `${s}|${m.campaign || ""}|${m.content || ""}`;
    if (!byFull.has(k3)) byFull.set(k3, { ...blank(), utm_source: s, utm_campaign: m.campaign, utm_content: m.content });
    add(byFull.get(k3)!, m);
    const d = utcDayKey(m.signedUpAt);
    daily.set(d, (daily.get(d) || 0) + 1);
  }
  return {
    totals,
    by_source: [...bySource.entries()].map(([utm_source, c]) => ({ utm_source, ...c })),
    by_source_campaign: [...bySourceCampaign.values()],
    by_source_campaign_content: [...byFull.values()],
    daily_signups: [...daily.entries()].map(([date, signups]) => ({ date, signups })),
  };
}
