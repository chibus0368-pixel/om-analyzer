"use client";

/**
 * ScoreOM homepage marketing sections.
 *
 * Every visual here is a real screenshot of the live app (public/images/product/*),
 * captured from a demo DealBoard. Structure borrows from dealscreen.ai
 * (interactive, auto-advancing feature explorer) and foresight-software.com
 * (stat strip, role-based value props, "why us" block, closing CTA), rendered
 * in the ScoreOM black + lime palette.
 *
 * Perf notes (see CLAUDE.md):
 * - Images are small WebP files, loading="lazy" + decoding="async".
 * - Any <Link> here uses prefetch={false}.
 * - No auth, no Firebase, no data fetching. Pure presentational client code.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProductPanel, type PanelKind } from "./ProductPanels";
import { InsightChip, type Chip } from "./StackedFeatures";

const LIME = "#84CC16";
const MUTED = "#9ca3af";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function useInViewOnce<T extends HTMLElement>(rootMargin = "0px") {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); obs.disconnect(); } },
      { rootMargin, threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, seen]);
  return [ref, seen] as const;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="so-eyebrow">
      <span className="so-eyebrow-dot" />
      {children}
    </div>
  );
}

/** Browser-window chrome around a product screenshot. */
function BrowserFrame({ children, url = "scoreom / workspace" }: { children: React.ReactNode; url?: string }) {
  return (
    <div className="so-frame">
      <div className="so-frame-bar">
        <span className="so-frame-dots"><i /><i /><i /></span>
        <span className="so-frame-url">{url}</span>
      </div>
      <div className="so-frame-body">{children}</div>
    </div>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, marginTop: 3 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ------------------------------------------------------------------ */
/* Screenshot callouts                                                 */
/* ------------------------------------------------------------------ */

/**
 * Annotations drawn over the real screenshots. Boxes are in % of the image
 * (every product image is 16:10, so % maps 1:1 onto the frame). `pos` is where
 * the label sits relative to its box. Labels hide on small screens; the
 * numbered boxes stay.
 */
type Callout = { x: number; y: number; w: number; h: number; label: string; pos?: "top" | "bottom" | "left" };

const CALLOUTS: Record<string, Callout[]> = {
  "/images/product/score.webp": [
    { x: 5.5, y: 40, w: 8, h: 12, label: "100-point score", pos: "top" },
    { x: 6, y: 54, w: 88, h: 7, label: "The numbers you check first", pos: "bottom" },
    { x: 50, y: 61.5, w: 44, h: 12.5, label: "Concerns pulled from the OM", pos: "bottom" },
  ],
  "/images/product/quick-screen.webp": [
    { x: 7, y: 25, w: 86, h: 17.5, label: "Bull / base / bear ranges in seconds", pos: "top" },
    { x: 50, y: 45.5, w: 44, h: 22.5, label: "How the deal breaks", pos: "bottom" },
  ],
  "/images/product/offer.webp": [
    { x: 7, y: 42.8, w: 86, h: 5.4, label: "Returns at the asking price", pos: "top" },
    { x: 7, y: 65.5, w: 86, h: 26.5, label: "Exit cap vs. annual rent increases", pos: "top" },
  ],
  "/images/product/rent-roll.webp": [
    { x: 73, y: 29.5, w: 9, h: 52.5, label: "Every lease expiration", pos: "left" },
    { x: 64, y: 89.5, w: 14.5, h: 10, label: "Near-term rollover flagged", pos: "top" },
  ],
  "/images/product/financials.webp": [
    { x: 22, y: 63.5, w: 6, h: 3.5, label: "Estimates labeled", pos: "top" },
    { x: 7, y: 74.2, w: 86, h: 5, label: "Rebuilt NOI", pos: "top" },
    { x: 7, y: 80.5, w: 35, h: 3.8, label: "OM-stated vs. adjusted, side by side", pos: "bottom" },
  ],
  "/images/product/coach.webp": [
    { x: 72.5, y: 56, w: 27, h: 33.5, label: "Answers tied to the property data", pos: "left" },
  ],
  "/images/product/scorecard.webp": [
    { x: 5.5, y: 15.5, w: 90, h: 11, label: "Your pipeline at a glance", pos: "top" },
    { x: 5.5, y: 29, w: 90, h: 12.5, label: "Ranked by score", pos: "bottom" },
  ],
  "/images/product/share.webp": [
    { x: 14, y: 3, w: 67, h: 26, label: "Photos pulled from the OM", pos: "bottom" },
    { x: 14, y: 44.5, w: 67, h: 16.5, label: "Key numbers, no login needed", pos: "bottom" },
  ],
  "/images/product/dealboard.webp": [
    { x: 2, y: 20, w: 16, h: 27.5, label: "Every deal scored", pos: "bottom" },
    { x: 2, y: 11.5, w: 22, h: 6.5, label: "A running, ranked pipeline", pos: "top" },
  ],
};

function Callouts({ img, show }: { img: string; show: boolean }) {
  const list = CALLOUTS[img];
  if (!list) return null;
  return (
    <div className={`so-callouts${show ? " on" : ""}`} aria-hidden>
      {list.map((c, i) => (
        <div
          key={c.label}
          className={`so-callout pos-${c.pos || "top"}`}
          style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%`, transitionDelay: `${0.25 + i * 0.35}s` }}
        >
          <span className="so-callout-num">{i + 1}</span>
          <span className="so-callout-label">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OM flow illustration: broker -> investor -> ScoreOM -> first pass   */
/* ------------------------------------------------------------------ */

/**
 * Art: 3D illustrations generated with Higgsfield (GPT Image 2.5), stored in
 * public/images/illustrations. Desktop shows one wide panorama that tells the
 * whole story left to right; phones get three stacked step cards instead,
 * since the panorama is too detailed at 390px.
 */
const FLOW_STEPS = [
  { n: "01", title: "The broker sends the OM", note: "A 40-page PDF written to sell the deal.", img: "/images/illustrations/step-broker.webp", alt: "A broker hands an investor a printed offering memorandum" },
  { n: "02", title: "You are scanning the market", note: "It lands on a pile of other OMs.", img: "/images/illustrations/step-inbox.webp", alt: "An investor at a desk beside a tall stack of offering memorandums" },
  { n: "03", title: "ScoreOM opens it up", note: "Score, rent roll, NOI and a link, in about a minute.", img: "/images/illustrations/step-analyze.webp", alt: "An offering memorandum passes through a glowing ring and becomes a score gauge, table and share link" },
];

const FLOW_BENEFITS = [
  { title: "Minutes, not an afternoon", body: "Skip the 20 to 45 minutes of reading and re-keying. The numbers come out of the OM for you." },
  { title: "The same lens on every deal", body: "Every OM is scored and laid out the same way, so a stack of deals is easy to sort and compare." },
  { title: "Spot the gaps early", body: "OM-stated vs. adjusted NOI, near-term rollover and tenant concentration are flagged up front." },
  { title: "Share a clean read", body: "Send partners, lenders or clients one link. They see the same numbers you do." },
];

export function OMFlow() {
  const [ref, seen] = useInViewOnce<HTMLElement>("0px");
  return (
    <section id="flow" ref={ref} className={`ds-section-pad so-section so-flow-section${seen ? " in" : ""}`} style={{ paddingTop: 72, paddingBottom: 56 }}>
      <div className="so-wrap">
        <div className="so-head" style={{ marginBottom: 20 }}>
          <Eyebrow>The OM just landed</Eyebrow>
          <h2 className="so-h2">From the broker&apos;s PDF to a <span style={{ color: LIME }}>first pass</span> in about a minute.</h2>
        </div>

        {/* Desktop: one panorama, captions underneath */}
        <div className="so-flow-pano">
          <div className="so-flow-pano-art">
            <img
              src="/images/illustrations/om-flow-panorama-1400.webp"
              srcSet="/images/illustrations/om-flow-panorama-1400.webp 1400w, /images/illustrations/om-flow-panorama.webp 2400w"
              sizes="(max-width: 1240px) 100vw, 1180px"
              alt="A broker hands an offering memorandum to an investor; a lime light path carries it into a glowing ScoreOM ring, which turns it into a score gauge, a data table and a share link."
              loading="lazy"
              decoding="async"
            />
            <span className="so-flow-glow" aria-hidden />
          </div>
          <div className="so-flow-caps">
            {[
              { n: "01", t: "Broker sends the OM" },
              { n: "02", t: "You're scanning the market" },
              { n: "03", t: "ScoreOM opens it up" },
              { n: "04", t: "A first pass to sort and share" },
            ].map((c, i) => (
              <div key={c.n} className="so-flow-cap" style={{ transitionDelay: `${0.3 + i * 0.2}s` }}>
                <span className="so-flow-cap-n">{c.n}</span>
                <span>{c.t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Phones: three step cards */}
        <div className="so-flow-steps">
          {FLOW_STEPS.map((st) => (
            <div key={st.n} className="so-flow-step">
              <img src={st.img} alt={st.alt} loading="lazy" decoding="async" />
              <div className="so-flow-step-copy">
                <span className="so-flow-cap-n">{st.n}</span>
                <div>
                  <div className="so-flow-step-title">{st.title}</div>
                  <div className="so-flow-step-note">{st.note}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Promotional message */}
        <div className="so-flow-promo">
          <p className="so-flow-promo-lead">
            OMs are written to sell the deal. ScoreOM gives you the <span style={{ color: LIME }}>first pass</span> so you can decide where your underwriting time goes.
          </p>
          <div className="so-flow-benefits">
            {FLOW_BENEFITS.map((b) => (
              <div key={b.title} className="so-flow-benefit">
                <div className="so-flow-benefit-title"><Check />{b.title}</div>
                <p>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Hero stat strip                                                     */
/* ------------------------------------------------------------------ */

const HERO_STATS = [
  { value: "~60s", label: "OM to first pass" },
  { value: "40+", label: "fields extracted" },
  { value: "100", label: "point deal score" },
  { value: "1", label: "link to share it" },
];

export function HeroStats() {
  return (
    <div className="so-hero-stats" role="list">
      {HERO_STATS.map((s) => (
        <div key={s.label} role="listitem" className="so-hero-stat">
          <div className="so-hero-stat-value">{s.value}</div>
          <div className="so-hero-stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive feature explorer (#features)                            */
/* ------------------------------------------------------------------ */

type Feature = {
  id: string;
  tag: string;
  title: string;
  body: string;
  bullets: string[];
  img: string;
  alt: string;
  url: string;
};

const FEATURES: Feature[] = [
  {
    id: "score",
    tag: "Deal Score",
    title: "Sort the pile in minutes",
    body: "Every OM gets a 100-point score and a plain-English brief, so you can sort a stack of deals and spot the few that deserve a closer look.",
    bullets: [
      "Scored on pricing, cash flow, tenancy, rollover, location and upside",
      "Strengths and concerns pulled straight from the OM",
      "Going-in cap, DSCR, price vs. replacement and base IRR up top",
    ],
    img: "/images/product/score.webp",
    alt: "ScoreOM deal page for West Bend Plaza showing a 73 out of 100 Strong fit score, key strengths and primary concerns",
    url: "scoreom / deal / west-bend-plaza",
  },
  {
    id: "quick-screen",
    tag: "Quick Screen",
    title: "Back-of-napkin returns, instantly",
    body: "Bull, base and bear levered IRR with equity multiples, plus the three ways the deal works and the three ways it dies.",
    bullets: [
      "Bull / base / bear cases with annual rent increases and exit cap spelled out",
      "Levered and unlevered IRR, equity multiple for each case",
      "Standardized assumptions so every deal is judged the same way",
    ],
    img: "/images/product/quick-screen.webp",
    alt: "Quick Screen tab with bull, base and bear levered IRR cards and three ways the deal works or dies",
    url: "scoreom / deal / quick-screen",
  },
  {
    id: "offer",
    tag: "Offer Scenarios",
    title: "Know your number before you call the broker",
    body: "See returns at the asking price and from 15% under to 5% over, plus a sensitivity grid across exit cap and annual rent increases. Green clears your target.",
    bullets: [
      "Purchase price, price per SF, going-in cap and levered IRR per scenario",
      "Exit cap vs. annual rent increases heat map",
      "Instantly see where the deal clears your target IRR",
    ],
    img: "/images/product/offer.webp",
    alt: "Offer Scenarios tab with a sale price scenario table and an exit cap by rent growth sensitivity grid",
    url: "scoreom / deal / offer-scenarios",
  },
  {
    id: "rent-roll",
    tag: "Rent Roll",
    title: "Every tenant, every expiration",
    body: "Tenants, square footage, rent, lease type and lease end extracted into a clean table, with rollover, occupancy and month-to-month exposure called out.",
    bullets: [
      "Tenant-level table built from the OM or your rent roll file",
      "12-month rollover, occupancy and average rent per SF",
      "Concentration risk flagged before you read page one",
    ],
    img: "/images/product/rent-roll.webp",
    alt: "Rent Roll tab listing 12 tenants with square footage, annual rent, lease type and lease end dates",
    url: "scoreom / deal / rent-roll",
  },
  {
    id: "financials",
    tag: "Financials",
    title: "Find the real NOI",
    body: "A year-one operating statement rebuilt from the OM with vacancy and reserves applied. The OM-stated NOI and the adjusted NOI sit side by side so you see the gap.",
    bullets: [
      "Income, vacancy, expenses and reserves line by line",
      "Estimated items clearly labeled, every input editable",
      "Sources & uses at standard leverage",
    ],
    img: "/images/product/financials.webp",
    alt: "Financials tab with a year one operating statement and OM-stated versus adjusted NOI",
    url: "scoreom / deal / financials",
  },
  {
    id: "coach",
    tag: "Deal Coach",
    title: "Ask the deal anything",
    body: "Chat with an assistant that has already read the OM. Ask about rollover risk, get an LOI angle, or pressure-test the pro forma, with answers tied back to the property data.",
    bullets: [
      "One-click prompts for the questions investors actually ask",
      "Answers cite the property data they came from",
      "Lives right next to the numbers",
    ],
    img: "/images/product/coach.webp",
    alt: "Deal Coach chat panel summarizing rent roll risk for West Bend Plaza in four bullets",
    url: "scoreom / deal / coach",
  },
  {
    id: "scorecard",
    tag: "Scorecard",
    title: "Rank your whole pipeline",
    body: "Every deal on a DealBoard, ranked side by side by score, price, cap rate, NOI and occupancy, with a score distribution across the board.",
    bullets: [
      "Leaderboard and table views, export to CSV",
      "Filter your pipeline to the deals that actually pencil",
      "DealBoards by asset type or strategy",
    ],
    img: "/images/product/scorecard.webp",
    alt: "Deal Scorecard leaderboard ranking retail properties by deal score with price, cap rate and NOI",
    url: "scoreom / scorecard",
  },
  {
    id: "share",
    tag: "Share",
    title: "Send a deal in one link",
    body: "Share a clean, read-only deal page with partners, lenders or clients. They see the same numbers you do, no login required.",
    bullets: [
      "Photos, key metrics, brief, tenancy and deal analysis",
      "Email a deal or share a whole DealBoard",
      "Export an Excel workbook or Word brief anytime",
    ],
    img: "/images/product/share.webp",
    alt: "Public shared deal page for West Bend Plaza with photos, key metrics and a first-pass investment brief",
    url: "scoreom.com / p / west-bend-plaza",
  },
];

const AUTO_ADVANCE_MS = 6500;

export function FeatureExplorer() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // restarts the progress bar animation
  const reduced = usePrefersReducedMotion();
  const [sectionRef, seen] = useInViewOnce<HTMLElement>("200px 0px");
  const frameRef = useRef<HTMLDivElement | null>(null);

  const select = useCallback((i: number) => {
    setActive(i);
    setTick((t) => t + 1);
  }, []);

  // Auto-advance while visible, not hovered, and motion is allowed.
  useEffect(() => {
    if (!seen || paused || reduced) return;
    const id = window.setTimeout(() => select((active + 1) % FEATURES.length), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [active, paused, reduced, seen, select, tick]);

  // Subtle 3D tilt that follows the cursor (desktop only).
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced || !frameRef.current) return;
    const r = frameRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    frameRef.current.style.transform = `perspective(1400px) rotateY(${x * 4}deg) rotateX(${-y * 3}deg)`;
  };
  const onLeave = () => {
    if (frameRef.current) frameRef.current.style.transform = "perspective(1400px) rotateY(0deg) rotateX(0deg)";
  };

  const f = FEATURES[active];

  return (
    <section id="features" ref={sectionRef} className="ds-section-pad so-section" style={{ scrollMarginTop: 80 }}>
      <div className="so-glow" style={{ top: 80, right: -200 }} />
      <div className="so-wrap">
        <div className="so-head">
          <Eyebrow>Inside ScoreOM</Eyebrow>
          <h2 className="so-h2">
            See <span style={{ color: LIME }}>under the hood</span> in a minute.
          </h2>
          <p className="so-sub">
            A first pass on every OM: the numbers, the tenants, the gaps and a score to sort by. Enough to know which deals earn a real underwrite. Click through the real product below.
          </p>
        </div>

        {/* Mobile tab chips */}
        <div className="so-chips" role="tablist" aria-label="ScoreOM features">
          {FEATURES.map((x, i) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={i === active}
              className={`so-chip${i === active ? " on" : ""}`}
              onClick={() => select(i)}
            >
              {x.tag}
            </button>
          ))}
        </div>

        <div
          className="so-explorer"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => { setPaused(false); onLeave(); }}
        >
          {/* Left: feature list */}
          <div className="so-list" role="tablist" aria-orientation="vertical" aria-label="ScoreOM features">
            {FEATURES.map((x, i) => {
              const on = i === active;
              return (
                <button
                  key={x.id}
                  role="tab"
                  id={`so-tab-${x.id}`}
                  aria-selected={on}
                  aria-controls="so-feature-panel"
                  className={`so-item${on ? " on" : ""}`}
                  onClick={() => select(i)}
                  onFocus={() => select(i)}
                >
                  <span className="so-item-tag">{String(i + 1).padStart(2, "0")} &middot; {x.tag}</span>
                  <span className="so-item-title">{x.title}</span>
                  {on && (
                    <>
                      <span className="so-item-body">{x.body}</span>
                      <span className="so-progress" aria-hidden>
                        <span
                          key={tick}
                          className="so-progress-fill"
                          style={{
                            animationDuration: `${AUTO_ADVANCE_MS}ms`,
                            animationPlayState: paused || reduced || !seen ? "paused" : "running",
                          }}
                        />
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: screenshot */}
          <div className="so-stage" id="so-feature-panel" role="tabpanel" aria-labelledby={`so-tab-${f.id}`} onMouseMove={onMove}>
            <div ref={frameRef} className="so-tilt">
              <BrowserFrame url={f.url}>
                <div className="so-shots">
                  {FEATURES.map((x, i) => (
                    <img
                      key={x.id}
                      src={x.img}
                      alt={i === active ? x.alt : ""}
                      aria-hidden={i !== active}
                      loading="lazy"
                      decoding="async"
                      className={`so-shot${i === active ? " on" : ""}`}
                    />
                  ))}
                  <Callouts key={`c-${active}`} img={f.img} show={seen} />
                </div>
              </BrowserFrame>
            </div>
            {/* Mobile-only copy (the left list is hidden on small screens) */}
            <div className="so-mobile-copy">
              <div className="so-item-title">{f.title}</div>
              <p className="so-item-body" style={{ margin: "8px 0 0" }}>{f.body}</p>
            </div>
            <ul className="so-bullets">
              {f.bullets.map((b) => (
                <li key={b}><Check /><span>{b}</span></li>
              ))}
            </ul>
          </div>
        </div>

        {/* Secondary capability chips */}
        <div className="so-caps">
          {[
            "Bulk upload up to 10 OMs",
            "Save from Crexi with the Chrome extension",
            "Excel workbook export",
            "Word deal brief export",
            "Deal map with demographics",
            "Editable Deal Inputs",
          ].map((c) => (
            <span key={c} className="so-cap"><Check />{c}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Who it's for (#who)                                                 */
/* ------------------------------------------------------------------ */

const ROLES = [
  {
    id: "investors",
    label: "Investors & buyers",
    headline: "Screen a stack of OMs before lunch.",
    body: "Put every inbound deal through the same lens, then spend your time on the few that pencil.",
    bullets: [
      "A score and first-pass brief on every OM, in about a minute each",
      "Rough return ranges and pricing context before the first call",
      "Rank the whole pipeline on a DealBoard",
    ],
    img: "/images/product/scorecard.webp",
    alt: "Scorecard ranking a pipeline of retail deals",
    panel: "rank" as PanelKind,
    chips: [{ tone: "lime", icon: "stack", label: "Pipeline", title: "Ranked by score", body: "The best deal rises to the top." }, { tone: "blue", icon: "trend", label: "Before lunch", title: "About a minute per OM", body: "Screen the stack, keep the few that pencil." }] as Chip[],
  },
  {
    id: "brokers",
    label: "Brokers",
    headline: "See your listing the way buyers will.",
    body: "Run your own OM through a buyer's lens and get ahead of the questions before they are asked.",
    bullets: [
      "Spot rollover, below-market rents and concentration risk early",
      "Share a clean, read-only deal page with prospects",
      "Compare a listing against the rest of the market you cover",
    ],
    img: "/images/product/share.webp",
    alt: "Shared deal page a broker can send to buyers",
    panel: "score" as PanelKind,
    chips: [{ tone: "green", icon: "check", label: "Buyer lens", title: "What buyers will see", body: "Score, strengths and concerns up front." }, { tone: "red", icon: "alert", label: "Get ahead of it", title: "Concentration flagged", body: "Answer the question before it is asked." }] as Chip[],
  },
  {
    id: "lenders",
    label: "Lenders",
    headline: "Size the risk on the first read.",
    body: "DSCR, debt yield and a rebuilt operating statement, before anyone builds a model.",
    bullets: [
      "DSCR and debt yield surfaced on every deal",
      "Tenant concentration and near-term rollover flagged",
      "Operating statement with vacancy and reserves applied",
    ],
    img: "/images/product/financials.webp",
    alt: "Year one operating statement with adjusted NOI",
    panel: "noi" as PanelKind,
    chips: [{ tone: "amber", icon: "trend", label: "NOI gap", title: "-16% vs. the OM", body: "Vacancy and reserves applied." }, { tone: "green", icon: "check", label: "Coverage", title: "1.66x DSCR", body: "Surfaced on every deal." }] as Chip[],
  },
  {
    id: "operators",
    label: "Owner-operators",
    headline: "One home for every deal you touch.",
    body: "Capture deals as they come in and keep a running, ranked pipeline you can map and export.",
    bullets: [
      "Save listings from Crexi in one click",
      "Bulk upload up to 10 OMs at a time",
      "Map, compare and export to Excel",
    ],
    img: "/images/product/dealboard.webp",
    alt: "DealBoard with 17 scored retail properties",
    panel: "share" as PanelKind,
    chips: [{ tone: "lime", icon: "stack", label: "One home", title: "Every deal you touch", body: "Upload up to 10 OMs at a time." }, { tone: "blue", icon: "link", label: "Share", title: "Map + one link", body: "Send a board to partners, no login." }] as Chip[],
  },
];

export function RoleTabs() {
  const [active, setActive] = useState(0);
  const r = ROLES[active];
  return (
    <section id="who" className="ds-section-pad so-section" style={{ scrollMarginTop: 80 }}>
      <div className="so-wrap">
        <div className="so-head">
          <Eyebrow>Who it&apos;s for</Eyebrow>
          <h2 className="so-h2">Built for everyone who reads an OM.</h2>
        </div>

        <div className="so-roles-tabs" role="tablist" aria-label="Who ScoreOM is for">
          {ROLES.map((x, i) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={i === active}
              className={`so-role-tab${i === active ? " on" : ""}`}
              onClick={() => setActive(i)}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className="so-role" role="tabpanel" key={r.id}>
          <div className="so-role-copy">
            <h3 className="so-h3">{r.headline}</h3>
            <p className="so-sub" style={{ margin: "12px 0 22px", textAlign: "left" }}>{r.body}</p>
            <ul className="so-bullets so-bullets-col">
              {r.bullets.map((b) => (
                <li key={b}><Check /><span>{b}</span></li>
              ))}
            </ul>
            <button type="button" className="so-btn" onClick={scrollToTop} style={{ marginTop: 26 }}>
              Score your first OM
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </button>
          </div>
          <div className="so-role-visual">
            <div className="so-stack-stage so-role-stage" key={`st-${r.id}`}>
              <div className="so-frag so-frag-panel" role="img" aria-label={r.alt} style={{ left: "20%", top: "10%", width: "80%", zIndex: 2 }}>
                <ProductPanel kind={r.panel} />
              </div>
              <InsightChip chip={{ ...r.chips[0], ins: true }} style={{ left: "62%", top: "0%", zIndex: 5, ["--d" as string]: "0.2s", ["--rot" as string]: "5deg" } as React.CSSProperties} right />
              <InsightChip chip={{ ...r.chips[1], ins: true }} style={{ left: "-2%", top: "66%", zIndex: 5, ["--d" as string]: "0.45s", ["--rot" as string]: "-4deg" } as React.CSSProperties} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* DealBoards (#dealboards)                                            */
/* ------------------------------------------------------------------ */

const BOARD_TABS = [
  { id: "geo", label: "Geography", title: "Only industrial deals in North Chicago?", body: "Make a board for a market or submarket and drop every OM you get there into it. Scored, mapped and ranked in one place.", img: "/images/illustrations/north-chicago-industrial.webp", alt: "Industrial buildings pinned on a map of the North Chicago suburbs with deal cards above" },
  { id: "asset", label: "Asset class", title: "Retail, industrial, office.", body: "Keep asset classes apart so every deal is compared against the right peers and scored with the right model.", img: "/images/illustrations/dealboards-organize.webp", alt: "A central stack of deals branching into four organized boards" },
  { id: "client", label: "Client", title: "A board for every client you source for.", body: "Brokers and advisors can keep each client's pipeline separate, then share it with them as one link.", img: "/images/illustrations/dealboards-organize.webp", alt: "A central stack of deals branching into four organized boards" },
  { id: "strategy", label: "Strategy", title: "Value-add, NNN, 1031 targets.", body: "Group deals by how you plan to buy them, so the ones that fit your strategy rise to the top.", img: "/images/illustrations/dealboards-organize.webp", alt: "A central stack of deals branching into four organized boards" },
];

export function DealBoardsBand() {
  const [active, setActive] = useState(0);
  const t = BOARD_TABS[active];
  return (
    <section id="dealboards" className="ds-section-pad so-section" style={{ scrollMarginTop: 80 }}>
      <div className="so-wrap so-boards">
        <div className="so-boards-art">
          {Array.from(new Set(BOARD_TABS.map((b) => b.img))).map((src) => (
            <img key={src} src={src} alt={src === t.img ? t.alt : ""} aria-hidden={src !== t.img} loading="lazy" decoding="async" className={src === t.img ? "on" : ""} />
          ))}
        </div>
        <div className="so-boards-copy">
          <Eyebrow>Unlimited DealBoards</Eyebrow>
          <h2 className="so-h2" style={{ textAlign: "left" }}>Every deal in one place. <span style={{ color: LIME }}>Organized your way.</span></h2>
          <div className="so-boards-tabs" role="tablist" aria-label="Ways to organize DealBoards">
            {BOARD_TABS.map((b, i) => (
              <button key={b.id} role="tab" aria-selected={i === active} className={`so-chip${i === active ? " on" : ""}`} onClick={() => setActive(i)}>
                {b.label}
              </button>
            ))}
          </div>
          <div className="so-boards-panel" key={t.id} role="tabpanel">
            <div className="so-h3" style={{ fontSize: 22 }}>{t.title}</div>
            <p className="so-sub" style={{ textAlign: "left", margin: "10px 0 0", fontSize: 16 }}>{t.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Share a DealBoard (#share)                                          */
/* ------------------------------------------------------------------ */

/**
 * Silent explainer built from real share screens + Higgsfield motion clips
 * (public/videos/scoreom-share-dealboard.mp4, 720p, ~3.2MB, 40s). The <video>
 * src is only attached once the band is near the viewport.
 */
export function ShareBand() {
  const [ref, near] = useInViewOnce<HTMLElement>("300px 0px");
  const reduced = usePrefersReducedMotion();
  return (
    <section id="share" ref={ref} className="ds-section-pad so-section" style={{ scrollMarginTop: 80 }}>
      <div className="so-glow" style={{ top: 40, left: -240 }} />
      <div className="so-wrap so-share">
        <div className="so-share-copy">
          <Eyebrow>Share a DealBoard</Eyebrow>
          <h2 className="so-h2" style={{ textAlign: "left" }}>
            One link. Your deals on a map. <span className="ds-callout">No login needed</span>.
          </h2>
          <p className="so-sub" style={{ textAlign: "left", margin: "16px 0 24px" }}>
            Curate a board for a partner, lender or client and send it as a single link. They open it and see every deal on a map with the key numbers, and can click into the full breakdown. No account, no password.
          </p>
          <ul className="so-bullets so-bullets-col">
            <li><Check /><span>Name the board for your audience and add your contact info</span></li>
            <li><Check /><span>White label it and keep the source OMs private</span></li>
            <li><Check /><span>Set an expiration and see how many times it has been viewed</span></li>
          </ul>
        </div>
        <div className="so-share-media">
          <BrowserFrame url="scoreom / shared dealboard">
            <video
              className="so-share-video"
              src={near ? "/videos/scoreom-share-dealboard.mp4" : undefined}
              poster="/videos/scoreom-share-dealboard-poster.webp"
              autoPlay={!reduced}
              muted
              loop
              playsInline
              controls={reduced}
              preload="none"
              aria-label="How sharing a DealBoard works in ScoreOM: create a link, send it, and the recipient sees your deals on a map without logging in"
            />
          </BrowserFrame>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Why not a generic chatbot                                           */
/* ------------------------------------------------------------------ */

const DIFFS = [
  {
    title: "Reads real deal documents",
    body: "Broker OMs, flyers, scanned PDFs, Excel rent rolls and T-12s. Add more files to a deal and it re-analyzes.",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    title: "Numbers you can check",
    body: "OM-stated and adjusted NOI side by side, estimated items labeled, and every input editable so the score updates when you know better.",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Real CRE math, not vibes",
    body: "Asset-specific scoring, standardized assumptions and the metrics you check first: cap rate, DSCR, debt yield and IRR ranges.",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
];

export function Differentiators() {
  return (
    <section className="ds-section-pad so-section" style={{ paddingTop: 40 }}>
      <div className="so-wrap">
        <div className="so-diff-card">
          <div className="so-diff-head">
            <Eyebrow>Not another chatbot wrapper</Eyebrow>
            <h2 className="so-h2" style={{ fontSize: 34 }}>Why not just paste the OM into ChatGPT?</h2>
            <p className="so-sub">Because a paragraph of opinions is not a first pass. ScoreOM is built for scanning CRE deals quickly, and it is a starting point for your underwriting, not a replacement for it.</p>
          </div>
          <img
            className="so-diff-art"
            src="/images/illustrations/level-playing-field.webp"
            alt="Offering memorandums in different formats pass through a single ScoreOM lens and come out as identical, comparable deal cards"
            loading="lazy"
            decoding="async"
          />
          <div className="so-diff-grid">
            {DIFFS.map((d) => (
              <div key={d.title} className="so-diff">
                <div className="so-diff-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d.icon} /></svg>
                </div>
                <div className="so-diff-title">{d.title}</div>
                <p className="so-diff-body">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Closing CTA                                                         */
/* ------------------------------------------------------------------ */

export function FinalCTA() {
  return (
    <section className="ds-section-pad so-section" style={{ paddingTop: 24, paddingBottom: 96 }}>
      <div className="so-wrap">
        <div className="so-cta">
          <div className="so-cta-copy">
            <h2 className="so-h2" style={{ fontSize: 38, textAlign: "left" }}>
              No more re-keying OMs.<br /><span style={{ color: LIME }}>Start scoring them.</span>
            </h2>
            <p className="so-sub" style={{ textAlign: "left", margin: "14px 0 26px" }}>
              Drop in the next OM that lands in your inbox. In about a minute you will see what is under the hood and have a link to share. Free while in public access.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="so-btn" onClick={scrollToTop}>
                Score my OM
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
              <Link prefetch={false} href="/workspace/login?mode=register&source=final_cta" className="so-btn so-btn-ghost">
                Create a free workspace
              </Link>
            </div>
          </div>
          <div className="so-cta-visual" aria-hidden>
            <img src="/images/product/dealboard.webp" alt="" loading="lazy" decoding="async" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Styles (one block, mounted once by the page)                        */
/* ------------------------------------------------------------------ */

export function HomeSectionStyles() {
  return (
    <style>{`
      .so-section { position: relative; overflow: hidden; background: #0d0d14; padding: 96px 32px 72px; }
      .so-wrap { max-width: 1180px; margin: 0 auto; position: relative; z-index: 1; }
      .so-glow { position: absolute; width: 640px; height: 640px; border-radius: 50%; background: rgba(132,204,22,0.06); filter: blur(160px); pointer-events: none; }
      .so-head { text-align: center; margin-bottom: 48px; }
      .so-eyebrow { display: inline-flex; align-items: center; gap: 9px; padding: 0; color: #e5e7eb; font-size: 14px; font-weight: 700; letter-spacing: 0.01em; margin-bottom: 16px; }
      .so-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: ${LIME}; box-shadow: 0 0 10px ${LIME}; }
      .so-h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 42px; font-weight: 800; color: #fff; line-height: 1.12; letter-spacing: -0.8px; margin: 0; }
      .so-h3 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 28px; font-weight: 800; color: #fff; line-height: 1.2; letter-spacing: -0.4px; margin: 0; }
      .so-sub { font-size: 17px; color: ${MUTED}; line-height: 1.7; max-width: 640px; margin: 14px auto 0; }

      /* Hero stats */
      .so-hero-stats { display: grid; grid-template-columns: repeat(4, auto); gap: 28px; margin-top: 4px; }
      .so-hero-stat-value { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.8px; line-height: 1; }
      .so-hero-stat-label { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); margin-top: 6px; }
      .so-hero-stat:first-child .so-hero-stat-value { color: #fff; }

      /* Browser frame */
      .so-frame { border-radius: 14px; overflow: hidden; background: #fff; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 8px 20px rgba(0,0,0,0.35), 0 40px 90px rgba(0,0,0,0.5), 0 0 0 1px rgba(132,204,22,0.06), 0 0 80px rgba(132,204,22,0.08); }
      .so-frame-bar { display: flex; align-items: center; gap: 12px; height: 34px; padding: 0 14px; background: #16161f; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .so-frame-dots { display: inline-flex; gap: 6px; }
      .so-frame-dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.14); display: block; }
      .so-frame-dots i:first-child { background: rgba(132,204,22,0.7); }
      .so-frame-url { flex: 1; text-align: center; font-size: 11.5px; color: rgba(255,255,255,0.42); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.3px; margin-right: 40px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .so-frame-body { position: relative; background: #f5f6f8; }

      /* Explorer */
      .so-explorer { display: grid; grid-template-columns: 380px 1fr; gap: 40px; align-items: start; }
      .so-list { display: flex; flex-direction: column; gap: 6px; }
      .so-item { appearance: none; text-align: left; border: 1px solid transparent; background: transparent; border-radius: 14px; padding: 14px 18px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: background 0.25s ease, border-color 0.25s ease; font-family: inherit; }
      .so-item:hover { background: rgba(255,255,255,0.03); }
      .so-item.on { background: rgba(22,26,35,0.85); border-color: rgba(132,204,22,0.22); box-shadow: 0 0 30px rgba(132,204,22,0.05); }
      .so-item-tag { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.35); }
      .so-item.on .so-item-tag { color: ${LIME}; }
      .so-item-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 17px; font-weight: 700; color: rgba(255,255,255,0.72); line-height: 1.35; }
      .so-item.on .so-item-title { color: #fff; font-size: 19px; }
      .so-item-body { font-size: 14px; line-height: 1.65; color: ${MUTED}; margin-top: 4px; animation: soFade 0.35s ease both; }
      .so-progress { display: block; height: 2px; margin-top: 12px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; }
      .so-progress-fill { display: block; height: 100%; width: 100%; background: ${LIME}; transform-origin: left; animation-name: soProgress; animation-timing-function: linear; animation-fill-mode: both; }
      .so-stage { position: relative; }
      .so-tilt { transition: transform 0.25s ease-out; will-change: transform; }
      .so-shots { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
      .so-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top center; opacity: 0; transition: opacity 0.5s ease; }
      .so-shot.on { opacity: 1; }
      .so-bullets { list-style: none; padding: 0; margin: 22px 0 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
      .so-bullets li { display: flex; gap: 10px; font-size: 13.5px; line-height: 1.55; color: rgba(255,255,255,0.72); animation: soFade 0.4s ease both; }
      .so-bullets-col { grid-template-columns: 1fr; gap: 12px; }
      .so-bullets-col li { font-size: 15px; }
      .so-chips { display: none; }
      .so-mobile-copy { display: none; }
      .so-caps { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 22px; margin-top: 56px; padding-top: 32px; border-top: 1px solid rgba(255,255,255,0.05); }
      .so-cap { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: ${MUTED}; }
      .so-cap svg { margin-top: 0 !important; }

      /* Roles */
      .so-roles-tabs { display: flex; justify-content: center; gap: 6px; padding: 6px; margin: 0 auto 40px; border-radius: 999px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); width: fit-content; max-width: 100%; overflow-x: auto; }
      .so-role-tab { appearance: none; border: none; background: transparent; color: rgba(255,255,255,0.6); font: inherit; font-size: 14px; font-weight: 700; padding: 10px 20px; border-radius: 999px; cursor: pointer; white-space: nowrap; transition: all 0.2s ease; }
      .so-role-tab:hover { color: #fff; }
      .so-role-tab.on { background: ${LIME}; color: #0d0d14; }
      .so-role { display: grid; grid-template-columns: 1fr 1.25fr; gap: 56px; align-items: center; animation: soFade 0.4s ease both; }
      .so-role-img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top left; }

      /* Buttons */
      .so-btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 24px; border-radius: 10px; background: ${LIME}; color: #0d0d14; font: inherit; font-size: 15px; font-weight: 700; border: 1px solid ${LIME}; cursor: pointer; text-decoration: none; transition: transform 0.15s ease, box-shadow 0.2s ease; }
      .so-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 30px rgba(132,204,22,0.3); }
      .so-btn-ghost { background: transparent; color: rgba(255,255,255,0.85); border-color: rgba(255,255,255,0.16); }
      .so-btn-ghost:hover { border-color: ${LIME}; color: ${LIME}; box-shadow: none; }

      /* Differentiators */
      .so-diff-card { border-radius: 24px; padding: 48px; background: linear-gradient(160deg, rgba(132,204,22,0.07), rgba(22,26,35,0.6) 45%); border: 1px solid rgba(132,204,22,0.12); }
      .so-diff-head { text-align: center; margin-bottom: 40px; }
      .so-diff-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
      .so-diff { padding: 26px; border-radius: 16px; background: rgba(13,13,20,0.6); border: 1px solid rgba(255,255,255,0.06); transition: transform 0.2s ease, border-color 0.2s ease; }
      .so-diff:hover { transform: translateY(-3px); border-color: rgba(132,204,22,0.25); }
      .so-diff-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: rgba(132,204,22,0.08); border: 1px solid rgba(132,204,22,0.15); margin-bottom: 16px; }
      .so-diff-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 17px; font-weight: 800; color: #fff; margin-bottom: 8px; }
      .so-diff-body { font-size: 14px; line-height: 1.65; color: ${MUTED}; margin: 0; }

      /* CTA */
      .so-cta { display: grid; grid-template-columns: 1.1fr 1fr; gap: 40px; align-items: center; padding: 56px; border-radius: 24px; background: #11131b; border: 1px solid rgba(255,255,255,0.07); overflow: hidden; position: relative; }
      .so-cta::before { content: ''; position: absolute; left: -120px; top: -160px; width: 480px; height: 480px; border-radius: 50%; background: rgba(132,204,22,0.12); filter: blur(120px); pointer-events: none; }
      .so-cta-copy { position: relative; z-index: 1; }
      .so-cta-visual { position: relative; height: 100%; min-height: 260px; }
      .so-cta-visual img { position: absolute; left: 0; top: 50%; width: 150%; max-width: none; transform: translateY(-50%) perspective(1200px) rotateY(-12deg) rotateX(4deg); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 30px 80px rgba(0,0,0,0.6); }

      /* Callouts over screenshots */
      .so-callouts { position: absolute; inset: 0; pointer-events: none; }
      .so-callout { position: absolute; border-radius: 8px; border: 2px solid ${LIME}; background: rgba(132,204,22,0.07);
        box-shadow: 0 0 0 4px rgba(132,204,22,0.12), 0 0 24px rgba(132,204,22,0.35);
        opacity: 0; transform: scale(0.96); transition: opacity 0.45s ease, transform 0.45s ease; }
      .so-callouts.on .so-callout { opacity: 1; transform: none; }
      .so-callout-num { position: absolute; top: -11px; left: -11px; width: 22px; height: 22px; border-radius: 50%; background: ${LIME}; color: #0d0d14;
        font: 800 12px/22px 'Plus Jakarta Sans', sans-serif; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.35); }
      .so-callout-label { position: absolute; left: 8px; white-space: nowrap; padding: 6px 11px; border-radius: 8px; background: #0d0d14; color: #fff;
        font: 700 12.5px/1.2 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.1px; border: 1px solid rgba(132,204,22,0.45);
        box-shadow: 0 8px 22px rgba(0,0,0,0.35); }
      .so-callout.pos-top .so-callout-label { bottom: calc(100% + 10px); }
      .so-callout.pos-bottom .so-callout-label { top: calc(100% + 10px); }
      .so-callout.pos-left .so-callout-label { left: auto; right: calc(100% + 10px); top: 50%; transform: translateY(-50%); }

      /* OM flow */
      .so-flow-pano-art { position: relative; margin: 0 -40px; }
      .so-flow-pano-art img { display: block; width: 100%; height: auto; opacity: 0; transform: scale(1.03); transition: opacity 1s ease, transform 1.6s ease;
        -webkit-mask-image: radial-gradient(ellipse 62% 58% at 50% 50%, #000 58%, transparent 100%); mask-image: radial-gradient(ellipse 62% 58% at 50% 50%, #000 58%, transparent 100%); }
      .so-flow-section.in .so-flow-pano-art img { opacity: 1; transform: none; }
      .so-flow-glow { position: absolute; left: 61%; top: 62%; width: 22%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%;
        background: radial-gradient(circle, rgba(132,204,22,0.28), transparent 65%); mix-blend-mode: screen; opacity: 0; pointer-events: none; }
      .so-flow-section.in .so-flow-glow { animation: soGlow 3.2s ease-in-out 1.2s infinite; }
      .so-flow-caps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 6px; }
      .so-flow-cap { display: flex; align-items: center; justify-content: center; gap: 10px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 700; color: #fff;
        opacity: 0; transform: translateY(6px); transition: opacity 0.5s ease, transform 0.5s ease; }
      .so-flow-section.in .so-flow-cap { opacity: 1; transform: none; }
      .so-flow-cap-n { flex-shrink: 0; display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; font-size: 11.5px; font-weight: 800; color: #0d0d14; background: ${LIME}; box-shadow: 0 0 18px rgba(132,204,22,0.4); }
      .so-flow-steps { display: none; }
      .so-flow-step { border-radius: 18px; overflow: hidden; background: rgba(22,26,35,0.6); border: 1px solid rgba(255,255,255,0.06); }
      .so-flow-step img { display: block; width: 100%; height: auto; }
      .so-flow-step-copy { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px 18px; }
      .so-flow-step-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; font-weight: 800; color: #fff; }
      .so-flow-step-note { font-size: 13.5px; color: ${MUTED}; margin-top: 3px; line-height: 1.5; }
      .so-flow-promo { margin-top: 44px; text-align: center; }
      .so-flow-promo-lead { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 22px; font-weight: 700; color: #fff; line-height: 1.45; max-width: 760px; margin: 0 auto 32px; letter-spacing: -0.3px; }
      .so-flow-benefits { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; text-align: left; }
      .so-flow-benefit { padding: 20px; border-radius: 14px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); }
      .so-flow-benefit-title { display: flex; gap: 8px; font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 8px; font-family: 'Plus Jakarta Sans', sans-serif; }
      .so-flow-benefit p { margin: 0; font-size: 13.5px; line-height: 1.6; color: ${MUTED}; }
      @keyframes soGlow { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.9; } }

      /* DealBoards band */
      .so-boards { display: grid; grid-template-columns: 1.2fr 1fr; gap: 56px; align-items: center; }
      .so-boards-art { position: relative; aspect-ratio: 16 / 9; }
      .so-boards-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.6s ease;
        -webkit-mask-image: radial-gradient(ellipse 70% 72% at 50% 50%, #000 58%, transparent 100%); mask-image: radial-gradient(ellipse 70% 72% at 50% 50%, #000 58%, transparent 100%); }
      .so-boards-art img.on { opacity: 1; }
      .so-boards-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 20px; }
      .so-boards-tabs .so-chip { appearance: none; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.75); font: inherit; font-size: 14px; font-weight: 700; padding: 9px 16px; border-radius: 999px; cursor: pointer; transition: all 0.2s ease; }
      .so-boards-tabs .so-chip.on { background: ${LIME}; border-color: ${LIME}; color: #0d0d14; }
      .so-boards-panel { animation: soFade 0.35s ease both; min-height: 120px; }

      /* Share band */
      .so-share { display: grid; grid-template-columns: 1fr 1.25fr; gap: 56px; align-items: center; }
      .so-share-video { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #0d0d14; }
      .so-diff-art { display: block; width: 100%; max-width: 880px; margin: -8px auto 36px; border-radius: 18px;
        -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, #000 60%, transparent 100%); mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, #000 60%, transparent 100%); }

      @keyframes soFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes soProgress { from { transform: scaleX(0); } to { transform: scaleX(1); } }

      @media (max-width: 980px) {
        .so-explorer { grid-template-columns: 1fr; gap: 20px; }
        .so-list { display: none; }
        .so-chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 14px; margin: -20px 0 8px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .so-chips::-webkit-scrollbar { display: none; }
        .so-chip { appearance: none; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.7); font: inherit; font-size: 13px; font-weight: 700; padding: 9px 14px; border-radius: 999px; cursor: pointer; }
        .so-chip.on { background: ${LIME}; border-color: ${LIME}; color: #0d0d14; }
        .so-mobile-copy { display: block; margin-top: 18px; }
        .so-mobile-copy .so-item-title { color: #fff; font-size: 19px; }
        .so-bullets { grid-template-columns: 1fr; gap: 10px; }
        .so-role { grid-template-columns: 1fr; gap: 28px; }
        .so-roles-tabs { justify-content: flex-start; border-radius: 14px; }
        .so-diff-grid { grid-template-columns: 1fr; }
        .so-diff-card { padding: 28px 20px; }
        .so-cta { grid-template-columns: 1fr; padding: 32px 22px; }
        .so-cta-visual { display: none; }
        .so-hero-stats { grid-template-columns: repeat(2, auto); justify-content: center; gap: 18px 36px; }
        .so-flow-pano { display: none; }
        .so-share { grid-template-columns: 1fr; gap: 28px; }
        .so-boards { grid-template-columns: 1fr; gap: 20px; }
        .so-flow-steps { display: grid; gap: 16px; margin-top: 20px; }
        .so-flow-benefits { grid-template-columns: 1fr 1fr; }
        .so-flow-promo-lead { font-size: 18px; }
      }
      @media (max-width: 520px) {
        .so-flow-benefits { grid-template-columns: 1fr; }
      }
      @media (max-width: 768px) {
        .so-section { padding-left: 16px !important; padding-right: 16px !important; }
        .so-h2 { font-size: 28px !important; }
        .so-h3 { font-size: 22px; }
        .so-sub { font-size: 15px; }
        .so-frame-bar { height: 28px; }
        .so-frame-url { font-size: 10px; }
        .so-callout-label { display: none; }
        .so-callout { border-width: 1.5px; border-radius: 5px; box-shadow: 0 0 12px rgba(132,204,22,0.35); }
        .so-callout-num { width: 16px; height: 16px; font-size: 9.5px; line-height: 16px; top: -8px; left: -8px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .so-shot, .so-tilt, .so-item-body, .so-bullets li, .so-role, .so-callout, .so-flow-cap, .so-flow-pano-art img { transition: none !important; animation: none !important; }
        .so-flow-glow { display: none !important; }
      }
    `}</style>
  );
}
