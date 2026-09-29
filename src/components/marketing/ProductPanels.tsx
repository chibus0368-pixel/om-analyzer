"use client";

/**
 * Stylized product panels for the homepage feature cards.
 *
 * These are enlarged, simplified renderings of real ScoreOM screens (same
 * layout language and the real West Bend Plaza numbers from the app), built in
 * HTML so the important parts stay large and crisp at any size. All sizing is
 * in `em`, and the root font-size follows the stage width (container query
 * units), so a panel scales as one piece on desktop and phones.
 */

const LIME = "#84CC16";

function Ring({ value, max = 100, size = 7.2, stroke = 0.8, color = LIME, track = "rgba(132,204,22,0.16)", label }: {
  value: number; max?: number; size?: number; stroke?: number; color?: string; track?: string; label?: string;
}) {
  const r = 50 - (stroke / size) * 50;
  const c = 2 * Math.PI * r;
  return (
    <div className="pp-ring" style={{ width: `${size}em`, height: `${size}em` }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={(stroke / size) * 100} />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={(stroke / size) * 100} strokeLinecap="round"
          strokeDasharray={`${(c * value) / max} ${c}`} transform="rotate(-90 50 50)" className="pp-ring-arc" />
      </svg>
      <div className="pp-ring-val">
        <b>{value}</b>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="pp-head">
      <div className="pp-title">{title}</div>
      <div className="pp-sub">{sub}</div>
    </div>
  );
}

function Facts({ items }: { items: [string, string][] }) {
  return (
    <div className="pp-facts">
      {items.map(([k, v]) => (
        <div key={k}><span>{k}</span><b>{v}</b></div>
      ))}
    </div>
  );
}

/* ---------------- Deal Score ---------------- */
function ScorePanel() {
  return (
    <div className="pp">
      <Head title="Deal Score" sub="First pass on West Bend Plaza, scored on your criteria" />
      <Facts items={[["Property", "Retail strip"], ["Location", "West Bend, WI"], ["Asking", "$2.53M"], ["GLA", "42,331 SF"]]} />
      <div className="pp-hero">
        <Ring value={73} label="/100" />
        <div className="pp-hero-copy">
          <div className="pp-hero-title">Buy <small>73 of 100</small></div>
          <div className="pp-pills">
            <span className="pp-pill green"><i />Fully leased</span>
            <span className="pp-pill lime"><i />8.75% going-in cap</span>
          </div>
          <p>Fully leased strip center priced well below replacement cost, with <b>solid cash flow</b> and tenant concentration to watch.</p>
        </div>
      </div>
      <div className="pp-stats">
        {[["Going-in cap", "8.75%"], ["DSCR", "1.66x"], ["Price / replacement", "27%"], ["Base IRR", "15.0%"]].map(([k, v]) => (
          <div key={k}><span>{k}</span><b>{v}</b></div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- NOI ---------------- */
function NoiPanel() {
  const rows: [string, string, "pos" | "neg" | "sum"][] = [
    ["Potential gross income", "$342,704", "pos"],
    ["Vacancy & credit loss (5%)", "($17,135)", "neg"],
    ["Operating expenses", "($110,424)", "neg"],
    ["Reserves / CapEx (estimated)", "($10,583)", "neg"],
  ];
  return (
    <div className="pp">
      <Head title="Rebuilt NOI" sub="Year 1 operating statement, built from the OM line items" />
      <div className="pp-compare">
        <div className="pp-cmp om"><span>OM-stated NOI</span><b>$221,308</b></div>
        <div className="pp-arrow" aria-hidden>
          <svg viewBox="0 0 24 24" width="1.6em" height="1.6em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
        <div className="pp-cmp adj"><span>Adjusted NOI</span><b>$185,736</b><em>-16%</em></div>
      </div>
      <div className="pp-lines">
        {rows.map(([k, v, t]) => (
          <div key={k} className={t}><span>{k}</span><b>{v}</b></div>
        ))}
        <div className="total"><span>NOI used in pro forma</span><b>$204,562</b></div>
      </div>
    </div>
  );
}

/* ---------------- Offer ---------------- */
function OfferPanel() {
  const bars: [string, number, string][] = [["-15%", 20.0, "$2.15M"], ["-10%", 18.2, "$2.28M"], ["-5%", 16.5, "$2.40M"], ["Ask", 14.8, "$2.53M"], ["+5%", 13.3, "$2.66M"]];
  const max = 22, target = 15;
  return (
    <div className="pp">
      <Head title="Offer Scenarios" sub="Levered IRR at each purchase price vs. your 15% target" />
      <div className="pp-plot">
        <div className="pp-target" style={{ bottom: `${(target / max) * 100}%` }}><span>15% target</span></div>
        {bars.map(([k, v]) => (
          <div key={k} className={`pp-bar${v >= target ? " ok" : " miss"}${k === "Ask" ? " ask" : ""}`}>
            <div className="pp-bar-col" style={{ height: `${(v / max) * 100}%` }}><b>{v.toFixed(1)}%</b></div>
          </div>
        ))}
      </div>
      <div className="pp-axis">
        {bars.map(([k, , price]) => (
          <div key={k} className={k === "Ask" ? "ask" : ""}><b>{k}</b><small>{price}</small></div>
        ))}
      </div>
      <div className="pp-cases">
        {[["Bull", "18.5%", "g"], ["Base", "15.0%", "b"], ["Bear", "9.3%", "r"]].map(([k, v, c]) => (
          <div key={k} className={`pp-case ${c}`}><span>{k}</span><b>{v}</b><small>levered IRR</small></div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Share ---------------- */
function SharePanel() {
  return (
    <div className="pp pp-share">
      <Head title="Share DealBoard" sub="Lender Package · 17 properties" />
      <div className="pp-link">
        <code>/share/6Heppfrx-dk4</code>
        <span className="pp-copy">
          <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Copied
        </span>
      </div>
      <div className="pp-toggle"><span>Anyone with the link can view</span><i aria-hidden><b /></i></div>
      <div className="pp-share-stats">
        <div><b>17</b><span>deals on a map</span></div>
        <div><b>50</b><span>views</span></div>
        <div><b>0</b><span>logins needed</span></div>
      </div>
    </div>
  );
}

/* ---------------- Email ---------------- */
function FileIcon({ kind }: { kind: "xlsx" | "docx" }) {
  const c = kind === "xlsx" ? "#16a34a" : "#2563eb";
  return (
    <span className="pp-file-ic" style={{ background: c }} aria-hidden>{kind === "xlsx" ? "X" : "W"}</span>
  );
}

function EmailPanel() {
  return (
    <div className="pp pp-share pp-email">
      <Head title="Email this property" sub="Formatted page + Workbook + Brief attached" />
      <div className="pp-field"><span>To</span><b>partner@acquisitions.com</b></div>
      <div className="pp-field"><span>Subject</span><b>West Bend Plaza - ScoreOM</b></div>
      <div className="pp-files">
        <div><FileIcon kind="xlsx" /><b>West Bend Plaza Workbook.xlsx</b><small>40+ fields</small></div>
        <div><FileIcon kind="docx" /><b>West Bend Plaza Brief.docx</b><small>1st-pass brief</small></div>
      </div>
      <div className="pp-send"><span>Deal page link included</span><em>Send</em></div>
    </div>
  );
}

/* ---------------- Rank ---------------- */
function RankPanel() {
  const rows: [string, string, number, string, string][] = [
    ["1", "Greenfield Shopping Center", 78, "$14.2M", "7.80%"],
    ["2", "West Bend Plaza", 73, "$2.53M", "8.75%"],
    ["3", "Hales Corners Plaza", 72, "$9.4M", "8.34%"],
    ["4", "Harwood Retail Center", 69, "$7.0M", "8.39%"],
    ["5", "Fredericksburg Center", 62, "$11.8M", "7.20%"],
  ];
  return (
    <div className="pp pp-share pp-rank">
      <Head title="Deal Scorecard" sub="Retail DealBoard · ranked by score" />
      <div className="pp-rank-rows">
        {rows.map(([n, name, sc, price, cap]) => (
          <div key={n} className={n === "1" ? "top" : ""}>
            <i>{n}</i>
            <b>{name}</b>
            <span>{price}</span>
            <span>{cap}</span>
            <em className={sc >= 70 ? "g" : "a"}>{sc}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Source documents ---------------- */
function DocsPanel() {
  const docs: [string, string, string, string][] = [
    ["PDF", "#dc2626", "Offering Memorandum.pdf", "38 pages"],
    ["X", "#16a34a", "Rent Roll.xlsx", "12 units matched"],
    ["PDF", "#dc2626", "T-12 Operating Statement.pdf", "NOI rebuilt"],
  ];
  const levels = ["Light", "Fair", "Solid", "Sharp"];
  return (
    <div className="pp pp-docs">
      <Head title="Source documents" sub="West Bend Plaza · 3 files · re-analyzed" />
      <div className="pp-doc-rows">
        {docs.map(([ic, c, name, note]) => (
          <div key={name}>
            <span className="pp-file-ic" style={{ background: c }} aria-hidden>{ic}</span>
            <b>{name}</b>
            <small>{note}</small>
            <em aria-hidden>{"\u2713"}</em>
          </div>
        ))}
        <div className="add">
          <span className="pp-file-ic" aria-hidden>+</span>
          <b>Lease abstracts</b>
          <small>Suggested</small>
        </div>
      </div>
      <div className="pp-read">
        <div className="pp-read-top"><span>Read quality</span><b>Sharp</b></div>
        <div className="pp-read-bar">
          {levels.map((l, i) => <div key={l} className={i < 4 ? "on" : ""} style={{ animationDelay: `${i * 0.18}s` }}><small>{l}</small></div>)}
        </div>
        <div className="pp-read-note">OM only was a Light read. The rent roll and T-12 took it to Sharp.</div>
      </div>
    </div>
  );
}

export type PanelKind = "score" | "noi" | "offer" | "share" | "email" | "rank" | "docs";

export function ProductPanel({ kind }: { kind: PanelKind }) {
  if (kind === "score") return <ScorePanel />;
  if (kind === "noi") return <NoiPanel />;
  if (kind === "share") return <SharePanel />;
  if (kind === "email") return <EmailPanel />;
  if (kind === "rank") return <RankPanel />;
  if (kind === "docs") return <DocsPanel />;
  return <OfferPanel />;
}

export function PanelStyles() {
  return (
    <style>{`
      .so-stack-stage { container-type: inline-size; }
      .pp { font-size: 2.05cqw; font-family: 'Plus Jakarta Sans', Inter, sans-serif; color:#0f172a; background:#fff;
        border-radius: 1.3em; padding: 1.6em 1.7em 1.7em; border:1px solid rgba(15,23,42,0.08);
        box-shadow: 0 2em 4em rgba(0,0,0,0.5), 0 0 0 0.45em rgba(255,255,255,0.04); }
      .pp-head { margin-bottom: 1.1em; }
      .pp-title { font-size: 1.55em; font-weight: 800; letter-spacing: -0.02em; color:#0f172a; display:flex; align-items:center; gap:.45em; }
      .pp-title::before { content:""; width:.28em; height:1em; border-radius:.2em; background:${LIME}; }
      .pp-sub { font-size: .92em; color:#64748b; margin-top:.25em; }
      .pp-facts { display:grid; grid-template-columns: repeat(4, 1fr); gap: .6em; padding: .8em 1em; border-radius: .8em; background:#f5f7fa; margin-bottom: 1.1em; }
      .pp-facts span { display:block; font-size:.7em; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#94a3b8; }
      .pp-facts b { font-size:.95em; font-weight:700; color:#0f172a; }
      .pp-hero { display:flex; align-items:center; gap:1.4em; padding: 1.2em 1.3em; border-radius: 1em;
        background: linear-gradient(135deg, rgba(132,204,22,0.10), rgba(132,204,22,0.03)); border:1px solid rgba(132,204,22,0.35); margin-bottom: 1.1em; }
      .pp-ring { position:relative; flex-shrink:0; }
      .pp-ring-val { position:absolute; inset:0; display:flex; align-items:baseline; justify-content:center; padding-top: 34%; gap:.1em; }
      .pp-ring-val b { font-size: 2.3em; font-weight:800; letter-spacing:-0.03em; line-height:1; }
      .pp-ring-val span { font-size:.85em; color:#64748b; font-weight:600; }
      .pp-ring-arc { transition: stroke-dasharray 1.2s ease; }
      .pp-hero-title { font-size: 1.6em; font-weight:800; letter-spacing:-0.02em; color:#3f6212; }
      .pp-hero-title small { font-size:.55em; color:#64748b; font-weight:600; margin-left:.4em; letter-spacing:0; }
      .pp-pills { display:flex; gap:.5em; margin:.55em 0 .6em; flex-wrap:wrap; }
      .pp-pill { display:inline-flex; align-items:center; gap:.4em; font-size:.78em; font-weight:700; padding:.3em .75em; border-radius:99em; }
      .pp-pill i { width:.45em; height:.45em; border-radius:50%; background: currentColor; }
      .pp-pill.green { background:rgba(22,163,74,0.12); color:#15803d; }
      .pp-pill.lime { background:rgba(132,204,22,0.16); color:#4d7c0f; }
      .pp-hero-copy p { font-size:.95em; color:#334155; line-height:1.5; margin:0; }
      .pp-stats { display:grid; grid-template-columns: repeat(4, 1fr); gap:.7em; }
      .pp-stats > div { padding:.8em .9em; border-radius:.8em; border:1px solid #e8edf3; }
      .pp-stats span { display:block; font-size:.7em; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#94a3b8; }
      .pp-stats b { font-size:1.45em; font-weight:800; color:#4d7c0f; letter-spacing:-0.02em; }

      .pp-compare { display:flex; align-items:center; gap:.8em; margin-bottom:1.1em; }
      .pp-cmp { flex:1; padding:1em 1.1em; border-radius:1em; position:relative; }
      .pp-cmp span { display:block; font-size:.75em; font-weight:700; letter-spacing:.07em; text-transform:uppercase; }
      .pp-cmp b { font-size:2.1em; font-weight:800; letter-spacing:-0.03em; }
      .pp-cmp.om { background:#f5f7fa; } .pp-cmp.om span { color:#94a3b8; } .pp-cmp.om b { color:#64748b; text-decoration: line-through; text-decoration-thickness: .06em; text-decoration-color: rgba(220,38,38,0.6); }
      .pp-cmp.adj { background: linear-gradient(135deg, rgba(132,204,22,0.12), rgba(132,204,22,0.04)); border:1px solid rgba(132,204,22,0.4); }
      .pp-cmp.adj span { color:#4d7c0f; } .pp-cmp.adj b { color:#0f172a; }
      .pp-cmp.adj em { position:absolute; top:.8em; right:.9em; font-style:normal; font-size:.8em; font-weight:800; color:#b45309; background:rgba(217,119,6,0.12); padding:.2em .55em; border-radius:99em; }
      .pp-arrow { color:#94a3b8; }
      .pp-lines > div { display:flex; justify-content:space-between; padding:.62em .2em; border-bottom:1px solid #eef2f6; font-size:.98em; }
      .pp-lines span { color:#475569; } .pp-lines b { font-weight:700; }
      .pp-lines .neg b { color:#dc2626; }
      .pp-lines .total { border-bottom:0; margin-top:.4em; padding:.8em .9em; border-radius:.8em; background:#0f172a; }
      .pp-lines .total span { color:#e2e8f0; font-weight:700; } .pp-lines .total b { color:${LIME}; font-size:1.2em; }

      .pp-plot { position:relative; height: 11em; display:flex; align-items:flex-end; gap: 1.1em; padding: 0 .3em; border-bottom: .1em solid #e2e8f0; }
      .pp-bar { flex:1; height:100%; display:flex; flex-direction:column; justify-content:flex-end; }
      .pp-bar-col { width:100%; border-radius:.6em .6em .15em .15em; display:flex; justify-content:center; align-items:flex-start; padding-top:.5em; transform-origin: bottom; animation: ppGrow 1s cubic-bezier(.2,.8,.2,1) both; }
      .pp-bar.ok .pp-bar-col { background: linear-gradient(180deg, #a3e635, #65a30d); }
      .pp-bar.miss .pp-bar-col { background: linear-gradient(180deg, #fcd34d, #f59e0b); }
      .pp-bar.ask .pp-bar-col { box-shadow: 0 0 0 .18em #fff, 0 0 0 .34em #f59e0b; }
      .pp-bar-col b { font-size:.95em; font-weight:800; color:#fff; text-shadow: 0 1px 2px rgba(0,0,0,0.25); }
      .pp-target { position:absolute; left:0; right:0; border-top: .14em dashed #0f172a; z-index:0; }
      .pp-bar { position:relative; z-index:1; }
      .pp-target span { z-index:2; }
      .pp-target span { position:absolute; right:0; top:-1.8em; font-size:.75em; font-weight:800; color:#0f172a; background:#fff; padding:.1em .5em; border-radius:.4em; border:1px solid #e2e8f0; }
      .pp-axis { display:flex; gap:1.1em; padding: .55em .3em 0; margin-bottom: 1.1em; }
      .pp-axis > div { flex:1; text-align:center; line-height:1.2; }
      .pp-axis b { display:block; font-size:.9em; font-weight:800; color:#0f172a; }
      .pp-axis .ask b { color:#b45309; }
      .pp-axis small { font-size:.72em; color:#94a3b8; }
      @keyframes ppGrow { from { transform: scaleY(.1); opacity:.3; } to { transform:none; opacity:1; } }
      .pp-cases { display:grid; grid-template-columns: repeat(3, 1fr); gap:.7em; }
      .pp-case { padding:.75em .9em; border-radius:.8em; }
      .pp-case span { display:block; font-size:.72em; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
      .pp-case b { font-size:1.5em; font-weight:800; letter-spacing:-0.02em; color:#0f172a; }
      .pp-case small { display:block; font-size:.7em; color:#64748b; }
      .pp-case.g { background:#f3fbe6; } .pp-case.g span { color:#4d7c0f; }
      .pp-case.b { background:#eef4ff; } .pp-case.b span { color:#1d4ed8; }
      .pp-case.r { background:#fdf0f0; } .pp-case.r span { color:#b91c1c; }

      .pp.pp-share { font-size: 1.62cqw; padding: 1.3em 1.4em 1.4em; }
      .pp-link { display:flex; align-items:center; gap:.6em; padding:.45em .45em .45em .9em; border-radius:.8em; background:#f5f7fa; border:1px solid #e2e8f0; margin-bottom:.9em; }
      .pp-link code { flex:1; font: 600 .95em ui-monospace, SFMono-Regular, Menlo, monospace; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pp-copy { display:inline-flex; align-items:center; gap:.35em; background:${LIME}; color:#0f172a; font-weight:800; font-size:.85em; padding:.55em .95em; border-radius:.6em; }
      .pp-toggle { display:flex; align-items:center; justify-content:space-between; padding:.7em .2em .9em; border-bottom:1px solid #eef2f6; margin-bottom:.9em; font-size:.95em; font-weight:600; color:#0f172a; }
      .pp-toggle i { width:2.4em; height:1.35em; border-radius:99em; background:${LIME}; position:relative; flex-shrink:0; }
      .pp-toggle i b { position:absolute; right:.18em; top:.18em; width:1em; height:1em; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25); }
      .pp-share-stats { display:grid; grid-template-columns: repeat(3,1fr); gap:.6em; }
      .pp-share-stats > div { padding:.65em .75em; border-radius:.75em; border:1px solid #e8edf3; }
      .pp-share-stats b { display:block; font-size:1.6em; font-weight:800; color:#4d7c0f; letter-spacing:-0.02em; line-height:1.1; }
      .pp-share-stats span { font-size:.75em; color:#64748b; font-weight:600; }
      .pp-field { display:flex; gap:.8em; align-items:baseline; padding:.6em .9em; border-radius:.7em; background:#f5f7fa; border:1px solid #e8edf3; margin-bottom:.5em; font-size:.95em; }
      .pp-field span { width:4.2em; flex-shrink:0; font-size:.78em; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#94a3b8; }
      .pp-field b { font-weight:600; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pp-files { display:grid; gap:.5em; margin:.8em 0; }
      .pp-files > div { display:flex; align-items:center; gap:.7em; padding:.6em .8em; border-radius:.75em; border:1px solid #e2e8f0; }
      .pp-files b { flex:1; font-size:.92em; font-weight:700; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pp-files small { font-size:.75em; color:#64748b; font-weight:600; }
      .pp-file-ic { width:1.9em; height:2.2em; border-radius:.35em; color:#fff; font-weight:800; font-size:.85em; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
      .pp-send { display:flex; align-items:center; justify-content:space-between; gap:1em; font-size:.88em; color:#64748b; font-weight:600; }
      .pp-send em { font-style:normal; background:#0f172a; color:${LIME}; font-weight:800; padding:.6em 1.4em; border-radius:.6em; font-size:1.05em; }
      .pp-rank-rows { display:grid; gap:.4em; }
      .pp-rank-rows > div { display:grid; grid-template-columns: 1.6em 1fr 3.8em 3.4em 2.6em; align-items:center; gap:.6em; padding:.55em .7em; border-radius:.7em; border:1px solid #eef2f6; font-size:.9em; }
      .pp-rank-rows > div.top { background: linear-gradient(135deg, rgba(132,204,22,0.12), rgba(132,204,22,0.03)); border-color: rgba(132,204,22,0.45); }
      .pp-rank-rows i { font-style:normal; font-weight:800; color:#94a3b8; }
      .pp-rank-rows .top i { color:#4d7c0f; }
      .pp-rank-rows b { font-weight:700; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pp-rank-rows span { color:#475569; font-weight:600; text-align:right; }
      .pp-rank-rows em { font-style:normal; font-weight:800; text-align:center; border-radius:99em; padding:.2em 0; }
      .pp-rank-rows em.g { background:rgba(132,204,22,0.18); color:#3f6212; }
      .pp-rank-rows em.a { background:rgba(245,158,11,0.16); color:#b45309; }
      .pp.pp-docs { padding-right: 5.2em; }
      .pp-doc-rows { display:grid; gap:.5em; margin-bottom:1.1em; }
      .pp-doc-rows > div { display:flex; align-items:center; gap:.8em; padding:.65em .85em; border-radius:.8em; border:1px solid #e2e8f0; animation: ppIn .5s ease both; }
      .pp-doc-rows > div:nth-child(2) { animation-delay:.12s } .pp-doc-rows > div:nth-child(3) { animation-delay:.24s } .pp-doc-rows > div:nth-child(4) { animation-delay:.36s }
      .pp-doc-rows .pp-file-ic { font-size:.72em; width:2.4em; height:2.7em; }
      .pp-doc-rows b { flex:1; font-size:1em; font-weight:700; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pp-doc-rows small { font-size:.8em; color:#64748b; font-weight:600; white-space:nowrap; }
      .pp-doc-rows em { font-style:normal; width:1.5em; height:1.5em; border-radius:50%; background:${LIME}; color:#0f172a; font-weight:800; font-size:.85em; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
      .pp-doc-rows .add { border:.12em dashed #f59e0b; background:rgba(245,158,11,0.06); }
      .pp-doc-rows .add .pp-file-ic { background:#fff; color:#b45309; border:.12em dashed #f59e0b; font-size:1em; width:1.7em; height:1.9em; }
      .pp-doc-rows .add b { color:#92400e; }
      .pp-doc-rows .add small { color:#b45309; font-weight:800; background:rgba(245,158,11,0.16); padding:.25em .7em; border-radius:99em; }
      .pp-read { padding:1em 1.1em; border-radius:1em; background:#0f172a; }
      .pp-read-top { display:flex; justify-content:flex-start; gap:.7em; align-items:baseline; margin-bottom:.6em; }
      .pp-read-top span { font-size:.75em; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#94a3b8; }
      .pp-read-top b { font-size:1.35em; font-weight:800; color:${LIME}; letter-spacing:-0.02em; }
      .pp-read-bar { display:grid; grid-template-columns:repeat(4,1fr); gap:.35em; }
      .pp-read-bar > div { height:1.9em; border-radius:.4em; background:rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; }
      .pp-read-bar > div.on { background:linear-gradient(90deg,#65a30d,${LIME}); animation: ppFill .5s ease both; }
      .pp-read-bar > div:nth-child(1).on { background:#f59e0b; } .pp-read-bar > div:nth-child(2).on { background:#eab308; } .pp-read-bar > div:nth-child(3).on { background:#a3e635; }
      .pp-read-bar small { font-size:.72em; font-weight:800; color:#0f172a; }
      .pp-read-note { font-size:.82em; color:#cbd5e1; margin-top:.6em; line-height:1.4; }
      @keyframes ppIn { from { opacity:0; transform:translateY(.5em); } to { opacity:1; transform:none; } }
      @keyframes ppFill { from { opacity:.15; } to { opacity:1; } }
      /* Insight cards (dealstack-style callouts) */
      .so-chip.ins { font-size: 1.78cqw; display:block; white-space:normal; width: 15.5em; padding: 1em 1.1em 1.05em; border-radius: 1em; }
      .so-chip.ins .ins-head { display:flex; align-items:center; gap:.5em; font-size: 1.05em; font-weight: 800; margin-bottom: .35em; }
      .so-chip.ins .ins-head i { width:1.35em; height:1.35em; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:#fff; font-style:normal; font-size:.8em; }
      .so-chip.ins strong { display:block; font-size: 1.12em; font-weight: 800; color:#0f172a; line-height:1.25; }
      .so-chip.ins p { font-size: .92em; color:#64748b; margin:.3em 0 0; line-height:1.4; }
      .so-chip.ins .ins-tag { display:inline-block; margin-top:.6em; font-size:.78em; font-weight:700; padding:.25em .65em; border-radius:.45em; }
      @media (max-width: 900px) {
        .so-chip.ins { font-size: 2.2cqw; width: 19em; }
        .so-chip.ins p, .so-chip.ins .ins-tag { display:none; }
      }
    `}</style>
  );
}
