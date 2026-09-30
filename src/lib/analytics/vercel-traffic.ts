/**
 * Vercel Web Analytics (traffic), server-side only.
 *
 * Endpoints (docs: vercel.com/docs/analytics/web-analytics-api):
 *   GET https://api.vercel.com/v1/query/web-analytics/visits/count      -> { data: { pageviews, visitors } }
 *   GET https://api.vercel.com/v1/query/web-analytics/visits/aggregate  -> { data: [{ <dims>, pageviews, visitors }] }
 * Params: projectId, teamId, since, until, by (1-2 dims, array), limit (1-100), filter (OData).
 * Both default to production data.
 *
 * Env: VERCEL_ANALYTICS_TOKEN (read-only), VERCEL_TEAM_ID, VERCEL_PROJECT_ID.
 * Responses are cached 10 minutes (Next data cache + in-memory).
 */
import { chicagoRange, utcDayKey } from "./range";

const API = "https://api.vercel.com/v1/query/web-analytics/visits";
const TTL_MS = 10 * 60 * 1000;
const mem = new Map<string, { at: number; data: any }>();

export class TrafficConfigError extends Error {}

function cfg() {
  const token = process.env.VERCEL_ANALYTICS_TOKEN || "";
  const projectId = process.env.VERCEL_PROJECT_ID || "";
  const teamId = process.env.VERCEL_TEAM_ID || "";
  if (!token || !projectId) throw new TrafficConfigError("Set VERCEL_ANALYTICS_TOKEN and VERCEL_PROJECT_ID (and VERCEL_TEAM_ID for team projects) in Vercel.");
  return { token, projectId, teamId };
}

async function call(kind: "count" | "aggregate", params: Record<string, string | string[]>) {
  const { token, projectId, teamId } = cfg();
  const build = (joinArrays: boolean) => {
    const q = new URLSearchParams({ projectId });
    if (teamId) q.set("teamId", teamId);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) { if (joinArrays) q.set(k, v.join(",")); else v.forEach(x => q.append(k, x)); }
      else q.set(k, v);
    }
    return `${API}/${kind}?${q.toString()}`;
  };
  const key = build(false);
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const doFetch = (url: string) => fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 600 },
  } as any);
  let res = await doFetch(key);
  // `by` is an array param; the spec uses repeated keys. Fall back to comma-joined if rejected.
  if (res.status === 400 && Array.isArray(params.by) && params.by.length > 1) res = await doFetch(build(true));
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vercel Web Analytics ${kind} ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  mem.set(key, { at: Date.now(), data });
  return data;
}

const clean = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : "(none)");
const rows = (r: any): any[] => (Array.isArray(r?.data) ? r.data : []);

export interface Traffic {
  range: { days: number; since: string; until: string; timezone: string };
  totals: { visitors: number; pageviews: number };
  daily: { date: string; visitors: number; pageviews: number }[];            // UTC days (Vercel buckets by UTC)
  by_utm_source: { utm_source: string; visitors: number; pageviews: number }[];
  by_utm_source_campaign: { utm_source: string; utm_campaign: string; visitors: number; pageviews: number }[];
  by_utm_campaign_content: { utm_campaign: string; utm_content: string; visitors: number; pageviews: number }[];
  by_referrer: { referrer_hostname: string; visitors: number; pageviews: number }[];
  top_paths: { path: string; visitors: number; pageviews: number }[];
}

