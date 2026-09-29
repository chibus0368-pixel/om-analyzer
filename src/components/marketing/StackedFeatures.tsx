"use client";

/**
 * dealscreen.ai-style homepage presentation pieces:
 * - HeroStars: quiet starfield behind the centered hero.
 * - StatementReveal: pill eyebrow + big statement whose words light up on scroll.
 * - StackedFeatures (#features): large rounded feature cards that pin and stack
 *   as you scroll, each with layered floating UI fragments cropped from real
 *   app screenshots (public/images/product/frag).
 *
 * No data fetching, no Firebase. Links use prefetch={false}.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ProductPanel, PanelStyles, type PanelKind } from "./ProductPanels";

const LIME = "#84CC16";

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setR(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return r;
}

/* ------------------------------------------------------------------ */
/* Starfield                                                           */
/* ------------------------------------------------------------------ */

function seeded(n: number) {
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => [rnd(), rnd(), rnd()]);
}

export function HeroStars() {
  const layers = useMemo(() => {
    const pts = seeded(140);
    const toShadow = (arr: number[][]) =>
      arr.map(([x, y, b]) => `${Math.round(x * 1600)}px ${Math.round(y * 900)}px rgba(255,255,255,${(0.25 + b * 0.55).toFixed(2)})`).join(",");
    return [toShadow(pts.slice(0, 70)), toShadow(pts.slice(70))];
  }, []);
  return (
    <div className="so-stars" aria-hidden>
      <span className="so-stars-a" style={{ boxShadow: layers[0] }} />
      <span className="so-stars-b" style={{ boxShadow: layers[1] }} />
      <div className="so-stars-glow" />
    </div>
  );
}

