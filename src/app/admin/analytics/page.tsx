"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import NotFound from "@/app/not-found";

/* Private, read-only analytics for ScoreOM. The API returns 404 unless the
   signed-in account is on ADMIN_EMAILS; anyone else sees the normal 404 page. */

const BG = "#161A23", CARD = "#1D2230", LINE = "rgba(255,255,255,0.08)", MUTED = "#8B93A5", TEXT = "#E8EBF1", LIME = "#84CC16";
const DAY_OPTIONS = [7, 14, 30, 90];
const MIN_VISITORS = 20, MIN_SIGNUPS = 5;

type Any = any;
const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US"));

function Rate({ num, den, min }: { num: number; den: number | null | undefined; min: number }) {
  if (den == null || den === 0 || den < min) {
    return <span title={`Based on ${den ?? 0}, need ${min}+`} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "#9CA3AF", background: "rgba(255,255,255,0.06)", border: `1px solid ${LINE}`, borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>low sample</span>;
  }
  return <b style={{ color: TEXT }}>{((num / den) * 100).toFixed(1)}%</b>;
}

const APPROX_TIP = "Approximate: visits are tagged on every visit, but signups are credited to the person's first visit, so the two don't line up exactly.";
function Approx() {
  return <span title={APPROX_TIP} style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: MUTED, borderBottom: `1px dotted ${MUTED}`, cursor: "help", textTransform: "none" }}>approx.</span>;
}
/** "7 pm to 7 pm" in daylight time, "6 pm to 6 pm" in standard time. */
function utcDayNote() {
  const utcMidnight = new Date(); utcMidnight.setUTCHours(0, 0, 0, 0);
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(utcMidnight));
  const t = `${h > 12 ? h - 12 : h} pm`;
  return `Days are UTC (${t} to ${t} Central).`;
}

function Card({ label, children, sub, approx }: { label: string; children: React.ReactNode; sub?: string; approx?: boolean }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}{approx && <Approx />}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: TEXT, marginTop: 6, fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>{children}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Chart({ days }: { days: { date: string; visitors: number; signups: number }[] }) {
  if (!days.length) return <div style={{ color: MUTED, fontSize: 13, padding: 20 }}>No traffic data yet.</div>;
  const W = 900, H = 240, P = { l: 40, r: 40, t: 14, b: 26 };
  const maxV = Math.max(1, ...days.map(d => d.visitors)), maxS = Math.max(1, ...days.map(d => d.signups));
  const x = (i: number) => P.l + (days.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (days.length - 1));
  const yV = (v: number) => H - P.b - (v / maxV) * (H - P.t - P.b);
  const yS = (v: number) => H - P.b - (v / maxS) * (H - P.t - P.b);
  const bw = Math.max(3, Math.min(18, (W - P.l - P.r) / days.length - 4));
  const path = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yV(d.visitors).toFixed(1)}`).join(" ");
  const step = Math.ceil(days.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Daily visitors and signups">
      {[0, 0.5, 1].map(f => <line key={f} x1={P.l} x2={W - P.r} y1={yV(maxV * f)} y2={yV(maxV * f)} stroke={LINE} />)}
      <text x={P.l - 6} y={yV(maxV) + 4} textAnchor="end" fontSize="10" fill={MUTED}>{fmt(maxV)}</text>
      <text x={P.l - 6} y={yV(0) + 4} textAnchor="end" fontSize="10" fill={MUTED}>0</text>
      <text x={W - P.r + 6} y={yS(maxS) + 4} fontSize="10" fill={LIME}>{maxS}</text>
      {days.map((d, i) => d.signups > 0 && (
        <rect key={`s${i}`} x={x(i) - bw / 2} y={yS(d.signups)} width={bw} height={H - P.b - yS(d.signups)} rx="2" fill={LIME} opacity="0.85"><title>{`${d.date}: ${d.signups} signups`}</title></rect>
      ))}
      <path d={path} fill="none" stroke="#E8EBF1" strokeWidth="2" strokeLinejoin="round" />
      {days.map((d, i) => <circle key={`v${i}`} cx={x(i)} cy={yV(d.visitors)} r="2.6" fill="#E8EBF1"><title>{`${d.date}: ${d.visitors} visitors`}</title></circle>)}
      {days.map((d, i) => i % step === 0 && <text key={`t${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={MUTED}>{d.date.slice(5)}</text>)}
    </svg>
  );
}