export async function getTraffic(days: number): Promise<Traffic> {
  const r = chicagoRange(days);
  const base = { since: r.sinceIso, until: r.untilIso };
  // Internal test visits (utm_source=test) are removed by querying them with an explicit
  // eq filter and subtracting. (A "ne" filter would also drop untagged visits, where
  // utmSource is empty, and passing any filter needs the production filter restated.)
  const TEST = "environment eq 'production' and utmSource eq 'test'";
  const [count, daily, src, srcCamp, campCont, refs, paths, tCount, tDaily, tRefs, tPaths] = await Promise.all([
    call("count", base),
    call("aggregate", { ...base, by: ["day"], limit: "100" }),
    call("aggregate", { ...base, by: ["utmSource"], limit: "100" }),
    call("aggregate", { ...base, by: ["utmSource", "utmCampaign"], limit: "100" }),
    call("aggregate", { ...base, by: ["utmCampaign", "utmContent"], limit: "100" }),
    call("aggregate", { ...base, by: ["referrerHostname"], limit: "50" }),
    call("aggregate", { ...base, by: ["requestPath"], limit: "50" }),
    call("count", { ...base, filter: TEST }),
    call("aggregate", { ...base, by: ["day"], limit: "100", filter: TEST }),
    call("aggregate", { ...base, by: ["referrerHostname"], limit: "50", filter: TEST }),
    call("aggregate", { ...base, by: ["requestPath"], limit: "50", filter: TEST }),
  ]);
  const n = (v: any) => (typeof v === "number" ? v : Number(v) || 0);
  const byVisitors = (a: any, b: any) => b.visitors - a.visitors;
  const minus = (list: any[], testRows: any[], key: (x: any) => string) => {
    const t = new Map<string, any>(); testRows.forEach(x => t.set(key(x), x));
    return list.map(x => { const y = t.get(key(x)); return y ? { ...x, visitors: Math.max(0, n(x.visitors) - n(y.visitors)), pageviews: Math.max(0, n(x.pageviews) - n(y.pageviews)) } : x; })
      .filter(x => n(x.visitors) > 0 || n(x.pageviews) > 0);
  };
  const notTest = (x: any) => clean(x.utmSource).toLowerCase() !== "test";
  const dailyRows = minus(rows(daily), rows(tDaily), x => String(x.timestamp));
  return {
    range: { days, since: r.sinceIso, until: r.untilIso, timezone: "America/Chicago" },
    totals: { visitors: Math.max(0, n(count?.data?.visitors) - n(tCount?.data?.visitors)), pageviews: Math.max(0, n(count?.data?.pageviews) - n(tCount?.data?.pageviews)) },
    daily: dailyRows.map(x => ({ date: utcDayKey(Date.parse(x.timestamp)), visitors: n(x.visitors), pageviews: n(x.pageviews) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    by_utm_source: rows(src).filter(notTest).map(x => ({ utm_source: clean(x.utmSource).toLowerCase(), visitors: n(x.visitors), pageviews: n(x.pageviews) })).sort(byVisitors),
    by_utm_source_campaign: rows(srcCamp).filter(notTest).map(x => ({ utm_source: clean(x.utmSource).toLowerCase(), utm_campaign: clean(x.utmCampaign), visitors: n(x.visitors), pageviews: n(x.pageviews) })).sort(byVisitors),
    // campaign x content can't carry utmSource (two-dimension limit); test links use campaign "attr", so drop campaigns only seen under source=test.
    by_utm_campaign_content: rows(campCont).map(x => ({ utm_campaign: clean(x.utmCampaign), utm_content: clean(x.utmContent), visitors: n(x.visitors), pageviews: n(x.pageviews) }))
      .filter(x => !rows(srcCamp).some(y => clean(y.utmSource).toLowerCase() === "test" && clean(y.utmCampaign) === x.utm_campaign) || rows(srcCamp).some(y => clean(y.utmSource).toLowerCase() !== "test" && clean(y.utmCampaign) === x.utm_campaign))
      .sort(byVisitors),
    by_referrer: minus(rows(refs), rows(tRefs), x => clean(x.referrerHostname)).map(x => ({ referrer_hostname: clean(x.referrerHostname), visitors: n(x.visitors), pageviews: n(x.pageviews) })).sort(byVisitors),
    top_paths: minus(rows(paths), rows(tPaths), x => clean(x.requestPath)).map(x => ({ path: clean(x.requestPath), visitors: n(x.visitors), pageviews: n(x.pageviews) })).sort((a, b) => b.pageviews - a.pageviews),
  };
}

export const TRAFFIC_DEFINITIONS = {
  source: "Vercel Web Analytics (production only). Cached for 10 minutes.",
  visitors: "Unique visitors in the range, as counted by Vercel (daily-hashed, no cookies). Totals come from the count endpoint, so they are not the sum of the rows.",
  pageviews: "Page views in the range.",
  daily: "Grouped by UTC day (7 pm to 7 pm Central during daylight time, 6 pm to 6 pm in winter). Vercel's API has no timezone option; the range itself starts at midnight America/Chicago.",
  test_traffic: "Visits tagged utm_source=test are excluded everywhere (queried with an eq filter and subtracted). A visitor who also came untagged may be subtracted once, so visitor totals can undercount by a handful.",
  utm: "utm_source / utm_campaign / utm_content as seen in the landing URL. '(none)' = no tag. Sources are lowercased. A campaign's content rows come from a campaign x content breakdown (the API allows two dimensions per query).",
  others: "Rows beyond the query limit are grouped by Vercel into 'Others'.",
  referrer_hostname: "The site that sent the visitor. '(none)' = direct or referrer hidden.",
};