export function PillEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="so-pill-eyebrow"><span className="so-pill-dot" />{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Statement with word-by-word scroll reveal                           */
/* ------------------------------------------------------------------ */

const STATEMENT =
  "OMs land in your inbox all week, and every broker writes them their own way. ScoreOM breaks each one down in about a minute with the same criteria, the same models and the same scoring. Every deal on a level playing field, so you know which ones deserve a real underwrite.";
const HIGHLIGHT = new Set(["same", "criteria,", "models", "scoring.", "level", "playing", "field,"]);

export function StatementReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const reduced = useReducedMotion();
  const words = STATEMENT.split(" ");

  useEffect(() => {
    if (reduced) { setProgress(1); return; }
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // 0 when the block's top hits 85% of the viewport, 1 when its bottom reaches 45%.
        const start = vh * 0.85;
        const end = vh * 0.45;
        const p = (start - r.top) / (start - end + r.height);
        setProgress(Math.max(0, Math.min(1, p)));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [reduced]);

  const lit = Math.round(progress * words.length * 1.08);

  return (
    <section className="so-statement" aria-label="What ScoreOM does">
      <PillEyebrow>Receive. Upload. First pass.</PillEyebrow>
      <div ref={ref} className="so-statement-text">
        {words.map((w, i) => (
          <span key={i} className={`so-word${i < lit ? " on" : ""}${HIGHLIGHT.has(w) ? " hl" : ""}`}>{w} </span>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked feature cards                                               */
/* ------------------------------------------------------------------ */

export type Chip = {
  tone: "lime" | "green" | "amber" | "red" | "blue";
  icon: "ring" | "check" | "alert" | "doc" | "link" | "trend" | "stack";
  title: string;
  body?: string;
  ring?: number;
  label?: string;
  /** insight-card layout: coloured header label, title, body, tag */
  ins?: boolean;
  tag?: string;
};

type Frag = {
  /** floating insight chip rendered in HTML (crisp at any size) */
  chip?: Chip;
  /** stylized HTML product panel */
  panel?: PanelKind;
  src?: string;
  /** optional looping screen recording; `src` is then its poster */
  video?: string;
  alt?: string;
  /** position + width in % of the visual stage */
  x: number; y: number; w: number;
  z?: number;
  rot?: number;
  tag?: string;
};

type StackCard = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  frags: Frag[];
  flip?: boolean;
};

const F = (n: string) => `/images/product/frag/${n}.webp`;

const C = (n: string) => `/images/product/crisp/${n}.webp`;

const CARDS: StackCard[] = [
  {
    id: "score",
    eyebrow: "Deal Score",
    title: "See under the hood in a minute",
    body: "Drop in the OM and get the numbers you check first, a plain-English brief and a 100-point score built on your criteria.",
    points: ["Going-in cap, DSCR, price vs. replacement, base IRR", "Strengths and concerns pulled from the OM"],
    frags: [
      { panel: "score", alt: "Deal Score panel for West Bend Plaza: 73 of 100, Buy", x: 0, y: 8, w: 76, z: 2 },
      { chip: { ins: true, tone: "green", icon: "check", label: "Key strength", title: "Fully leased", body: "100% occupancy across 12 units.", tag: "From the OM" }, x: 70, y: 2, w: 0, z: 5 },
      { chip: { ins: true, tone: "lime", icon: "trend", label: "Opportunity", title: "Below-market rents", body: "Average rent per SF sits under market. Room to push on renewal.", tag: "Upside" }, x: 72, y: 30, w: 0, z: 6 },
      { chip: { ins: true, tone: "red", icon: "alert", label: "Concern", title: "Tenant concentration", body: "Hobby Knights holds 21% of GLA. A few tenants carry the rent.", tag: "Verify leases" }, x: 69, y: 60, w: 0, z: 7 },
    ],
  },
  {
    id: "noi",
    eyebrow: "Financials + Rent Roll",
    title: "Find the real NOI",
    body: "The operating statement is rebuilt with vacancy and reserves applied, next to a tenant-level rent roll with every expiration.",
    points: ["OM-stated vs. adjusted NOI, side by side", "Near-term rollover and concentration flagged"],
    flip: true,
    frags: [
      { panel: "noi", alt: "Rebuilt NOI panel: OM-stated $221,308 vs. adjusted $185,736", x: 24, y: 8, w: 76, z: 2 },
      { chip: { ins: true, tone: "amber", icon: "trend", label: "NOI gap", title: "-16% vs. the OM", body: "Rebuilt with vacancy, expenses and reserves applied.", tag: "Adjusted" }, x: 0, y: 4, w: 0, z: 5 },
      { chip: { ins: true, tone: "blue", icon: "doc", label: "Transparent", title: "Estimates labeled", body: "Reserves at $0.25/SF are flagged and editable." }, x: 2, y: 36, w: 0, z: 6 },
      { chip: { ins: true, tone: "red", icon: "alert", label: "Rollover", title: "2 leases end in 2025", body: "Plaza Barber Shop and KK Sew & Vac.", tag: "Near-term" }, x: 0, y: 64, w: 0, z: 7 },
    ],
  },
  {
    id: "offer",
    eyebrow: "Offer Scenarios",
    title: "Know your number before you call the broker",
    body: "Returns at the ask and from 15% under to 5% over, plus bull, base and bear cases with the assumptions spelled out.",
    points: ["Green clears your target IRR", "Same assumptions on every deal, so they compare cleanly"],
    frags: [
      { panel: "offer", alt: "Offer scenarios chart of levered IRR at each purchase price vs. a 15% target", x: 0, y: 8, w: 76, z: 2 },
      { chip: { ins: true, tone: "green", icon: "check", label: "Your number", title: "About 5% under ask", body: "$2.40M returns 16.5%, clearing the 15% target.", tag: "Clears target" }, x: 70, y: 2, w: 0, z: 5 },
      { chip: { ins: true, tone: "amber", icon: "trend", label: "At ask", title: "14.8% levered IRR", body: "Just under target at $2.53M." }, x: 72, y: 34, w: 0, z: 6 },
      { chip: { ins: true, tone: "red", icon: "alert", label: "Bear case", title: "9.3% if the market turns", body: "Flat rents and a 75bps wider exit cap." }, x: 69, y: 62, w: 0, z: 7 },
    ],
  },
  {
    id: "rank",
    eyebrow: "DealBoards",
    title: "Line up every deal you are looking at",
    body: "Every OM you receive lands on a DealBoard, broken down the same way and ranked by score, price, cap rate, NOI and occupancy.",
    points: ["One normalized view of your whole pipeline", "Boards by market, asset class, client or strategy"],
    flip: true,
    frags: [
      { src: "/videos/usage/usage-dealboard-poster.webp", video: "/videos/usage/usage-dealboard.mp4", alt: "Screen recording scrolling a DealBoard of 17 scored OMs", x: 0, y: 0, w: 86, z: 2 },
      { panel: "rank", alt: "Leaderboard ranking deals by score with price and cap rate", x: 50, y: 38, w: 50, z: 3 },
      { chip: { ins: true, tone: "lime", icon: "stack", label: "Normalized", title: "17 OMs, one view", body: "Every deal broken down the same way.", tag: "Same criteria" }, x: 1, y: 60, w: 0, z: 5 },
      { chip: { ins: true, tone: "blue", icon: "trend", label: "Sort any way", title: "Score, price, cap, NOI", body: "Ranked side by side, export to CSV." }, x: 60, y: 0, w: 0, z: 5 },
    ],
  },
  {
    id: "share",
    eyebrow: "Share",
    title: "Share a DealBoard with one link",
    body: "Send partners, lenders or clients a live board of deals on a map. They click the link and see the numbers. No login needed.",
    points: ["Map view of every deal on the board", "Read-only deal pages with photos and key metrics"],
    frags: [
      { src: "/videos/usage/usage-share-board-live-poster.webp", video: "/videos/usage/usage-share-board-live.mp4", alt: "Screen recording of a shared DealBoard with a map and property list", x: 14, y: 0, w: 86, z: 2 },
      { panel: "share", alt: "Share DealBoard panel with a copied link, public viewing on, 17 deals and 50 views", x: 0, y: 44, w: 50, z: 3 },
      { chip: { ins: true, tone: "blue", icon: "link", label: "No login needed", title: "Opens in any browser", body: "Partners, lenders and clients just click the link.", tag: "Read-only" }, x: 58, y: 56, w: 0, z: 5 },
      { chip: { ins: true, tone: "green", icon: "check", label: "Live map", title: "Every deal pinned", body: "Click a pin for photos, score and key metrics." }, x: 3, y: 0, w: 0, z: 5 },
    ],
  },
  {
    id: "email",
    eyebrow: "Email + Files",
    title: "Send the breakdown, files included",
    body: "The moment you upload an OM, ScoreOM builds an Excel workbook and a Word brief. Email the whole deal breakdown in two clicks with both attached.",
    points: ["Excel workbook and Word brief generated on upload", "Formatted deal page emailed to anyone"],
    flip: true,
    frags: [
      { src: "/videos/usage/usage-email-poster.webp", video: "/videos/usage/usage-email.mp4", alt: "Screen recording emailing a deal with the workbook and brief attached", x: 0, y: 0, w: 86, z: 2 },
      { panel: "email", alt: "Email panel with recipient, subject, Excel workbook and Word brief attached", x: 50, y: 40, w: 50, z: 3 },
      { chip: { ins: true, tone: "green", icon: "doc", label: "Built on upload", title: "Workbook + brief, automatic", body: "An Excel workbook and a Word summary for every OM.", tag: "No extra steps" }, x: 1, y: 58, w: 0, z: 5 },
      { chip: { ins: true, tone: "blue", icon: "link", label: "Two clicks", title: "Email the full breakdown", body: "Formatted deal page plus both files, to anyone." }, x: 60, y: 0, w: 0, z: 5 },
    ],
  },
  {
    id: "docs",
    eyebrow: "Multiple documents",
    title: "Feed it more, get a sharper read",
    body: "Add the OM, rent roll, T-12, lease abstracts or a flyer to the same deal. A light OM with no rent roll or financials says little. The more you give it, the better the breakdown.",
    points: ["Several files per deal, re-analyze anytime", "Tells you which documents would improve the analysis"],
    frags: [
      { src: "/videos/usage/usage-multi-docs-poster.webp", video: "/videos/usage/usage-multi-docs.mp4", alt: "Screen recording of a deal with three source documents and suggested rent roll and T-12 uploads", x: 0, y: 8, w: 100, z: 2 },
      { chip: { tone: "amber", icon: "alert", title: "Might improve analysis", body: "Add the rent roll and T-12" }, x: 50, y: 76, w: 0, z: 5 },
    ],
  },
];

const TONE: Record<Chip["tone"], [string, string]> = {
  lime: ["#65a30d", "rgba(132,204,22,0.14)"],
  green: ["#16a34a", "rgba(22,163,74,0.12)"],
  amber: ["#d97706", "rgba(217,119,6,0.12)"],
  red: ["#dc2626", "rgba(220,38,38,0.10)"],
  blue: ["#2563eb", "rgba(37,99,235,0.10)"],
};

function ChipIcon({ chip }: { chip: Chip }) {
  const [fg, bg] = TONE[chip.tone];
  if (chip.icon === "ring") {
    const v = chip.ring ?? 0, r = 19, cfull = 2 * Math.PI * r;
    return (
      <span className="so-chip-ring" aria-hidden>
        <svg width="50" height="50" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r={r} fill="none" stroke="rgba(132,204,22,0.18)" strokeWidth="5" />
          <circle cx="25" cy="25" r={r} fill="none" stroke={LIME} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(cfull * v) / 100} ${cfull}`} transform="rotate(-90 25 25)" className="so-ring-arc" />
        </svg>
        <b>{v}</b>
      </span>
    );
  }
  const paths: Record<string, string> = {
    check: "M5 12.5l4.5 4.5L19 7.5",
    alert: "M12 7v6m0 3.5v.5",
    doc: "M8 4h6l4 4v12H8zM14 4v4h4",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    trend: "M4 16l5-5 4 4 7-7M15 8h5v5",
    stack: "M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4",
  };
  return (
    <span className="so-chip-icon" style={{ background: bg, color: fg }} aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={paths[chip.icon]} /></svg>
    </span>
  );
}

export function InsightChip({ chip, style, right }: { chip: Chip; style: React.CSSProperties; right?: boolean }) {
  const [fg, bg] = TONE[chip.tone];
  if (chip.ins) {
    const glyph = chip.icon === "check" ? "\u2713" : chip.icon === "alert" ? "!" : chip.icon === "doc" ? "i" : "\u2197";
    return (
      <div className={`so-chip ins${right ? " so-chip-r" : ""}`} style={{ ...style, borderColor: bg.replace(/0\.1\d?\)/, "0.45)") }}>
        <div className="ins-head" style={{ color: fg }}><i style={{ background: fg }}>{glyph}</i>{chip.label}</div>
        <strong>{chip.title}</strong>
        {chip.body && <p>{chip.body}</p>}
        {chip.tag && <span className="ins-tag" style={{ background: bg, color: fg }}>{chip.tag}</span>}
      </div>
    );
  }
  return (
    <div className={`so-chip${right ? " so-chip-r" : ""}`} style={style}>
      <ChipIcon chip={chip} />
      <div className="so-chip-text">
        {chip.label && <span className="so-chip-label" style={{ color: fg }}>{chip.label}</span>}
        <strong>{chip.title}</strong>
        {chip.body && <span>{chip.body}</span>}
      </div>
    </div>
  );
}

/** Muted looping screen recording that only loads when it nears the viewport. */
function LazyVideo({ src, poster, alt }: { src: string; poster: string; alt: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); el.play?.().catch(() => {}); }
      else el.pause?.();
    }, { rootMargin: "200px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <video ref={ref} className="so-frag-video" poster={poster} muted loop playsInline autoPlay preload="none" aria-label={alt}>
      {on && <source src={src} type="video/mp4" />}
    </video>
  );
}

export function StackedFeatures() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  // Scale + dim cards as the next card slides over them.
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const cards = Array.from(wrap.querySelectorAll<HTMLElement>(".so-stack-card"));
      const sticky = window.matchMedia("(min-width: 901px)").matches;
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        let t = 0;
        if (sticky && next) {
          const a = card.getBoundingClientRect();
          const b = next.getBoundingClientRect();
          t = Math.max(0, Math.min(1, 1 - (b.top - a.top) / a.height));
        }
        card.style.setProperty("--stack", t.toFixed(3));
      });
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [reduced]);

  return (
    <section id="features" className="so-stack-section" style={{ scrollMarginTop: 90 }}>
      <div className="so-stack-head">
        <PillEyebrow>What you get on every OM</PillEyebrow>
        <h2>From PDF to a <span className="ds-callout">clear first pass</span>.</h2>
        <p>Real screens and recordings from the app. Every deal gets the same breakdown, so the tenth OM is as easy to read as the first.</p>
      </div>
      <div ref={wrapRef} className="so-stack">
        {CARDS.map((c, i) => (
          <article key={c.id} className={`so-stack-card${c.flip ? " flip" : ""}`} style={{ ["--i" as string]: i, zIndex: i + 1 }}>
            <div className="so-stack-copy">
              <div className="so-stack-eyebrow"><span />{c.eyebrow}</div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              <ul>
                {c.points.map((p) => (
                  <li key={p}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="so-stack-visual">
              <div className="so-stack-stage">
                {c.frags.map((f, j) => f.panel ? (
                  <div key={j} className="so-frag so-frag-panel" role="img" aria-label={f.alt}
                    style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, zIndex: f.z ?? 2, ["--d" as string]: "0s" }}>
                    <ProductPanel kind={f.panel} />
                  </div>
                ) : f.chip ? (
                  <InsightChip key={j} chip={f.chip} right={f.x >= 45} style={{ left: `${f.x}%`, top: `${f.y}%`, zIndex: f.z ?? 5, ["--d" as string]: `${0.4 + j * 0.25}s`, ["--rot" as string]: j % 2 ? "-4deg" : "5deg" }} />
                ) : (
                  <figure
                    key={f.src}
                    className="so-frag"
                    style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, zIndex: f.z ?? j + 1, ["--d" as string]: `${j * 0.12}s` }}
                  >
                    {f.video
                      ? <LazyVideo src={f.video} poster={f.src!} alt={f.alt ?? ""} />
                      : <img src={f.src} alt={f.alt ?? ""} loading="lazy" decoding="async" />}
                    {f.tag && <figcaption className="so-frag-tag"><span />{f.tag}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ */
/* ScoreOM vs. a generic chatbot                                       */
/* ------------------------------------------------------------------ */

const COMPARE: { label: string; us: string; them: string }[] = [
  { label: "Criteria", us: "Your criteria, applied the same way to every OM", them: "Depends on how you word the prompt that day" },
  { label: "Models", us: "Standard CRE models: NOI rebuild, DSCR, IRR ranges, offer grid", them: "Math improvised per chat, hard to check" },
  { label: "Output", us: "The same 40+ fields and layout on every deal", them: "A different paragraph every time" },
  { label: "Scoring", us: "100-point score you can sort, rank and compare", them: "Opinions, no consistent score" },
  { label: "Repeatable", us: "Run it again and get the same answer", them: "Ask twice, get two answers" },
  { label: "Your pipeline", us: "DealBoards, map view and one-link sharing", them: "Lost in a chat history" },
];

/* Scores that pop onto the five normalized cards in the lens illustration.
   Positions are the ring centres in the 1400x791 artwork, as % of its size. */
const SCORED = [
  { x: 55.9, y: 46.7, v: 73, verdict: "Buy", tone: "g", top: true },
  { x: 64.3, y: 46.7, v: 66, verdict: "Neutral", tone: "a" },
  { x: 72.6, y: 46.7, v: 58, verdict: "Neutral", tone: "a" },
  { x: 81.0, y: 46.7, v: 81, verdict: "Strong buy", tone: "g", top: true },
  { x: 89.4, y: 46.7, v: 45, verdict: "Pass", tone: "r" },
];

export function CompareChatGPT() {
  return (
    <section id="why" className="so-compare-section" style={{ scrollMarginTop: 90 }}>
      <div className="so-stack-head">
        <PillEyebrow>Why not just use ChatGPT or Claude?</PillEyebrow>
        <h2>Same criteria. Same models.<br /><span className="ds-callout">Every OM</span>.</h2>
        <p>A general AI chat like ChatGPT or Claude gives you a new take every time you ask. ScoreOM is repeatable: every OM runs through the same criteria and CRE models, so your view of the market is normalized and the scores actually compare.</p>
      </div>
      <div className="so-compare-card">
        <div className="so-compare-hero">
          <div className="so-compare-art">
            <img src="/images/illustrations/level-playing-field.webp" width={1400} height={791} alt="Offering memorandums in different formats pass through one ScoreOM lens and come out as identical, comparable deal cards" loading="lazy" decoding="async" />
            {SCORED.map((d, i) => (
              <div key={i} className={`so-score-pop${d.top ? " top" : ""}`} style={{ left: `${d.x}%`, top: `${d.y}%`, ["--i" as string]: i, ["--v" as string]: d.v }}>
                <svg viewBox="0 0 44 44" aria-hidden>
                  <circle cx="22" cy="22" r="18" className="trk" />
                  <circle cx="22" cy="22" r="18" className="arc" pathLength={100} />
                </svg>
                <b>{d.v}</b>
                <span className={`vd ${d.tone}`}>{d.verdict}</span>
              </div>
            ))}
          </div>
          <span className="so-compare-lens" aria-hidden />
          <span className="so-compare-sweep" aria-hidden />
          <div className="so-compare-cap left"><b>Every OM</b><span>A different broker, format and story</span></div>
          <div className="so-compare-cap right"><b>One lens</b><span>Same criteria, models and layout on every deal</span></div>
        </div>
        <div className="so-compare-table" role="table" aria-label="ScoreOM compared with a general AI chat like ChatGPT or Claude">
          <div className="so-compare-col-us" aria-hidden />
          <div className="so-compare-row head" role="row">
            <span role="columnheader" />
            <span role="columnheader" className="us"><i />ScoreOM</span>
            <span role="columnheader">General AI chat</span>
          </div>
          {COMPARE.map((r) => (
            <div key={r.label} className="so-compare-row" role="row">
              <span role="rowheader" className="lbl">{r.label}</span>
              <span role="cell" className="us">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                {r.us}
              </span>
              <span role="cell" className="them">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.6" strokeLinecap="round" aria-hidden><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                {r.them}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="so-compare-note">ScoreOM is a fast, consistent first pass for screening. It is a starting point for your underwriting, not a replacement for it.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

export function StackStyles() {
  return (
    <>
    <PanelStyles />
    <style>{`
      @supports (overflow: clip) { html, body { overflow-x: clip !important; } }
      .so-stars { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; }
      .so-stars span { position:absolute; top:0; left:50%; width:1px; height:1px; margin-left:-800px; border-radius:50%; }
      .so-stars-a { animation: soTwinkle 6s ease-in-out infinite; }
      .so-stars-b { width:2px !important; height:2px !important; opacity:.5; animation: soTwinkle 9s ease-in-out infinite reverse; }
      .so-stars-glow { position:absolute; left:50%; top:-260px; width:1100px; height:620px; transform:translateX(-50%);
        background: radial-gradient(closest-side, rgba(132,204,22,0.16), rgba(132,204,22,0.04) 60%, transparent); filter: blur(10px); }
      @keyframes soTwinkle { 0%,100% { opacity:.9 } 50% { opacity:.45 } }

      .so-pill-eyebrow { display:inline-flex; align-items:center; gap:9px; padding:0; border:0; background:none;
        font-size:14px; font-weight:700; color:#e5e7eb; letter-spacing:0.01em; }
      .so-pill-dot { width:6px; height:6px; border-radius:50%; background:${LIME}; box-shadow:0 0 10px ${LIME}; }

      /* Centered hero */
      .so-hero-center { max-width: 920px; margin: 0 auto; text-align: center; position: relative; z-index: 1; }
      .so-hero-h1 { font-family:'Plus Jakarta Sans',sans-serif; font-size: clamp(40px, 6.6vw, 80px); font-weight: 800;
        line-height: 1.03; letter-spacing: -0.035em; color:#fff; margin: 26px 0 22px; }
      .so-hero-h1 .accent { color:${LIME}; display:block; }
      .so-hero-sub { font-size: clamp(16px, 1.6vw, 19px); color:#9ca3af; line-height:1.65; max-width: 640px; margin: 0 auto 36px; }
      .so-upload-label { display:flex; align-items:center; justify-content:center; gap:9px; margin: 0 auto 14px;
        font-size:14px; font-weight:700; color:${LIME}; }
      @property --so-a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
      .so-hero-upload { position:relative; max-width: 640px; margin: 0 auto; text-align: left; padding: 2px; border-radius: 24px;
        background: conic-gradient(from var(--so-a), rgba(132,204,22,0.15) 0deg, rgba(132,204,22,0.15) 200deg, #bef264 260deg, #84CC16 300deg, rgba(132,204,22,0.15) 360deg);
        animation: soSpin 5s linear infinite;
        box-shadow: 0 0 0 1px rgba(132,204,22,0.18), 0 30px 80px rgba(0,0,0,0.5), 0 0 90px rgba(132,204,22,0.18); }
      .so-hero-upload::after { content:""; position:absolute; inset:-28px; border-radius: 40px; z-index:-1; pointer-events:none;
        background: radial-gradient(closest-side, rgba(132,204,22,0.20), transparent 75%); animation: soBreathe 4.5s ease-in-out infinite; }
      @keyframes soSpin { to { --so-a: 360deg; } }
      @keyframes soBreathe { 0%,100% { opacity:.55; transform: scale(.98); } 50% { opacity:1; transform: scale(1.02); } }
      .so-hero-upload .tm-upload-zone { border: 1.5px dashed rgba(132,204,22,0.4) !important; border-radius: 22px !important;
        background: linear-gradient(180deg, #14161d, #0f1116) !important; padding: 44px 32px 40px !important; }
      .so-hero-upload .tm-upload-zone:hover { border-color: rgba(163,230,53,0.8) !important; }
      .so-hero-upload .tm-upload-zone p:first-of-type { font-size: 17px !important; }
      .so-hero-upload .ds-btn-primary { font-size: 15px !important; padding: 14px 38px !important; }
      .so-hero-center .so-hero-stats { justify-content: center; margin: 44px auto 0; max-width: 760px; }

      /* Statement */
      .so-statement { max-width: 1040px; margin: 0 auto; padding: 120px 32px 110px; text-align: center; }
      .so-statement-text { margin-top: 30px; font-family:'Plus Jakarta Sans',sans-serif; font-weight: 700;
        font-size: clamp(26px, 3.6vw, 46px); line-height: 1.28; letter-spacing: -0.02em; }
      .so-word { color: rgba(255,255,255,0.16); transition: color .35s ease; }
      .so-word.on { color: #fff; }
      .so-word.hl.on { color: ${LIME}; }

      /* Stacked cards */
      .so-stack-section { padding: 40px 32px 120px; position: relative; }
      .so-stack-head { text-align:center; max-width: 760px; margin: 0 auto 56px; }
      .so-stack-head h2 { font-family:'Plus Jakarta Sans',sans-serif; font-size: clamp(32px, 4.4vw, 54px); font-weight:800;
        letter-spacing:-0.03em; line-height:1.08; color:#fff; margin: 22px 0 14px; }
      .so-stack-head p { color:#9ca3af; font-size:17px; line-height:1.65; margin:0; }
      .so-stack { max-width: 1220px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px; }
      .so-stack-card {
        --stack: 0;
        position: sticky; top: calc(100px + var(--i) * 14px);
        display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 44px; align-items: center;
        min-height: 580px; padding: 48px; border-radius: 32px;
        background: linear-gradient(180deg, #15151f 0%, #101018 100%);
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 -20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05);
        transform: scale(calc(1 - var(--stack) * 0.05)); transform-origin: 50% 0;
        filter: brightness(calc(1 - var(--stack) * 0.45));
        overflow: hidden;
      }
      .so-stack-card::before { content:""; position:absolute; right:-160px; top:-160px; width:520px; height:520px; border-radius:50%;
        background: radial-gradient(closest-side, rgba(132,204,22,0.13), transparent); pointer-events:none; }
      .so-stack-card.flip { grid-template-columns: 1.28fr 0.72fr; }
      .so-stack-card.flip .so-stack-copy { order: 2; }
      .so-stack-card.flip::before { right:auto; left:-160px; }
      .so-stack-copy { position: relative; z-index: 1; }
      .so-stack-eyebrow { display:inline-flex; align-items:center; gap:9px; font-size:13px; font-weight:700; color:#d1d5db;
        letter-spacing:0.04em; text-transform:uppercase; }
      .so-stack-eyebrow span { width:8px; height:8px; border-radius:50%; background:${LIME}; box-shadow:0 0 12px ${LIME}; }
      .so-stack-copy h3 { font-family:'Plus Jakarta Sans',sans-serif; font-size: clamp(30px, 3.3vw, 44px); font-weight:800;
        letter-spacing:-0.03em; line-height:1.08; color:#fff; margin: 18px 0 16px; }
      .so-stack-copy p { color:#9ca3af; font-size:17px; line-height:1.65; margin:0 0 22px; }
      .so-stack-copy ul { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
      .so-stack-copy li { display:flex; gap:10px; align-items:flex-start; color:#d1d5db; font-size:15px; line-height:1.5; }
      .so-stack-copy li svg { flex-shrink:0; margin-top:3px; }
      .so-stack-visual { position: relative; z-index: 1; }
      .so-stack-stage { position: relative; width: 100%; aspect-ratio: 1.3 / 1; }
      .so-frag { position:absolute; margin:0; border-radius:14px; overflow:visible; }
      .so-frag img { display:block; width:100%; height:auto; border-radius:14px; background:#fff;
        border: 1px solid rgba(255,255,255,0.14);
        box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 0 6px rgba(255,255,255,0.03); }
      .so-chip { position:absolute; display:flex; align-items:center; gap:12px; padding:12px 18px 12px 12px; border-radius:16px;
        background:#fff; border:1px solid rgba(15,23,42,0.08); box-shadow: 0 18px 40px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.2);
        white-space:nowrap; animation: soChipIn .7s cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d); }
      .so-chip-icon { width:36px; height:36px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
      .so-chip-ring { position:relative; width:50px; height:50px; flex-shrink:0; }
      .so-chip-ring b { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font:800 16px 'Plus Jakarta Sans',sans-serif; color:#0f172a; }
      .so-chip-text { display:flex; flex-direction:column; line-height:1.25; font-family:'Plus Jakarta Sans',Inter,sans-serif; }
      .so-chip-text strong { font-size:14px; font-weight:800; color:#0f172a; letter-spacing:-0.01em; }
      .so-chip-text span { font-size:12.5px; color:#64748b; margin-top:2px; }
      .so-chip-text .so-chip-label { font-size:10.5px; font-weight:800; letter-spacing:.08em; margin:0 0 2px; }
      @keyframes soChipIn { from { opacity:0; transform: translateY(10px) scale(.96); } to { opacity:1; transform:none; } }
      .so-frag img { image-rendering: auto; }
      .so-frag-video { display:block; width:100%; height:auto; aspect-ratio: 1280 / 648; object-fit: cover; object-position: top; border-radius:14px; background:#0d0d14;
        border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 0 6px rgba(255,255,255,0.03); }
      .so-frag-tag { position:absolute; left:14px; top:-15px; display:inline-flex; align-items:center; gap:7px;
        padding:6px 12px; border-radius:999px; background:#0d0d14; border:1px solid rgba(132,204,22,0.55);
        color:#fff; font-size:12px; font-weight:700; white-space:nowrap; box-shadow:0 8px 24px rgba(0,0,0,0.5); }
      .so-frag-tag span { width:6px; height:6px; border-radius:50%; background:${LIME}; }
      @keyframes soFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }

      /* Callout cards sit slightly tilted (dealstack-style); main visuals stay flat */
      .so-chip.ins { rotate: var(--rot, 0deg); transition: rotate .5s cubic-bezier(.2,.8,.2,1); }
      .so-chip.ins:hover { rotate: 0deg; }
      @media (max-width: 900px) {
        .so-stack-card, .so-stack-card.flip { position: relative; top: auto; grid-template-columns: 1fr; gap: 28px;
          min-height: 0; padding: 30px 22px 34px; border-radius: 24px; transform:none; filter:none; }
        .so-stack-card.flip .so-stack-copy { order: 0; }
        .so-stack-section { padding: 20px 16px 80px; }
        .so-stack { gap: 20px; }
        .so-statement { padding: 80px 20px 70px; }
        .so-frag-tag { font-size: 11px; top: -13px; }
        .so-chip { padding:7px 11px 7px 7px; gap:8px; border-radius:12px; }
        .so-chip-r { left:auto !important; right:-6px; }
        .so-chip-icon { width:28px; height:28px; border-radius:8px; }
        .so-chip-ring { transform: scale(.8); margin:-5px; }
        .so-chip-text strong { font-size:12px; }
        .so-chip-text span:not(.so-chip-label) { display:none; }
      }
      @media (max-width: 760px) {
        /* Phones: keep headline + one paragraph per card, drop the bullet list */
        .so-stack-copy ul { display:none; }
        .so-stack-copy p { font-size:15.5px; margin-bottom:0; }
      }

      /* Compare */
      .so-compare-section { padding: 60px 32px 110px; }
      .so-compare-card { max-width: 1160px; margin: 0 auto; border-radius: 32px; overflow: hidden; position: relative;
        background: linear-gradient(180deg,#0a0a10 0%, #101018 55%, #12121b 100%); border:1px solid rgba(255,255,255,0.08);
        box-shadow: 0 40px 100px rgba(0,0,0,0.45); }
      .so-compare-hero { position: relative; aspect-ratio: 1400 / 620; overflow: hidden;
        -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent 100%); mask-image: linear-gradient(180deg, #000 70%, transparent 100%); }
      @keyframes soKen { from { transform: scale(1) translate(0,0); } to { transform: scale(1.07) translate(-1.2%, 1%); } }
      .so-compare-art { position:absolute; inset:-4% -2% auto -2%; width:104%; aspect-ratio: 1400 / 791;
        animation: soKen 26s ease-in-out infinite alternate; transform-origin: 46% 50%; }
      .so-compare-art img { position:absolute; inset:0; width:100%; height:100%; display:block; animation:none; }
      .so-score-pop { position:absolute; width:4.6%; aspect-ratio:1; transform: translate(-50%,-50%) scale(.6); opacity:0;
        animation: soPop 9s cubic-bezier(.2,.8,.2,1) infinite; animation-delay: calc(1.2s + var(--i) * .45s); container-type: inline-size; }
      .so-score-pop svg { position:absolute; inset:0; width:100%; height:100%; }
      .so-score-pop .trk { fill: rgba(10,14,8,0.92); stroke: rgba(132,204,22,0.22); stroke-width: 5; }
      .so-score-pop .arc { fill:none; stroke:${LIME}; stroke-width:5; stroke-linecap:round; transform: rotate(-90deg); transform-origin: 50% 50%;
        stroke-dasharray: 0 100; animation: soArc 9s cubic-bezier(.2,.8,.2,1) infinite; animation-delay: calc(1.2s + var(--i) * .45s); }
      .so-score-pop b { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff;
        font: 800 38cqw 'Plus Jakarta Sans', sans-serif; letter-spacing:-0.02em; }
      .so-score-pop .vd { position:absolute; left:50%; top:118%; transform:translateX(-50%); white-space:nowrap; font: 800 22cqw 'Plus Jakarta Sans',sans-serif;
        padding: 6cqw 16cqw; border-radius: 99px; background: rgba(10,10,16,0.85); border:1px solid rgba(255,255,255,0.18); }
      .so-score-pop .vd.g { color:${LIME}; border-color: rgba(132,204,22,0.55); }
      .so-score-pop .vd.a { color:#fbbf24; border-color: rgba(251,191,36,0.45); }
      .so-score-pop .vd.r { color:#f87171; border-color: rgba(248,113,113,0.45); }
      .so-score-pop.top::after { content:""; position:absolute; inset:-30%; border-radius:50%; background: radial-gradient(closest-side, rgba(132,204,22,0.45), transparent); z-index:-1; animation: soGlow 9s ease-in-out infinite; animation-delay: calc(1.2s + var(--i) * .45s); }
      @keyframes soPop { 0% { opacity:0; transform: translate(-50%,-50%) scale(.6); } 6% { opacity:1; transform: translate(-50%,-50%) scale(1.08); } 10% { transform: translate(-50%,-50%) scale(1); } 80% { opacity:1; transform: translate(-50%,-50%) scale(1); } 90%,100% { opacity:0; transform: translate(-50%,-50%) scale(.9); } }
      @keyframes soArc { 0%,4% { stroke-dasharray: 0 100; } 18%,85% { stroke-dasharray: calc(var(--v) * 1) 100; } 100% { stroke-dasharray: 0 100; } }
      @keyframes soGlow { 0%,15% { opacity:0; } 25%,75% { opacity:1; } 90%,100% { opacity:0; } }
      .so-compare-lens { position:absolute; left:46.5%; top:47%; width:22%; aspect-ratio:1; transform: translate(-50%,-50%); border-radius:50%;
        background: radial-gradient(closest-side, rgba(132,204,22,0.35), rgba(132,204,22,0.08) 55%, transparent 72%); mix-blend-mode: screen;
        animation: soPulse 4.5s ease-in-out infinite; pointer-events:none; }
      @keyframes soPulse { 0%,100% { opacity:.35; transform: translate(-50%,-50%) scale(.92); } 50% { opacity:.85; transform: translate(-50%,-50%) scale(1.06); } }
      .so-compare-sweep { position:absolute; top:28%; bottom:22%; left:52%; width:18%; pointer-events:none; mix-blend-mode: screen;
        background: linear-gradient(90deg, transparent, rgba(190,242,100,0.28), transparent); filter: blur(6px);
        animation: soSweep 5.5s cubic-bezier(.45,0,.3,1) infinite; }
      @keyframes soSweep { 0% { transform: translateX(-10%); opacity:0; } 15% { opacity:1; } 85% { opacity:1; } 100% { transform: translateX(260%); opacity:0; } }
      .so-compare-cap { position:absolute; top:26px; display:flex; flex-direction:column; gap:3px; padding:10px 14px; border-radius:12px;
        background: rgba(10,10,16,0.72); border:1px solid rgba(255,255,255,0.1); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
      .so-compare-cap.left { left:26px; } .so-compare-cap.right { right:26px; text-align:right; border-color: rgba(132,204,22,0.45); }
      .so-compare-cap b { color:#fff; font:800 15px 'Plus Jakarta Sans',sans-serif; }
      .so-compare-cap.right b { color:${LIME}; }
      .so-compare-cap span { color:#9ca3af; font-size:12.5px; }
      .so-compare-table { position: relative; padding: 0 40px 34px; margin-top: -40px; }
      .so-compare-col-us { position:absolute; top:-10px; bottom:22px; left: calc(40px + 150px + 18px - 14px); width: calc((100% - 80px - 150px - 36px) / 2 + 28px);
        border-radius: 18px; background: linear-gradient(180deg, rgba(132,204,22,0.10), rgba(132,204,22,0.04)); border:1px solid rgba(132,204,22,0.28); }
      .so-compare-row { position: relative; display:grid; grid-template-columns: 150px 1fr 1fr; gap: 18px; padding: 15px 0; border-bottom:1px solid rgba(255,255,255,0.06); align-items:start; }
      .so-compare-row:last-child { border-bottom: 0; }
      .so-compare-row.head { padding-top: 8px; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color:#6b7280; border-bottom-color: rgba(255,255,255,0.1); }
      .so-compare-row.head .us { color: ${LIME}; display:flex; align-items:center; gap:8px; }
      .so-compare-row.head .us i { width:8px; height:8px; border-radius:50%; background:${LIME}; box-shadow:0 0 10px ${LIME}; }
      .so-compare-row .lbl { color:#fff; font-weight:700; font-size:14.5px; }
      .so-compare-row span.us, .so-compare-row span.them { display:flex; gap:9px; align-items:flex-start; font-size:14.5px; line-height:1.5; }
      .so-compare-row span.us { color:#f3f4f6; font-weight:500; }
      .so-compare-row span.them { color:#6b7280; }
      .so-compare-row svg { flex-shrink:0; margin-top:3px; }
      .so-compare-note { text-align:center; color:#6b7280; font-size:14px; margin: 26px auto 0; max-width: 640px; }
      @media (max-width: 900px) {
        .so-compare-section { padding: 40px 16px 80px; }
        .so-compare-card { border-radius: 24px; }
        .so-compare-hero { aspect-ratio: 1400 / 760; }
        .so-compare-cap { top:12px; padding:7px 10px; } .so-compare-cap.left { left:12px; } .so-compare-cap.right { right:12px; }
        .so-compare-cap span { display:none; }
        .so-compare-table { padding: 0 18px 22px; margin-top: -10px; }
        .so-compare-col-us { display:none; }
        .so-compare-row { grid-template-columns: 1fr 1fr; gap: 10px 14px; }
        .so-compare-row .lbl { grid-column: 1 / -1; }
        .so-compare-row.head span:first-child { display:none; }
        .so-compare-row span.us, .so-compare-row span.them { font-size: 13px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .so-score-pop { animation:none; opacity:1; transform: translate(-50%,-50%); }
        .so-score-pop .arc { animation:none; stroke-dasharray: calc(var(--v) * 1) 100; }
        .so-hero-upload, .so-hero-upload::after, .so-frag, .so-chip, .so-stars span, .so-compare-hero img, .so-compare-art, .so-compare-lens, .so-compare-sweep { animation: none; }
        .so-word { transition: none; }
      }
    `}</style>
    </>
  );
}