const th: React.CSSProperties = { textAlign: "right", padding: "9px 10px", fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "right", padding: "9px 10px", fontSize: 13.5, color: TEXT, borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" };
const tdL: React.CSSProperties = { ...td, textAlign: "left", whiteSpace: "normal", wordBreak: "break-word" };
const thL: React.CSSProperties = { ...th, textAlign: "left" };

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: TEXT }}>{title}</h2>
        {note && <span style={{ fontSize: 11.5, color: MUTED }}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

const UNTAGGED = "(none)";
const UNTAGGED_DB = new Set(["direct", "referral", "untracked"]);

export default function AdminAnalyticsPage() {
  const { user, loading } = useAuth();
  const [days, setDays] = useState(14);
  const [data, setData] = useState<Any>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (loading) return;
    if (!user) { setState("denied"); return; }
    let live = true;
    setState(s => (s === "ok" ? s : "loading"));
    (async () => {
      try {
        const token = await user.getIdToken();
        const r = await fetch(`/api/admin/analytics?days=${days}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!live) return;
        if (r.status === 404) { setState("denied"); return; }
        if (!r.ok) { setState("error"); return; }
        setData(await r.json()); setState("ok");
      } catch { if (live) setState("error"); }
    })();
    return () => { live = false; };
  }, [user, loading, days]);

  const t = data?.traffic, o = data?.outcomes;

  const daily = useMemo(() => {
    const m = new Map<string, { date: string; visitors: number; signups: number }>();
    (t?.daily || []).forEach((d: Any) => m.set(d.date, { date: d.date, visitors: d.visitors, signups: 0 }));
    (o?.daily_signups || []).forEach((d: Any) => { const r = m.get(d.date) || { date: d.date, visitors: 0, signups: 0 }; r.signups = d.signups; m.set(d.date, r); });
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [t, o]);

  const sources = useMemo(() => {
    const key = (s: string) => (UNTAGGED_DB.has(s) ? UNTAGGED : s);
    const map = new Map<string, Any>();
    const get = (k: string) => { if (!map.has(k)) map.set(k, { source: k, visitors: null, signups: 0, first_uploads: 0, returned: 0, retDen: 0 }); return map.get(k); };
    (t?.by_utm_source || []).forEach((r: Any) => { const x = get(r.utm_source); x.visitors = (x.visitors || 0) + r.visitors; });
    (o?.by_source || []).forEach((r: Any) => { const x = get(key(r.utm_source)); x.signups += r.signups; x.first_uploads += r.first_uploads; x.returned += r.returned_within_14d; x.retDen += r.return_denominator; });
    return [...map.values()].sort((a, b) => (b.visitors || 0) - (a.visitors || 0) || b.signups - a.signups);
  }, [t, o]);

  function children(source: string) {
    // Campaign level
    const camps = new Map<string, Any>();
    const g = (c: string) => { if (!camps.has(c)) camps.set(c, { campaign: c, visitors: null, signups: 0, first_uploads: 0, returned: 0, retDen: 0, contents: new Map<string, Any>() }); return camps.get(c); };
    if (source === UNTAGGED) {
      (o?.by_source || []).filter((r: Any) => UNTAGGED_DB.has(r.utm_source)).forEach((r: Any) => {
        const c = g(r.utm_source === "direct" ? "direct (no referrer)" : r.utm_source === "referral" ? "referral (see Referrers)" : "untracked (before tracking)");
        c.signups += r.signups; c.first_uploads += r.first_uploads; c.returned += r.returned_within_14d; c.retDen += r.return_denominator;
      });
      return [...camps.values()];
    }
    (t?.by_utm_source_campaign || []).filter((r: Any) => r.utm_source === source).forEach((r: Any) => { const c = g(r.utm_campaign); c.visitors = (c.visitors || 0) + r.visitors; });
    (o?.by_source_campaign || []).filter((r: Any) => r.utm_source === source).forEach((r: Any) => { const c = g(r.utm_campaign || UNTAGGED); c.signups += r.signups; c.first_uploads += r.first_uploads; c.returned += r.returned_within_14d; c.retDen += r.return_denominator; });
    for (const c of camps.values()) {
      const gc = (k: string) => { if (!c.contents.has(k)) c.contents.set(k, { content: k, visitors: null, signups: 0, first_uploads: 0, returned: 0, retDen: 0 }); return c.contents.get(k); };
      (t?.by_utm_campaign_content || []).filter((r: Any) => r.utm_campaign === c.campaign).forEach((r: Any) => { const x = gc(r.utm_content); x.visitors = (x.visitors || 0) + r.visitors; });
      (o?.by_source_campaign_content || []).filter((r: Any) => r.utm_source === source && (r.utm_campaign || UNTAGGED) === c.campaign).forEach((r: Any) => { const x = gc(r.utm_content || UNTAGGED); x.signups += r.signups; x.first_uploads += r.first_uploads; x.returned += r.returned_within_14d; x.retDen += r.return_denominator; });
    }
    return [...camps.values()].sort((a, b) => (b.visitors || 0) - (a.visitors || 0) || b.signups - a.signups);
  }

  if (state === "denied") return <NotFound />;

  const tot = o?.totals;
  const cells = (r: Any) => (<>
    <td style={td}>{fmt(r.visitors)}</td>
    <td style={td}>{fmt(r.signups)}</td>
    <td style={td} title={APPROX_TIP}><Rate num={r.signups} den={r.visitors} min={MIN_VISITORS} /> <span style={{ color: MUTED, fontSize: 10.5 }}>~</span></td>
    <td style={td}>{fmt(r.first_uploads)} <span style={{ color: MUTED, fontSize: 12 }}>(<Rate num={r.first_uploads} den={r.signups} min={MIN_SIGNUPS} />)</span></td>
    <td style={td}>{fmt(r.returned)} <span style={{ color: MUTED, fontSize: 12 }}>(<Rate num={r.returned} den={r.retDen} min={MIN_SIGNUPS} />)</span></td>
  </>);

  return (
    <main style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "Inter, system-ui, sans-serif", padding: "24px 16px 60px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: LIME, letterSpacing: ".08em", textTransform: "uppercase" }}>ScoreOM · private</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}>Analytics</h1>
          </div>
          <div role="group" aria-label="Date range" style={{ display: "inline-flex", background: CARD, border: `1px solid ${LINE}`, borderRadius: 999, padding: 3 }}>
            {DAY_OPTIONS.map(d => (
              <button key={d} onClick={() => setDays(d)} style={{ border: 0, cursor: "pointer", borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 700, background: d === days ? LIME : "transparent", color: d === days ? "#10140a" : MUTED }}>{d}d</button>
            ))}
          </div>
        </header>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
          {t ? `Since ${new Date(t.range.since).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric" })} Central · traffic cached 10 min` : state === "loading" ? "Loading…" : ""}
        </div>

        {state === "error" && <div style={{ marginTop: 16, color: "#FCA5A5" }}>Could not load analytics. Try again in a minute.</div>}
        {data?.traffic_error && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", color: "#FDE68A", fontSize: 13 }}>Traffic unavailable: {data.traffic_error}</div>}
        {data?.outcomes_error && <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", fontSize: 13 }}>Signup data unavailable: {data.outcomes_error}</div>}

        {state === "ok" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 16 }}>
            <Card label="Visitors">{fmt(t?.totals.visitors)}</Card>
            <Card label="Page views">{fmt(t?.totals.pageviews)}</Card>
            <Card label="Signups">{fmt(tot?.signups)}</Card>
            <Card label="Visitor → signup" approx><Rate num={tot?.signups || 0} den={t?.totals.visitors} min={MIN_VISITORS} /></Card>
            <Card label="First upload" sub="of signups"><Rate num={tot?.first_uploads || 0} den={tot?.signups} min={MIN_SIGNUPS} /></Card>
            <Card label="14-day return" sub="of first uploaders, window closed"><Rate num={tot?.returned_within_14d || 0} den={tot?.return_denominator} min={MIN_SIGNUPS} /></Card>
          </div>

          <Section title="Visitors and signups by day" note="Line: visitors · bars: signups">
            <Chart days={daily} />
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{utcDayNote()}</div>
          </Section>

          <Section title="By source" note="Click a row to compare campaigns and content">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr><th style={thL}>utm_source</th><th style={th}>Visitors</th><th style={th}>Signups</th><th style={th}>Signup %<Approx /></th><th style={th}>First uploads</th><th style={th}>14-day returns</th></tr></thead>
                <tbody>
                  {sources.length === 0 && <tr><td style={tdL} colSpan={6}>No data in this range.</td></tr>}
                  {sources.map((s: Any) => (
                    <Fragment key={s.source}>
                      <tr onClick={() => setOpen(p => ({ ...p, [s.source]: !p[s.source] }))} style={{ cursor: "pointer", background: open[s.source] ? "rgba(132,204,22,0.06)" : undefined }}>
                        <td style={{ ...tdL, fontWeight: 700 }}><span style={{ color: LIME, display: "inline-block", width: 14 }}>{open[s.source] ? "▾" : "▸"}</span>{s.source === UNTAGGED ? "untagged" : s.source}</td>
                        {cells(s)}
                      </tr>
                      {open[s.source] && children(s.source).map((c: Any) => (
                        <Fragment key={s.source + c.campaign}>
                          <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                            <td style={{ ...tdL, paddingLeft: 30, color: "#C7CCD6" }}><span style={{ color: MUTED, fontSize: 11 }}>campaign </span>{c.campaign}</td>
                            {cells(c)}
                          </tr>
                          {c.contents && [...c.contents.values()].sort((a: Any, b: Any) => (b.visitors || 0) - (a.visitors || 0) || b.signups - a.signups).map((x: Any) => (
                            <tr key={s.source + c.campaign + x.content} style={{ background: "rgba(255,255,255,0.035)" }}>
                              <td style={{ ...tdL, paddingLeft: 50, color: "#AEB4C0" }}><span style={{ color: MUTED, fontSize: 11 }}>content </span>{x.content}</td>
                              {cells(x)}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8 }}>Visitors from Vercel Web Analytics; signups, uploads and returns from ScoreOM for accounts created in this range, by the first-touch tag saved at signup. Rates under {MIN_VISITORS} visitors or {MIN_SIGNUPS} signups show as low sample. Signup % is approximate (hover for why). Internal test traffic (utm_source=test) is excluded.</div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            <Section title="Referrers" note="Includes untagged traffic">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={thL}>Referrer</th><th style={th}>Visitors</th></tr></thead>
                <tbody>{(t?.by_referrer || []).map((r: Any) => <tr key={r.referrer_hostname}><td style={tdL}>{r.referrer_hostname === UNTAGGED ? "direct / hidden" : r.referrer_hostname}</td><td style={td}>{fmt(r.visitors)}</td></tr>)}</tbody>
              </table>
            </Section>
            <Section title="Top pages">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={thL}>Path</th><th style={th}>Views</th></tr></thead>
                <tbody>{(t?.top_paths || []).map((r: Any) => <tr key={r.path}><td style={tdL}>{r.path}</td><td style={td}>{fmt(r.pageviews)}</td></tr>)}</tbody>
              </table>
            </Section>
          </div>
        </>)}
      </div>
    </main>
  );
}
