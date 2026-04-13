"use client";
/* OM Analyzer Lite - v3 with smart hero image extraction (skips tables) */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { extractHeroImageFromPDF } from "@/lib/workspace/image-extractor";
import { extractTextFromFile } from "@/lib/workspace/file-reader";

import DealSignalNav from "@/components/DealSignalNav";
import { trackLiteUpload, trackLiteResult, trackLeadCapture, trackProCTAClick, trackDownload } from "@/lib/analytics";

/* ===========================================================================
   INTERSECTION OBSERVER HOOK - SCROLL TRIGGER
   =========================================================================== */
function useInView(threshold = 0.2): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

/* ===========================================================================
   FORMAT HELPERS - IDENTICAL to pro property page
   =========================================================================== */
function fmt$(val: any): string {
  if (!val) return "--";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(val: any): string { return val ? `${Number(val).toFixed(2)}%` : "--"; }
function fmtX(val: any): string { return val ? `${Number(val).toFixed(2)}x` : "--"; }
function fmtSF(val: any): string { return val ? `${Math.round(Number(val)).toLocaleString()} SF` : "--"; }
function signalColor(val: string): string {
  if (!val) return "#8899B0";
  if (val.includes("🟢") || val.toLowerCase().includes("green")) return "#059669";
  if (val.includes("🟡") || val.toLowerCase().includes("yellow")) return "#D97706";
  if (val.includes("🔴") || val.toLowerCase().includes("red")) return "#DC2626";
  return "#253352";
}

/* ===========================================================================
   METRIC TOOLTIP - IDENTICAL to pro property page
   =========================================================================== */
function MetricTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handleEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    }
    setShow(true);
  };

  return (
    <span
      ref={iconRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "help" }}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {show && pos && (
        <span style={{
          position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)",
          background: "#1e1e28", color: "#ffffff", fontSize: 11, lineHeight: 1.45, padding: "8px 11px",
          borderRadius: 6, whiteSpace: "normal", width: 220, zIndex: 9999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)", pointerEvents: "none",
          border: "1px solid rgba(255,255,255,0.1)",
        }}>
          {text}
          <span style={{
            position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)",
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid #1E293B",
          }} />
        </span>
      )}
    </span>
  );
}

/* ===========================================================================
   FEATURE BLOCK WRAPPER - ANIMATES ON SCROLL
   =========================================================================== */
function FeatureBlock({ children, idx }: { children: React.ReactNode; idx: number }) {
  const [ref, inView] = useInView(0.15);
  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transition: 'opacity 0.3s ease' }}>
      <div className={inView ? 'ds-feature-animate' : 'ds-feature-hidden'}>
        {children}
      </div>
    </div>
  );
}

/* ===========================================================================
   SCROLL REVEAL WRAPPER - GENERIC SCROLL-TRIGGER ANIMATION
   =========================================================================== */
function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [ref, inView] = useInView(0.15);
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.5s ease-out ${delay}s, transform 0.5s ease-out ${delay}s`,
    }}>
      {children}
    </div>
  );
}

/* ===========================================================================
   PROPERTY IMAGE - IDENTICAL to pro (minus heroImageUrl from Firestore)
   =========================================================================== */
function PropertyImage({ heroImageUrl, location, encodedAddress, propertyName }: {
  heroImageUrl?: string; location: string; encodedAddress: string; propertyName: string;
}) {
  const [imgError, setImgError] = useState(false);

  // Google Maps satellite embed - free, no API key needed
  const mapEmbed = location ? (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 200 }}>
      <iframe
        src={`https://maps.google.com/maps?q=${encodedAddress}&t=k&z=18&output=embed`}
        style={{ width: "100%", height: "100%", minHeight: 200, border: "none", display: "block" }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={`Map of ${propertyName}`}
      />
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`}
        target="_blank" rel="noopener noreferrer"
        style={{
          position: "absolute", bottom: 8, right: 8, padding: "4px 10px",
          background: "rgba(255,255,255,0.92)", borderRadius: 6, fontSize: 10,
          color: "#DC2626", textDecoration: "none", fontWeight: 600, backdropFilter: "blur(4px)",
        }}>
        Open in Google Maps &rarr;
      </a>
    </div>
  ) : null;

  const fallback = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "100%", height: "100%", minHeight: 200,
      background: "#16161f",
    }}>
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
        <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>{location || "No address"}</div>
      </div>
    </div>
  );

  return (
    <div style={{ width: 300, minHeight: 200, flexShrink: 0, overflow: "hidden" }}>
      {heroImageUrl && !imgError ? (
        <img src={heroImageUrl} alt={propertyName}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 200 }}
          onError={() => setImgError(true)} />
      ) : mapEmbed ? mapEmbed : fallback}
    </div>
  );
}

/* ===========================================================================
   HERO SHOWCASE - Interactive native mockup with clickable property cards
   Uses REAL CRE property images + metrics mirror the actual app's detail page
   =========================================================================== */
type HeroTenant = { name: string; sf: string; rent: string; term: string };
type HeroSignal = { label: string; detail: string; tone: "green" | "yellow" | "red" };
type HeroCensus = { population: string; medianIncome: string; medianAge: string; homeValue: string; unemployment: string };
type HeroLocationIntel = {
  grade: string;             // "A-", "B+", "C", etc.
  summary: string;           // 1-2 sentence area narrative
  census: HeroCensus;
  anchors: string[];         // Nearby co-tenant / anchor names
  signals: HeroSignal[];     // Traffic / demographics / comps signals
};
type HeroCard = {
  name: string; city: string; type: string;
  score: number; verdict: "BUY" | "NEUTRAL" | "PASS";
  // Headline metrics (card)
  price: string; cap: string; noi: string; sf: string;
  // Real image (Unsplash) + gradient fallback
  photoUrl: string;
  hero: string;
  // Detail-page metrics (modal)
  pricePerSf: string;
  dscr: string;
  coc: string;    // Cash-on-Cash
  debtYield: string;
  occupancy: string;
  yearBuilt: string;
  tenantCount: string;
  walt: string;
  submarket: string;
  // Narrative
  executive: string;
  strengths: string[];
  concerns: string[];
  signal: string | null;
  aiSignals: { title: string; detail: string; impact: "pos" | "neg" | "neu" }[];
  tenants: HeroTenant[];
  reviewItems: string[];
  greenFlags: string[];
  yellowFlags: string[];
  redFlags: string[];
  locationIntel: HeroLocationIntel;
};

// Real CRE exterior photos on Unsplash CDN - curated to match each asset type
const PHOTO = {
  // Multi-tenant retail / power center - large anchored shopping plaza
  shoppingCenter:  "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=900&q=85&auto=format&fit=crop",
  // Grocery-anchored - supermarket storefront with cars
  grocery:         "https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=900&q=85&auto=format&fit=crop",
  // Neighborhood center - retail strip with parking
  neighborhood:    "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=900&q=85&auto=format&fit=crop",
  // Single-tenant QSR - restaurant exterior
  restaurant:      "https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?w=900&q=85&auto=format&fit=crop",
  // Mixed-use retail - urban retail with apartments above
  mixedUse:        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=900&q=85&auto=format&fit=crop",
  // Strip mall - small commercial strip
  stripMall:       "https://images.unsplash.com/photo-1604754742629-3e5728249d73?w=900&q=85&auto=format&fit=crop",
};

type ShowcasePhoto = { heroImageUrl: string; nameKey?: string; assetType?: string };

function HeroShowcase() {
  const [openCard, setOpenCard] = React.useState<number | null>(null);
  // Real property hero photos pulled from the user's workspace (live Firestore)
  const [realPhotos, setRealPhotos] = React.useState<ShowcasePhoto[]>([]);

  React.useEffect(() => {
    let aborted = false;
    fetch("/api/showcase", { cache: "no-store" })
      .then(r => r.ok ? r.json() : { photos: [] })
      .then((d: { photos?: ShowcasePhoto[] }) => {
        if (aborted) return;
        const photos = (d.photos || []).filter(p => p.heroImageUrl);
        if (photos.length) setRealPhotos(photos);
      })
      .catch(() => { /* fallback to curated Unsplash stays in place */ });
    return () => { aborted = true; };
  }, []);

  // Try to find a real photo in the user's Pro workspace that matches this
  // sample card by name. We split the card name into tokens and look for
  // a photo whose nameKey contains any meaningful token (length >= 4).
  // Returns undefined if no match - caller falls back to curated imagery.
  const matchPhotoByName = React.useCallback((cardName: string): string | undefined => {
    if (!realPhotos.length) return undefined;
    const nameLower = cardName.toLowerCase();
    // Strongest signal: full-name substring match on either side.
    const full = realPhotos.find(p =>
      p.nameKey && (p.nameKey.includes(nameLower) || nameLower.includes(p.nameKey))
    );
    if (full) return full.heroImageUrl;
    // Token-based fallback: meaningful tokens (≥ 4 chars, not boilerplate).
    const boilerplate = new Set(["plaza", "center", "centre", "retail", "commons", "corners", "park", "place", "shops", "the"]);
    const tokens = nameLower.split(/[^a-z]+/).filter(t => t.length >= 4 && !boilerplate.has(t));
    for (const t of tokens) {
      const hit = realPhotos.find(p => p.nameKey && p.nameKey.includes(t));
      if (hit) return hit.heroImageUrl;
    }
    return undefined;
  }, [realPhotos]);

  const cards: HeroCard[] = [
    {
      name: "Greenfield Shopping Center", city: "Greenfield, WI", type: "Multi-Tenant Retail",
      score: 78, verdict: "BUY",
      price: "$14.2M", cap: "7.80%", noi: "$1.11M", sf: "94.2K SF",
      photoUrl: PHOTO.shoppingCenter,
      hero: "linear-gradient(135deg, #1e3a5f 0%, #2d4a6b 40%, #84CC16 180%)",
      pricePerSf: "$151/SF", dscr: "1.42x", coc: "9.8%", debtYield: "11.7%",
      occupancy: "94%", yearBuilt: "1998", tenantCount: "12", walt: "6.2 yrs", submarket: "Milwaukee MSA",
      executive: "Stabilized multi-tenant center with an anchor holding 12 years of remaining term and shop rents 18% below market comps. Traffic counts of 37K VPD support the retail thesis and embedded rent steps provide inflation protection. Rollover risk is moderate with 3 shop leases expiring in the next 24 months.",
      strengths: [
        "Anchor credit tenant with 12 yrs WALT drives durable cash flow",
        "In-place rents 18% below market - mark-to-market upside on renewals",
        "Strong retail corridor at 37,400 VPD on primary frontage",
      ],
      concerns: [
        "3 shop tenants rolling in next 24 months - re-lease exposure",
        "Roof nearing end of useful life, TI / cap-ex reserves needed",
      ],
      signal: "Below-market rents with strong traffic. Watch rollover risk.",
      aiSignals: [
        { title: "NOI upside", detail: "Shop rents 18% below market comps - $165K NOI lift on rollover at market", impact: "pos" },
        { title: "Anchor strength", detail: "Credit-rated anchor with 12 yrs base term + 2x5 yr options", impact: "pos" },
        { title: "Roof age", detail: "Original 1998 roof; budget $180K-$220K in years 1-3", impact: "neg" },
      ],
      tenants: [
        { name: "Pick 'n Save (Anchor)", sf: "54,200", rent: "$486K", term: "Mar 2038" },
        { name: "Dollar Tree",            sf: "10,800", rent: "$140K", term: "Jul 2029" },
        { name: "Great Clips",            sf: "1,800",  rent: "$48K",  term: "Dec 2026" },
        { name: "Sport Clips",            sf: "1,500",  rent: "$42K",  term: "Aug 2027" },
        { name: "Jimmy John's",           sf: "1,650",  rent: "$52K",  term: "Jun 2028" },
        { name: "Verizon Wireless",       sf: "2,100",  rent: "$68K",  term: "Feb 2029" },
      ],
      reviewItems: [
        "No vacancy allowance in OM - typical underwriting uses 3-5%",
        "Management fee understated at 2% of EGI - industry norm 3-4%",
        "No capital reserves budgeted - should be $0.15-0.25/SF",
      ],
      greenFlags: ["Anchor tenant 12 yrs remaining", "Rents 18% below market comps", "37K VPD on primary frontage"],
      yellowFlags: ["3 tenants rolling in next 24 months", "Roof nearing end of useful life"],
      redFlags: [],
      locationIntel: {
        grade: "B+",
        summary: "Established retail corridor in the south-Milwaukee suburbs. Stable, middle-income trade area with dense daytime traffic on 76th St and healthy household formation in a 3-mile ring. Not a trophy market - but durable, defensible retail demand.",
        census: { population: "118,400", medianIncome: "$81,200", medianAge: "39.8", homeValue: "$302K", unemployment: "3.4%" },
        anchors: ["Meijer", "Walmart Supercenter", "Home Depot", "Planet Fitness", "Starbucks"],
        signals: [
          { label: "Traffic", detail: "76th St corridor at 37,400 VPD - top quartile for the submarket", tone: "green" },
          { label: "Rooftops", detail: "+1.4% annual population growth in 3-mile ring over last 5 yrs", tone: "green" },
          { label: "Retail pipeline", detail: "No new competitive multi-tenant construction within 2 miles", tone: "green" },
        ],
      },
    },
    {
      name: "Hales Corners Plaza", city: "Hales Corners, WI", type: "Grocery-Anchored Retail",
      score: 72, verdict: "BUY",
      price: "$9.4M", cap: "8.34%", noi: "$784K", sf: "62.5K SF",
      photoUrl: "https://images.unsplash.com/photo-1506781961370-37a89d6b3095?w=1000&q=85&auto=format&fit=crop",
      hero: "linear-gradient(135deg, #2d1f4e 0%, #4a2d5f 40%, #84CC16 180%)",
      pricePerSf: "$150/SF", dscr: "1.51x", coc: "10.4%", debtYield: "12.4%",
      occupancy: "97%", yearBuilt: "2003", tenantCount: "9", walt: "5.4 yrs", submarket: "Milwaukee South",
      executive: "Grocery-anchored neighborhood center priced at a meaningful discount to replacement cost. Anchor has 8 years base term remaining with 2x5 year options and the shops are 97% occupied. The asset benefits from recession-resistant tenancy and stable, predictable cash flow.",
      strengths: [
        "Grocery-anchored, recession-resistant demand driver",
        "Priced at $150/SF - below estimated $185/SF replacement cost",
        "97% occupancy with limited exposure in near-term rollover",
      ],
      concerns: [
        "Limited historical rent growth in this submarket",
        "Anchor lease has co-tenancy clause that could reduce rent if shops decline",
      ],
      signal: "Below-replacement cost, anchor 8 yrs remaining.",
      aiSignals: [
        { title: "Replacement cost", detail: "Trade at $150/SF vs. $185/SF new construction - downside protection", impact: "pos" },
        { title: "Anchor WALT", detail: "8 years base + options keeps income stable through next cycle", impact: "pos" },
        { title: "Co-tenancy", detail: "Anchor has rent reduction clause if 2+ junior shops go dark", impact: "neu" },
      ],
      tenants: [
        { name: "Sendik's Food Market",   sf: "42,000", rent: "$378K", term: "Oct 2034" },
        { name: "UPS Store",              sf: "1,800",  rent: "$50K",  term: "Apr 2028" },
        { name: "Starbucks",              sf: "2,200",  rent: "$82K",  term: "Sep 2030" },
        { name: "Chipotle",               sf: "2,400",  rent: "$95K",  term: "May 2029" },
        { name: "GNC",                    sf: "1,500",  rent: "$42K",  term: "Mar 2027" },
      ],
      reviewItems: [
        "CAM reconciliation history needed - verify NNN recoveries",
        "Anchor sales figures not disclosed - request health ratio",
      ],
      greenFlags: ["Grocery-anchored, recession-resistant", "Below replacement cost at $150/SF", "8 yrs anchor term"],
      yellowFlags: ["Limited rent growth history"],
      redFlags: [],
      locationIntel: {
        grade: "B+",
        summary: "Inner-ring suburb 15 minutes from downtown Milwaukee. Mature grocery trade area with high daytime population density and stable, owner-occupied rooftops. A classic infill grocery location - not high-growth, but sticky.",
        census: { population: "96,800", medianIncome: "$78,400", medianAge: "42.1", homeValue: "$284K", unemployment: "3.2%" },
        anchors: ["Sendik's Food Market", "Target", "Walgreens", "CVS", "Pick 'n Save"],
        signals: [
          { label: "Grocery moat", detail: "Sendik's = #2 regional grocer by sales/SF in MKE MSA", tone: "green" },
          { label: "Rooftops", detail: "Mature, owner-occupied rooftops - 72% ownership in 1-mile ring", tone: "green" },
          { label: "Submarket growth", detail: "Flat population trend - stable but not growing", tone: "yellow" },
        ],
      },
    },
    {
      name: "Harwood Retail Center", city: "Wauwatosa, WI", type: "Neighborhood Center",
      score: 69, verdict: "BUY",
      price: "$7.0M", cap: "8.39%", noi: "$587K", sf: "48.1K SF",
      photoUrl: PHOTO.neighborhood,
      hero: "linear-gradient(135deg, #1f3a3a 0%, #2d5555 40%, #84CC16 180%)",
      pricePerSf: "$146/SF", dscr: "1.38x", coc: "9.2%", debtYield: "11.8%",
      occupancy: "91%", yearBuilt: "1995", tenantCount: "7", walt: "4.1 yrs", submarket: "Milwaukee West",
      executive: "Coffee-anchored neighborhood center in a stable Wauwatosa submarket with strong surrounding demographics. Stone Creek Coffee draws daily, repeat foot traffic that lifts every shop tenant in the roster. In-place cap rate is attractive relative to submarket comps, though the non-credit local anchor and a modest CapEx backlog are considerations.",
      strengths: [
        "Stone Creek Coffee draws daily repeat traffic - benefits every shop tenant",
        "In-place cap rate ~40 bps above submarket averages",
        "Strong $92K median HH income within 3-mile radius",
      ],
      concerns: [
        "Non-credit local anchor - no rated credit backstop",
        "Deferred CapEx backlog estimated at ~$240K (paving, HVAC)",
      ],
      signal: null,
      aiSignals: [
        { title: "Price vs market", detail: "8.39% going-in cap vs. 7.85% submarket median for similar assets", impact: "pos" },
        { title: "Anchor draw", detail: "Stone Creek Coffee = destination local brand; pulls daily foot traffic", impact: "pos" },
        { title: "Anchor credit", detail: "Non-credit anchor, 4.1 yr remaining term - re-trade if renewal falters", impact: "neg" },
        { title: "CapEx", detail: "Parking lot re-seal + 2 HVAC units at end of life - ~$240K", impact: "neg" },
      ],
      tenants: [
        { name: "Stone Creek Coffee (Anchor)", sf: "4,200",  rent: "$128K", term: "Jun 2030" },
        { name: "Panera Bread",                sf: "3,200",  rent: "$98K",  term: "Aug 2030" },
        { name: "AT&T",                        sf: "1,800",  rent: "$55K",  term: "Jul 2028" },
        { name: "State Farm",                  sf: "1,600",  rent: "$44K",  term: "Dec 2027" },
        { name: "H&R Block",                   sf: "1,400",  rent: "$38K",  term: "Nov 2026" },
      ],
      reviewItems: [
        "CapEx reserves not included - allocate $240K for deferred items",
        "Anchor health ratio not available - request Stone Creek sales/SF",
      ],
      greenFlags: ["Stone Creek Coffee anchor draws daily foot traffic", "In-place cap rate above market", "Strong submarket demographics"],
      yellowFlags: ["Non-credit local anchor", "CapEx backlog ~$240K"],
      redFlags: [],
      locationIntel: {
        grade: "A-",
        summary: "Wauwatosa is one of the strongest inner-ring suburbs in the Milwaukee MSA - high median incomes, dense rooftops, and a healthy mix of medical office and specialty retail. The immediate corridor benefits from hospital-related daytime employment.",
        census: { population: "134,200", medianIncome: "$94,600", medianAge: "40.5", homeValue: "$348K", unemployment: "2.9%" },
        anchors: ["Froedtert Hospital", "Mayfair Mall", "Trader Joe's", "Whole Foods", "Chick-fil-A"],
        signals: [
          { label: "Demographics", detail: "$94.6K median HH income - top decile for Milwaukee MSA", tone: "green" },
          { label: "Daytime pop", detail: "Hospital + medical campus drives 14K daytime employees within 1 mile", tone: "green" },
          { label: "Anchor credit", detail: "Local fitness anchor is non-rated - no credit backstop", tone: "yellow" },
        ],
      },
    },
    {
      name: "Outback Steakhouse", city: "Fredericksburg, VA", type: "Single-Tenant NNN",
      score: 45, verdict: "PASS",
      price: "$4.8M", cap: "5.6%", noi: "$269K", sf: "6.2K SF",
      photoUrl: "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1000&q=85&auto=format&fit=crop",
      hero: "linear-gradient(135deg, #4a1f1f 0%, #6b2d2d 40%, #F87171 180%)",
      pricePerSf: "$774/SF", dscr: "1.08x", coc: "3.1%", debtYield: "7.9%",
      occupancy: "100%", yearBuilt: "2001", tenantCount: "1", walt: "5.0 yrs", submarket: "I-95 Corridor",
      executive: "Single-tenant QSR asset with corporate guarantee on an aging building. Cap rate compressed ~80 bps below market for comparable single-tenant restaurant NNN assets, and with only 5 years of base term remaining, TI burden at lease end is a material risk.",
      strengths: [
        "Corporate guarantee from Bloomin' Brands",
        "Interstate visibility with strong retail node",
      ],
      concerns: [
        "Cap rate 80 bps below market for QSR NNN",
        "5 yrs remaining, no options exercised - re-lease risk",
        "Building 24 yrs old - material TI likely at lease end",
      ],
      signal: "Single-tenant risk, cap rate below market.",
      aiSignals: [
        { title: "Cap rate mispricing", detail: "5.6% vs. ~6.4% market for QSR NNN with 5 yr term - overpaying ~12%", impact: "neg" },
        { title: "TI exposure", detail: "At lease end, expect $150-$250K TI to re-tenant or extend", impact: "neg" },
        { title: "Credit", detail: "Corporate guarantee mitigates in-term risk", impact: "pos" },
      ],
      tenants: [
        { name: "Outback Steakhouse (Corp)", sf: "6,200", rent: "$269K", term: "Mar 2031" },
      ],
      reviewItems: [
        "Options not exercised - re-lease probability materially uncertain",
        "No reserve for TI / re-tenanting at lease end",
      ],
      greenFlags: ["Corporate guarantee", "Interstate visibility"],
      yellowFlags: ["5 yrs remaining, no options exercised"],
      redFlags: ["Cap rate 80 bps below market for QSR NNN", "Aging building, TI burden at lease end"],
      locationIntel: {
        grade: "C+",
        summary: "Secondary I-95 off-ramp retail node between DC and Richmond. Reasonable traffic counts but the restaurant pad sits in a saturated casual-dining cluster with nearby competition from Applebee's, Red Lobster, and Olive Garden. Site is functional, but undifferentiated.",
        census: { population: "74,100", medianIncome: "$67,300", medianAge: "36.9", homeValue: "$268K", unemployment: "4.1%" },
        anchors: ["Central Park Mall", "Applebee's", "Red Lobster", "Olive Garden", "Walmart Supercenter"],
        signals: [
          { label: "Comp saturation", detail: "5 competing casual-dining concepts within 1/4 mile", tone: "red" },
          { label: "Traffic", detail: "I-95 off-ramp @ 48K VPD - good visibility, but not a destination node", tone: "yellow" },
          { label: "Demographic fit", detail: "Median income at MSA average - no premium dining tailwind", tone: "yellow" },
        ],
      },
    },
    {
      name: "Fredericksburg Center", city: "Fredericksburg, VA", type: "Mixed-Use Retail",
      score: 62, verdict: "NEUTRAL",
      price: "$11.8M", cap: "7.20%", noi: "$850K", sf: "72.4K SF",
      photoUrl: PHOTO.mixedUse,
      hero: "linear-gradient(135deg, #3a2d1f 0%, #5f4a2d 40%, #F59E0B 180%)",
      pricePerSf: "$163/SF", dscr: "1.22x", coc: "7.4%", debtYield: "10.1%",
      occupancy: "86%", yearBuilt: "2006", tenantCount: "14", walt: "3.8 yrs", submarket: "Fredericksburg",
      executive: "Diversified mixed-use retail center in a growing suburban market. The income stream is broad but WALT under 4 years and two vacant suites temper the near-term return profile. Leasing momentum needs validation before committing at this basis.",
      strengths: [
        "Diversified 14-tenant base reduces single-tenant risk",
        "Submarket population growth of 2.1% annually",
      ],
      concerns: [
        "WALT under 4 years - material rollover in hold period",
        "2 vacant suites (8% of GLA) - leasing velocity uncertain",
      ],
      signal: null,
      aiSignals: [
        { title: "Tenant diversification", detail: "Top 3 tenants = 34% of rent - below concentration threshold", impact: "pos" },
        { title: "Rollover wall", detail: "9 of 14 leases expire within hold period - releasing risk", impact: "neg" },
        { title: "Vacancy carry", detail: "2 vacant suites = ~$110K annual NOI drag until leased", impact: "neg" },
      ],
      tenants: [
        { name: "Dollar General",    sf: "10,500", rent: "$142K", term: "Nov 2029" },
        { name: "GameStop",          sf: "2,400",  rent: "$68K",  term: "Aug 2027" },
        { name: "Jersey Mike's",     sf: "1,800",  rent: "$55K",  term: "Apr 2028" },
        { name: "Crunch Fitness",    sf: "22,000", rent: "$220K", term: "Feb 2031" },
        { name: "Vacant Suite A",    sf: "3,200",  rent: "--",    term: "--" },
      ],
      reviewItems: [
        "Downtime / re-lease costs not budgeted for 2 vacant suites",
        "WALT under 4 yrs - treat as value-add underwriting",
      ],
      greenFlags: ["Diversified tenant base", "Growing suburban submarket"],
      yellowFlags: ["WALT under 4 yrs", "2 vacant suites"],
      redFlags: [],
      locationIntel: {
        grade: "B",
        summary: "Growing suburban trade area 50 miles south of DC along the I-95 corridor. Demographics are improving as DC-commuters push further out for affordability. Mid-tier retail demand with healthy rooftop growth but no dominant anchor magnet nearby.",
        census: { population: "142,800", medianIncome: "$72,900", medianAge: "35.4", homeValue: "$316K", unemployment: "3.8%" },
        anchors: ["Spotsylvania Mall", "Walmart Supercenter", "Home Depot", "Wegmans", "Lowe's"],
        signals: [
          { label: "Rooftop growth", detail: "+2.1% annual population growth (3-mile) - strongest in submarket", tone: "green" },
          { label: "Tenant mix", detail: "14-tenant roster spans value, services, and fitness - diversified", tone: "green" },
          { label: "Leasing velocity", detail: "2 vacant suites - comparable centers averaging 9-month lease-up", tone: "yellow" },
        ],
      },
    },
    {
      name: "Silvernail Commons", city: "Pewaukee, WI", type: "Neighborhood Strip",
      score: 51, verdict: "PASS",
      price: "$2.9M", cap: "6.80%", noi: "$197K", sf: "10.3K SF",
      photoUrl: PHOTO.stripMall,
      hero: "linear-gradient(135deg, #2d2d3a 0%, #3a3a4e 40%, #F87171 180%)",
      pricePerSf: "$282/SF", dscr: "0.94x", coc: "-1.4%", debtYield: "7.1%",
      occupancy: "83%", yearBuilt: "1989", tenantCount: "6", walt: "2.1 yrs", submarket: "Lake Country",
      executive: "Small neighborhood strip with sub-stabilized fundamentals. DSCR falls below 1.00x at requested debt terms and half of the tenants are month-to-month. Pricing does not reflect the operational risk embedded in the roll and underperforming credit profile.",
      strengths: [
        "Good daytime traffic count for small shops (18K VPD)",
      ],
      concerns: [
        "DSCR below 1.00x at current debt terms",
        "3 of 6 tenants on month-to-month leases",
        "Near-term rollover wall (WALT 2.1 yrs)",
      ],
      signal: null,
      aiSignals: [
        { title: "Debt stress", detail: "0.94x DSCR at asking - 25% cash-in to hit 1.25x required", impact: "neg" },
        { title: "MTM risk", detail: "50% of roster could vacate on 30 days notice", impact: "neg" },
        { title: "Exit cap", detail: "Exit cap expansion likely at sale given size and submarket", impact: "neg" },
      ],
      tenants: [
        { name: "Nail Salon",      sf: "1,800", rent: "$32K", term: "MTM" },
        { name: "Local Cafe",      sf: "1,500", rent: "$28K", term: "Aug 2026" },
        { name: "Dry Cleaner",     sf: "1,200", rent: "$22K", term: "MTM" },
        { name: "Subway",          sf: "1,800", rent: "$54K", term: "Jun 2027" },
        { name: "Local Retailer",  sf: "2,400", rent: "$38K", term: "MTM" },
        { name: "Smoke Shop",      sf: "1,600", rent: "$30K", term: "Dec 2026" },
      ],
      reviewItems: [
        "DSCR fails debt service coverage - restructure at ~55% LTV",
        "3 MTM tenants = no lease security for underwriting",
      ],
      greenFlags: ["Good daytime traffic"],
      yellowFlags: ["Near-term rollover exposure"],
      redFlags: ["Below-threshold DSCR at current debt", "3 of 6 tenants month-to-month"],
      locationIntel: {
        grade: "C",
        summary: "Tertiary Lake Country strip location with adequate drive-by traffic but limited daytime employment and a weak shop-tenant draw. Node lacks a true anchor - surrounding centers pull most of the retail demand.",
        census: { population: "48,600", medianIncome: "$83,100", medianAge: "43.2", homeValue: "$334K", unemployment: "3.0%" },
        anchors: ["Woodman's Market", "Kohl's", "Target (4 mi)", "Home Depot (3 mi)"],
        signals: [
          { label: "Anchor vacuum", detail: "No anchor within center - tenants rely on drive-by, not cross-shopping", tone: "red" },
          { label: "Submarket pull", detail: "Woodman's + Target cluster 3-4 mi east captures most retail trips", tone: "red" },
          { label: "Demographics", detail: "Income profile is fine - just not enough daytime retail demand here", tone: "yellow" },
        ],
      },
    },
  ];

  const verdictColor: Record<string, { bg: string; fg: string; ring: string }> = {
    BUY:     { bg: "rgba(132,204,22,0.15)", fg: "#84CC16", ring: "#84CC16" },
    NEUTRAL: { bg: "rgba(217,119,6,0.15)",  fg: "#F59E0B", ring: "#F59E0B" },
    PASS:    { bg: "rgba(239,68,68,0.12)",  fg: "#F87171", ring: "#F87171" },
  };

  // ESC key to close modal
  React.useEffect(() => {
    if (openCard === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenCard(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCard]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px 100px", position: "relative" }}>
      {/* Soft lime glow backdrop */}
      <div style={{
        position: "absolute", inset: "5% 10%", borderRadius: "50%",
        background: "rgba(132,204,22,0.08)", filter: "blur(140px)", pointerEvents: "none", zIndex: 0,
      }} />

      <div style={{
        position: "relative", zIndex: 1,
        display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px", gap: 28, alignItems: "start",
      }} className="hero-showcase-grid">

        {/* Left side: headline + cards */}
        <div>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 42, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: -0.5, lineHeight: 1.05 }}>
              Quickly <span style={{ color: "#84CC16" }}>score and rank</span> on-market deals.
            </h3>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, margin: "8px 0 0", fontWeight: 500 }}>
              Upload an OM, get a verdict and a rent roll in under a minute.
            </p>
          </div>

          {/* UNMISTAKABLE example banner - diagonal hazard stripe */}
          <div style={{
            marginBottom: 16,
            background: "repeating-linear-gradient(-45deg, #F59E0B, #F59E0B 14px, #78350F 14px, #78350F 28px)",
            padding: "2px",
            borderRadius: 10,
          }}>
            <div style={{
              background: "#0d0d14",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: 1.5,
                  color: "#0d0d14", background: "#F59E0B",
                  padding: "4px 10px", borderRadius: 4,
                  boxShadow: "0 0 0 2px rgba(245,158,11,0.25)",
                }}>EXAMPLE DEALS</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
                  These are sample outputs - your real OMs get the same analysis.
                </span>
              </div>
              <span style={{ fontSize: 10, color: "rgba(245,158,11,0.9)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Not live deals
              </span>
            </div>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14,
          }} className="hero-cards-grid">
            {cards.map((c, i) => {
              const vc = verdictColor[c.verdict];
              // Prefer real photo from workspace over curated fallback
              // Prefer a name-matched photo from the user's Pro workspace
              // (e.g. "Hales Corners Plaza" matches a property with that
              // name). Fall back to positional match, then curated Unsplash.
              const matched = matchPhotoByName(c.name);
              const displayPhoto = matched || realPhotos[i]?.heroImageUrl || c.photoUrl;
              return (
                <button
                  key={i}
                  onClick={() => setOpenCard(i)}
                  className="hero-deal-card"
                  style={{
                    position: "relative", textAlign: "left", padding: 0,
                    background: "linear-gradient(180deg, rgba(22,22,32,0.95) 0%, rgba(14,14,22,0.95) 100%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14, overflow: "hidden",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    cursor: "pointer", font: "inherit", color: "inherit",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
                    width: "100%",
                  }}
                >
                  {/* Property hero image (real photo + gradient fallback) */}
                  <div style={{
                    position: "relative", height: 110, background: c.hero, overflow: "hidden",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    {/* Real property image - pulls from workspace when available */}
                    <img
                      src={displayPhoto}
                      alt={c.name}
                      loading="lazy"
                      style={{
                        position: "absolute", inset: 0, width: "100%", height: "100%",
                        objectFit: "cover",
                        filter: c.verdict === "PASS" ? "saturate(0.6) brightness(0.85)" : "saturate(1.1) brightness(0.95)",
                      }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    {/* Dark gradient overlay for readability */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.1) 40%, rgba(14,14,22,0.92) 100%)",
                    }} />
                    {/* Verdict tint */}
                    <div style={{
                      position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 0%, transparent 60%, ${vc.bg} 140%)`,
                      mixBlendMode: "overlay", opacity: 0.7,
                    }} />
                    {/* EXAMPLE badge - makes it unmistakable these are sample deals */}
                    <span style={{
                      position: "absolute", top: 8, left: 8,
                      fontSize: 9, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase",
                      background: "#F59E0B", color: "#0d0d14",
                      padding: "4px 8px", borderRadius: 4,
                      boxShadow: "0 0 0 1.5px rgba(245,158,11,0.45), 0 4px 10px rgba(0,0,0,0.3)",
                    }}>Example</span>
                    {/* Score ring */}
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      width: 44, height: 44, borderRadius: "50%",
                      border: `2px solid ${vc.ring}`,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{c.score}</div>
                      <div style={{ fontSize: 6.5, fontWeight: 700, color: vc.fg, letterSpacing: 0.3, marginTop: 1 }}>{c.verdict}</div>
                    </div>
                    {/* Asset type badge in corner */}
                    <div style={{
                      position: "absolute", bottom: 8, left: 8,
                      fontSize: 9, color: "rgba(255,255,255,0.85)", fontWeight: 600,
                      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
                      padding: "3px 7px", borderRadius: 3,
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}>{c.type}</div>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: "12px 14px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 2 }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" /><circle cx="12" cy="10" r="3" /></svg>
                      {c.city}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {[
                        ["Price", c.price], ["Cap", c.cap], ["NOI", c.noi], ["Size", c.sf],
                      ].map(([label, val]) => (
                        <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px" }}>
                          <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* View details hint */}
                    <div style={{
                      marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      fontSize: 10, color: "rgba(132,204,22,0.85)", fontWeight: 600,
                    }}>
                      <span>View analysis</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6" /></svg>
                    </div>
                  </div>

                  {/* (Removed floating AI signal callout - it overlapped
                      neighboring cards on narrow/mobile layouts. Signals
                      are still surfaced inside the detail modal.) */}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right side: feature card */}
        <div style={{
          background: "linear-gradient(180deg, rgba(22,22,32,0.9) 0%, rgba(12,12,20,0.95) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "20px 18px",
          position: "sticky", top: 20,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }} className="hero-feature-card">
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1.25, marginBottom: 6 }}>
            From OM to Decision
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#84CC16", marginBottom: 18, lineHeight: 1 }}>
            in 60 seconds
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              "AI extraction",
              "Auto underwriting",
              "Instant scoring",
              "Shareable deal view",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(.hero-deal-card):hover {
          transform: translateY(-4px);
          border-color: rgba(132,204,22,0.35) !important;
          box-shadow: 0 14px 36px rgba(0,0,0,0.55), 0 0 40px rgba(132,204,22,0.1) !important;
        }
        @media (max-width: 900px) {
          :global(.hero-showcase-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.hero-feature-card) {
            position: static !important;
          }
        }
        @media (max-width: 640px) {
          :global(.hero-cards-grid) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>

      {/* Property detail modal */}
      {openCard !== null && (
        <HeroCardModal
          card={cards[openCard]}
          displayPhoto={matchPhotoByName(cards[openCard].name) || realPhotos[openCard]?.heroImageUrl || cards[openCard].photoUrl}
          verdictColor={verdictColor}
          onClose={() => setOpenCard(null)}
        />
      )}
    </div>
  );
}

/* Property quick-view modal - WHITE THEME, mirrors real PropertyDetailClient
   Auto-scroll cinematic reveal + price sensitivity table */
function HeroCardModal({ card: c, displayPhoto, verdictColor, onClose }: {
  card: HeroCard;
  displayPhoto: string;
  verdictColor: Record<string, { bg: string; fg: string; ring: string }>;
  onClose: () => void;
}) {
  const vc = verdictColor[c.verdict];
  // Light theme palette (mirrors PropertyDetailClient real app)
  const LT = {
    bg: "#FFFFFF",
    surface: "#F8FAFC",
    surfaceLow: "#F1F5F9",
    border: "rgba(15, 23, 42, 0.08)",
    borderSoft: "rgba(15, 23, 42, 0.05)",
    text: "#0F172A",
    muted: "#6B7280",
    mutedSoft: "#94A3B8",
    lime: "#65A30D",
    limeSoft: "#F7FEE7",
    limeBorder: "rgba(132, 204, 22, 0.35)",
    amber: "#B45309",
    amberSoft: "#FFFBEB",
    amberBorder: "rgba(245, 158, 11, 0.3)",
    red: "#B91C1C",
    redSoft: "#FEF2F2",
    redBorder: "rgba(239, 68, 68, 0.3)",
    blue: "#2563EB",
  };
  const verdictLight: Record<string, { ring: string; fg: string; bg: string }> = {
    BUY:     { ring: "#65A30D", fg: "#4D7C0F", bg: "#ECFCCB" },
    NEUTRAL: { ring: "#D97706", fg: "#B45309", bg: "#FEF3C7" },
    PASS:    { ring: "#DC2626", fg: "#B91C1C", bg: "#FEE2E2" },
  };
  const vcL = verdictLight[c.verdict];
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [autoPaused, setAutoPaused] = React.useState(false);

  // Cinematic auto-scroll on open - gentle reveal down the page so user sees all the depth
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let rafId: number;
    let startTs: number | null = null;
    const DURATION = 8500;      // 8.5s total glide
    const START_DELAY = 700;    // let user read the hero first

    // Pause auto-scroll on user interaction
    const pause = () => setAutoPaused(true);
    el.addEventListener("wheel", pause, { passive: true });
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("mousedown", pause);

    const tick = (ts: number) => {
      if (autoPaused || !scrollRef.current) return;
      if (startTs === null) startTs = ts;
      const elapsed = ts - startTs;
      if (elapsed < START_DELAY) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (elapsed - START_DELAY) / DURATION);
      // easeInOutCubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const max = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
      scrollRef.current.scrollTop = eased * max * 0.78;  // leave some at the bottom for user to explore
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("wheel", pause);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("mousedown", pause);
    };
  }, [autoPaused]);

  // Key metrics strip that mirrors PropertyDetailClient
  const metricsStrip = [
    { label: "Price",        value: c.price,        editable: true },
    { label: "Cap Rate",     value: c.cap },
    { label: "NOI",          value: c.noi },
    { label: "DSCR",         value: c.dscr },
    { label: "Price / SF",   value: c.pricePerSf },
    { label: "Cash-on-Cash", value: c.coc },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 14px",
        animation: "heroModalFadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        ref={scrollRef}
        style={{
          position: "relative", maxWidth: 880, width: "100%", maxHeight: "92vh", overflow: "auto",
          background: LT.bg,
          border: `1px solid ${LT.border}`, borderRadius: 16,
          boxShadow: "0 30px 80px rgba(15,23,42,0.25), 0 2px 8px rgba(15,23,42,0.08)",
          animation: "heroModalSlideIn 0.25s ease",
          scrollBehavior: "smooth",
          color: LT.text,
        }}
      >
        {/* Sample banner */}
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          background: "linear-gradient(180deg, rgba(132,204,22,0.12) 0%, rgba(132,204,22,0.04) 100%)",
          borderBottom: `1px solid ${LT.limeBorder}`,
          padding: "9px 22px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          backdropFilter: "blur(8px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 9, fontWeight: 800, color: "#4D7C0F",
              background: "#ECFCCB", padding: "3px 8px", borderRadius: 4,
              border: "1px solid rgba(132,204,22,0.45)", letterSpacing: 0.5,
            }}>SAMPLE</span>
            <span style={{ fontSize: 11, color: LT.muted, fontWeight: 500 }}>
              This is how every OM you upload is analyzed
            </span>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: "50%",
            background: LT.surface, border: `1px solid ${LT.border}`,
            color: LT.text, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Hero banner with real photo */}
        <div style={{ position: "relative", height: 240, overflow: "hidden" }}>
          <img
            src={displayPhoto}
            alt={c.name}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover",
              filter: c.verdict === "PASS" ? "saturate(0.75) brightness(0.95)" : "saturate(1.05)",
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {/* Gradient overlay - dark at bottom for text legibility */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.25) 55%, rgba(15,23,42,0.85) 100%)" }} />
          {/* Asset type + name */}
          <div style={{ position: "absolute", bottom: 20, left: 24, right: 24 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>{c.type}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1.15, marginBottom: 4, textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{c.name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" /><circle cx="12" cy="10" r="3" /></svg>
              {c.city} · {c.submarket}
            </div>
          </div>
        </div>

        {/* DealSignal Score + verdict strip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 18, padding: "20px 24px",
          borderBottom: `1px solid ${LT.borderSoft}`,
          background: LT.surface,
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: `conic-gradient(${vcL.ring} ${(c.score / 100) * 360}deg, ${LT.surfaceLow} 0deg)`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            boxShadow: `0 4px 16px ${vcL.ring}25`,
          }}>
            <div style={{
              width: 66, height: 66, borderRadius: "50%",
              background: LT.bg,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: LT.text, lineHeight: 1 }}>{c.score}</div>
              <div style={{ fontSize: 8, fontWeight: 800, color: vcL.fg, letterSpacing: 0.6, marginTop: 3 }}>{c.verdict}</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: LT.mutedSoft, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>DealSignal Score</div>
            <div style={{ fontSize: 15, color: LT.text, fontWeight: 600, lineHeight: 1.4, marginTop: 4 }}>
              {c.verdict === "BUY" && "Worth pursuing. Clean fundamentals, manageable risks."}
              {c.verdict === "NEUTRAL" && "Not a clear winner. Proceed only if thesis fits."}
              {c.verdict === "PASS" && "Skip. Risk profile doesn't justify the price."}
            </div>
          </div>
        </div>

        {/* Metrics strip (mirrors PropertyDetailClient metrics strip) */}
        <div style={{
          display: "flex", gap: 0, margin: "18px 22px 0",
          background: LT.surface, borderRadius: 10, border: `1px solid ${LT.border}`,
          overflow: "hidden",
        }} className="hero-modal-metrics">
          {metricsStrip.map((m, i) => (
            <div key={m.label} style={{
              flex: 1, padding: "12px 14px",
              borderRight: i < metricsStrip.length - 1 ? `1px solid ${LT.border}` : "none",
              position: "relative",
            }}>
              <div style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8,
                color: LT.mutedSoft, marginBottom: 4,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {m.label}
                {m.editable && (
                  <span style={{ fontSize: 8, fontWeight: 800, background: LT.limeSoft, color: LT.lime, padding: "1px 5px", borderRadius: 3, letterSpacing: 0.3, border: `1px solid ${LT.limeBorder}` }}>EDIT</span>
                )}
              </div>
              <div style={{
                fontSize: 15, fontWeight: 800, color: LT.text,
                fontVariantNumeric: "tabular-nums",
              }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Price Sensitivity table (mirrors real PropertyDetailClient sensitivities) */}
        <div style={{ padding: "22px 22px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: LT.text }}>Price Sensitivity</div>
              <div style={{ fontSize: 11, color: LT.muted, marginTop: 2 }}>How the deal math moves with asking price</div>
            </div>
          </div>
          <div style={{
            background: LT.bg, border: `1px solid ${LT.border}`, borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1.2fr 1.1fr 0.9fr 0.9fr 1fr", gap: 0,
              padding: "9px 14px", fontSize: 9, fontWeight: 800, color: LT.mutedSoft,
              textTransform: "uppercase", letterSpacing: 0.6,
              borderBottom: `1px solid ${LT.border}`, background: LT.surface,
            }} className="hero-sens-head">
              <div>Scenario</div><div>Purchase Price</div><div>Cap Rate</div><div>DSCR</div><div>Cash-on-Cash</div>
            </div>
            {(() => {
              // Parse baseline numbers from the card strings
              const parseMoney = (s: string) => {
                const m = s.match(/([\d.]+)([MK])?/);
                if (!m) return 0;
                const n = parseFloat(m[1]);
                return m[2] === "M" ? n * 1e6 : m[2] === "K" ? n * 1e3 : n;
              };
              const parsePct = (s: string) => parseFloat(s.replace("%", "")) || 0;
              const parseDscr = (s: string) => parseFloat(s.replace("x", "")) || 0;
              const basePrice = parseMoney(c.price);
              const baseNoi = parseMoney(c.noi);
              const baseCap = parsePct(c.cap);
              const baseDscr = parseDscr(c.dscr);
              const baseCoc = parsePct(c.coc);
              const fmtMoney = (v: number) =>
                v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${v.toLocaleString()}`;

              const rows = [
                { label: "Under (-10%)", delta: -0.10, tone: "pos" as const },
                { label: "Under (-5%)",  delta: -0.05, tone: "pos" as const },
                { label: "At Asking",    delta: 0,     tone: "base" as const },
                { label: "Over (+5%)",   delta: 0.05,  tone: "neg" as const },
                { label: "Over (+10%)",  delta: 0.10,  tone: "neg" as const },
              ];

              return rows.map((r, i) => {
                const price = basePrice * (1 + r.delta);
                // Cap rate = NOI / price -> inversely proportional to price shift
                const cap = baseCap / (1 + r.delta);
                // DSCR scales roughly inversely with price (same debt service trajectory, flexing LTV)
                const dscr = baseDscr * (1 - r.delta * 0.8);
                // Cash-on-cash also flexes inversely
                const coc = baseCoc * (1 - r.delta * 1.4);

                const rowBg = r.tone === "base" ? LT.limeSoft : i % 2 === 0 ? LT.bg : LT.surface;
                const rowBorder = r.tone === "base" ? LT.limeBorder : LT.border;
                const labelColor = r.tone === "base" ? LT.lime : r.tone === "pos" ? "#047857" : r.tone === "neg" ? LT.red : LT.text;

                return (
                  <div key={r.label} style={{
                    display: "grid", gridTemplateColumns: "1.2fr 1.1fr 0.9fr 0.9fr 1fr", gap: 0,
                    padding: "11px 14px",
                    borderBottom: i < rows.length - 1 ? `1px solid ${LT.borderSoft}` : "none",
                    fontSize: 12.5, color: LT.text,
                    background: rowBg,
                    borderLeft: r.tone === "base" ? `3px solid ${LT.lime}` : "3px solid transparent",
                  }} className="hero-sens-row">
                    <div style={{ fontWeight: 700, color: labelColor, display: "flex", alignItems: "center", gap: 6 }}>
                      {r.label}
                      {r.tone === "base" && <span style={{ fontSize: 8, fontWeight: 800, background: LT.lime, color: "#fff", padding: "1px 5px", borderRadius: 3, letterSpacing: 0.3 }}>NOW</span>}
                    </div>
                    <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtMoney(price)}</div>
                    <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{cap.toFixed(2)}%</div>
                    <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: dscr < 1.2 ? LT.red : dscr < 1.3 ? LT.amber : "#047857" }}>{dscr.toFixed(2)}x</div>
                    <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: coc < 5 ? LT.red : coc < 7 ? LT.amber : "#047857" }}>{coc.toFixed(1)}%</div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Downloads section - mirrors the real property page download buttons */}
        <div style={{ padding: "18px 22px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: LT.text }}>Downloadable Deliverables</div>
              <div style={{ fontSize: 11, color: LT.muted, marginTop: 2 }}>Every analyzed deal ships with these exports</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }} className="hero-modal-downloads">
            {/* Workbook XLSX (emerald) */}
            <button type="button" onClick={(e) => e.preventDefault()} style={{
              background: "#ECFDF5",
              border: "1px solid rgba(16, 185, 129, 0.28)",
              borderRadius: 10, padding: "14px",
              cursor: "pointer", color: "inherit", font: "inherit",
              textAlign: "left", display: "flex", alignItems: "center", gap: 12,
              transition: "all 0.15s ease",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#D1FAE5"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(16,185,129,0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#ECFDF5"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: "#D1FAE5",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                border: "1px solid rgba(16, 185, 129, 0.3)",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A7E5A" strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8l8 8M16 8l-8 8" /></svg>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: LT.text }}>Workbook</div>
                  <span style={{ padding: "1px 5px", background: "#A7F3D0", borderRadius: 3, fontSize: 8.5, fontWeight: 800, color: "#065F46", letterSpacing: 0.3 }}>XLSX</span>
                </div>
                <div style={{ fontSize: 10.5, color: LT.muted, lineHeight: 1.35 }}>Full underwriting model, sensitivities, rent roll</div>
              </div>
            </button>

            {/* Brief DOCX (blue) */}
            <button type="button" onClick={(e) => e.preventDefault()} style={{
              background: "#EFF6FF",
              border: "1px solid rgba(59, 130, 246, 0.28)",
              borderRadius: 10, padding: "14px",
              cursor: "pointer", color: "inherit", font: "inherit",
              textAlign: "left", display: "flex", alignItems: "center", gap: 12,
              transition: "all 0.15s ease",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#DBEAFE"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(59,130,246,0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: "#DBEAFE",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                border: "1px solid rgba(59, 130, 246, 0.3)",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" /></svg>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: LT.text }}>Brief</div>
                  <span style={{ padding: "1px 5px", background: "#BFDBFE", borderRadius: 3, fontSize: 8.5, fontWeight: 800, color: "#1E3A8A", letterSpacing: 0.3 }}>DOCX</span>
                </div>
                <div style={{ fontSize: 10.5, color: LT.muted, lineHeight: 1.35 }}>Investment memo with summary, flags, signals</div>
              </div>
            </button>

            {/* Strategy XLSX PRO+ (amber/gold) */}
            <button type="button" onClick={(e) => e.preventDefault()} style={{
              background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
              border: "1px solid rgba(251, 191, 36, 0.35)",
              borderRadius: 10, padding: "14px",
              cursor: "pointer", color: "inherit", font: "inherit",
              textAlign: "left", display: "flex", alignItems: "center", gap: 12,
              transition: "all 0.15s ease",
              position: "relative",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(251,191,36,0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: "#FDE68A",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                border: "1px solid rgba(251, 191, 36, 0.4)",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: LT.text }}>Strategy</div>
                  <span style={{ padding: "1px 5px", background: "#FCD34D", borderRadius: 3, fontSize: 8.5, fontWeight: 800, color: "#78350F", letterSpacing: 0.3 }}>PRO+</span>
                </div>
                <div style={{ fontSize: 10.5, color: LT.muted, lineHeight: 1.35 }}>Core / Value-Add / Opportunistic lens</div>
              </div>
            </button>
          </div>
        </div>

        {/* Executive summary (mirrors real deal summary card) */}
        <div style={{ padding: "22px", paddingBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: LT.lime, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Executive Summary</div>
          <p style={{ fontSize: 14, color: LT.text, lineHeight: 1.7, margin: "0 0 16px" }}>{c.executive}</p>

          {/* Strengths + concerns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="hero-modal-strengths-grid">
            <div style={{ background: LT.limeSoft, border: `1px solid ${LT.limeBorder}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: LT.lime, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Key Strengths</div>
              {c.strengths.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ color: LT.lime, fontSize: 13, lineHeight: "18px", flexShrink: 0, fontWeight: 800 }}>✓</span>
                  <span style={{ fontSize: 12.5, color: LT.text, lineHeight: 1.55 }}>{s}</span>
                </div>
              ))}
            </div>
            <div style={{ background: LT.amberSoft, border: `1px solid ${LT.amberBorder}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: LT.amber, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Primary Concerns</div>
              {c.concerns.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ color: LT.amber, fontSize: 13, lineHeight: "18px", flexShrink: 0, fontWeight: 800 }}>△</span>
                  <span style={{ fontSize: 12.5, color: LT.text, lineHeight: 1.55 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Property basics grid */}
        <div style={{ padding: "14px 22px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: LT.mutedSoft, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>From the OM</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }} className="hero-modal-basics">
            {[
              ["GLA", c.sf],
              ["Occupancy", c.occupancy],
              ["Year Built", c.yearBuilt],
              ["Tenants", c.tenantCount],
              ["WALT", c.walt],
              ["Debt Yield", c.debtYield],
              ["Submarket", c.submarket],
              ["Asset Type", c.type],
            ].map(([label, val]) => (
              <div key={label} style={{ background: LT.surface, borderRadius: 8, padding: "9px 11px", border: `1px solid ${LT.border}` }}>
                <div style={{ fontSize: 9, color: LT.mutedSoft, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, color: LT.text, fontWeight: 700, lineHeight: 1.2 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Signals section (mirrors the actionable signals section) */}
        <div style={{ padding: "14px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: LT.text }}>AI Signals</div>
              <div style={{ fontSize: 11, color: LT.muted, marginTop: 2 }}>Actionable insights extracted from the OM</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {c.aiSignals.map((s, i) => {
              const colors = s.impact === "pos"
                ? { bg: LT.limeSoft, border: LT.limeBorder, ring: LT.lime, fg: "#365314" }
                : s.impact === "neg"
                ? { bg: LT.redSoft, border: LT.redBorder, ring: LT.red, fg: "#7F1D1D" }
                : { bg: LT.amberSoft, border: LT.amberBorder, ring: LT.amber, fg: "#78350F" };
              return (
                <div key={i} style={{
                  background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 9, padding: "10px 14px",
                  display: "flex", alignItems: "flex-start", gap: 10,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors.ring, marginTop: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: colors.fg, fontWeight: 700, marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: LT.text, lineHeight: 1.45 }}>{s.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Location Intel / Deep Research (mirrors the real deep research section) */}
        <div style={{ padding: "14px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: LT.text }}>Location Intel</div>
              <div style={{ fontSize: 11, color: LT.muted, marginTop: 2 }}>Deep research on the trade area, comps, and rooftops</div>
            </div>
            {(() => {
              const g = c.locationIntel.grade;
              const letter = g.charAt(0).toUpperCase();
              const tone =
                letter === "A" ? { bg: LT.limeSoft, border: LT.limeBorder, fg: LT.lime } :
                letter === "B" ? { bg: LT.limeSoft, border: LT.limeBorder, fg: LT.lime } :
                letter === "C" ? { bg: LT.amberSoft, border: LT.amberBorder, fg: LT.amber } :
                                 { bg: LT.redSoft,  border: LT.redBorder,  fg: LT.red };
              return (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: tone.bg, border: `1px solid ${tone.border}`,
                  padding: "6px 12px", borderRadius: 8,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: LT.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>Location</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: tone.fg, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{g}</span>
                </div>
              );
            })()}
          </div>

          {/* Narrative summary */}
          <div style={{
            background: LT.surface, border: `1px solid ${LT.border}`, borderRadius: 10,
            padding: "14px 16px", fontSize: 13, color: LT.text, lineHeight: 1.6,
            marginBottom: 10,
          }}>
            {c.locationIntel.summary}
          </div>

          {/* Census strip - 5 mini stats in a row */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 10,
          }} className="hero-census-grid">
            {[
              { label: "Population (3-mi)", value: c.locationIntel.census.population },
              { label: "Median HHI", value: c.locationIntel.census.medianIncome },
              { label: "Median Age", value: c.locationIntel.census.medianAge },
              { label: "Home Value", value: c.locationIntel.census.homeValue },
              { label: "Unemployment", value: c.locationIntel.census.unemployment },
            ].map(s => (
              <div key={s.label} style={{
                background: LT.bg, border: `1px solid ${LT.border}`, borderRadius: 8, padding: "9px 10px",
              }}>
                <div style={{ fontSize: 9, color: LT.mutedSoft, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: LT.text, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Nearby anchors / co-tenants */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: LT.mutedSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Nearby Anchors</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {c.locationIntel.anchors.map((a, i) => (
                <span key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 11, fontWeight: 600, color: LT.text,
                  background: LT.surface, border: `1px solid ${LT.border}`,
                  padding: "5px 10px", borderRadius: 20,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: LT.lime }} />
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Key signals - 3 color-coded cards */}
          <div>
            <div style={{ fontSize: 10, color: LT.mutedSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Key Signals</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }} className="hero-locsig-grid">
              {c.locationIntel.signals.map((s, i) => {
                const tone = s.tone === "green"
                  ? { bg: LT.limeSoft, border: LT.limeBorder, fg: LT.lime, label: "Strong" }
                  : s.tone === "yellow"
                  ? { bg: LT.amberSoft, border: LT.amberBorder, fg: LT.amber, label: "Watch" }
                  : { bg: LT.redSoft, border: LT.redBorder, fg: LT.red, label: "Weak" };
                return (
                  <div key={i} style={{
                    background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 9, padding: "10px 12px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: LT.text }}>{s.label}</div>
                      <span style={{ fontSize: 8, fontWeight: 800, color: tone.fg, textTransform: "uppercase", letterSpacing: 0.4 }}>{tone.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: LT.text, lineHeight: 1.45 }}>{s.detail}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rent Roll table (mirrors real tenant rent roll) */}
        <div style={{ padding: "14px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: LT.text }}>Rent Roll</div>
            <div style={{ fontSize: 11, color: LT.muted }}>{c.tenants.length} tenants · {c.walt} WALT</div>
          </div>
          <div style={{
            background: LT.bg,
            border: `1px solid ${LT.border}`,
            borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 0.9fr 0.9fr 0.9fr", gap: 0,
              padding: "8px 14px", fontSize: 9, fontWeight: 800, color: LT.mutedSoft,
              textTransform: "uppercase", letterSpacing: 0.6,
              borderBottom: `1px solid ${LT.border}`,
              background: LT.surface,
            }}>
              <div>Tenant</div><div>SF</div><div>Rent</div><div>Lease End</div>
            </div>
            {c.tenants.map((t, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "2fr 0.9fr 0.9fr 0.9fr", gap: 0,
                padding: "10px 14px",
                borderBottom: i < c.tenants.length - 1 ? `1px solid ${LT.borderSoft}` : "none",
                fontSize: 12, color: LT.text,
                background: i % 2 === 0 ? LT.bg : LT.surface,
              }}>
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontVariantNumeric: "tabular-nums" }}>{t.sf}</div>
                <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{t.rent}</div>
                <div style={{ fontVariantNumeric: "tabular-nums", color: t.term === "MTM" ? LT.red : LT.text, fontWeight: t.term === "MTM" ? 700 : 500 }}>{t.term}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Review items (mirrors the "review items" section) */}
        {c.reviewItems.length > 0 && (
          <div style={{ padding: "14px 22px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: LT.text, marginBottom: 8 }}>Needs Review</div>
            <div style={{
              background: LT.amberSoft, border: `1px solid ${LT.amberBorder}`,
              borderRadius: 9, padding: "12px 14px",
            }}>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {c.reviewItems.map((it, i) => (
                  <li key={i} style={{ fontSize: 12, color: LT.text, lineHeight: 1.5, paddingLeft: 18, position: "relative" }}>
                    <span style={{ position: "absolute", left: 0, top: 1, color: LT.amber, fontWeight: 800 }}>!</span>
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Flags grid (compact) */}
        <div style={{ padding: "14px 22px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }} className="hero-flags-grid">
            {[
              { label: "Green flags",  items: c.greenFlags,  color: LT.lime,  bg: LT.limeSoft,  border: LT.limeBorder },
              { label: "Yellow flags", items: c.yellowFlags, color: LT.amber, bg: LT.amberSoft, border: LT.amberBorder },
              { label: "Red flags",    items: c.redFlags,    color: LT.red,   bg: LT.redSoft,   border: LT.redBorder },
            ].map(section => (
              <div key={section.label} style={{
                background: section.bg, border: `1px solid ${section.border}`, borderRadius: 10, padding: "12px",
              }}>
                <div style={{ fontSize: 10, color: section.color, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  {section.label}
                </div>
                {section.items.length === 0 ? (
                  <div style={{ fontSize: 11, color: LT.mutedSoft, fontStyle: "italic" }}>None</div>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                    {section.items.map((it, idx) => (
                      <li key={idx} style={{ fontSize: 11, color: LT.text, lineHeight: 1.4, paddingLeft: 10, position: "relative" }}>
                        <span style={{ position: "absolute", left: 0, top: 6, width: 4, height: 4, borderRadius: "50%", background: section.color }} />
                        {it}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA footer - sticky hook (light theme) */}
        <div style={{
          position: "sticky", bottom: 0, zIndex: 5,
          padding: "16px 22px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.98) 35%, #FFFFFF 100%)",
          borderTop: `1px solid ${LT.limeBorder}`,
          backdropFilter: "blur(10px)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
          flexWrap: "wrap",
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: LT.text, fontWeight: 800, marginBottom: 2 }}>
              Get this for your next deal
            </div>
            <div style={{ fontSize: 11, color: LT.muted }}>
              Upload an OM and get the same scored brief in under 60 seconds.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: LT.lime, color: "#fff", border: "none", borderRadius: 10,
            padding: "12px 22px", fontSize: 13, fontWeight: 800, cursor: "pointer",
            letterSpacing: 0.3, display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 6px 20px rgba(101,163,13,0.35)",
          }}>
            Analyze my OM
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes heroModalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes heroModalSlideIn { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 720px) {
          :global(.hero-modal-metrics) { flex-wrap: wrap !important; }
          :global(.hero-modal-metrics) > div { flex: 1 1 33% !important; border-bottom: 1px solid rgba(15,23,42,0.08); }
          :global(.hero-modal-strengths-grid) { grid-template-columns: 1fr !important; }
          :global(.hero-modal-basics) { grid-template-columns: repeat(2, 1fr) !important; }
          :global(.hero-modal-downloads) { grid-template-columns: 1fr !important; }
          :global(.hero-sens-head), :global(.hero-sens-row) { grid-template-columns: 1.2fr 1fr 0.8fr 0.8fr 0.9fr !important; font-size: 11px !important; padding: 9px 10px !important; }
          :global(.hero-census-grid) { grid-template-columns: repeat(3, 1fr) !important; }
          :global(.hero-locsig-grid) { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          :global(.hero-flags-grid) { grid-template-columns: 1fr !important; }
          :global(.hero-census-grid) { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

/* ===========================================================================
   TYPES
   =========================================================================== */
type AnalysisData = any;
type ViewState = "upload" | "processing" | "result";

const ACCEPTED_EXT = ".pdf,.docx,.xlsx,.xls,.csv,.txt";

/* ===========================================================================
   MAIN PAGE COMPONENT
   =========================================================================== */
export default function OmAnalyzerPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [data, setData] = useState<AnalysisData>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragCounter = useRef(0);
  const dropZoneCounter = useRef(0);
  const [selectedAssetType, setSelectedAssetType] = useState<string>("auto");
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [usageData, setUsageData] = useState<{ uploadsUsed: number; uploadLimit: number } | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [animateStrip, setAnimateStrip] = useState(false);
  const [processingPct, setProcessingPct] = useState(0);
  const [processingMsgIdx, setProcessingMsgIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ===== ANONYMOUS USAGE TRACKING =====
  const getAnonId = useCallback(() => {
    let id = localStorage.getItem("nnn_anon_id");
    if (!id) {
      id = "anon_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem("nnn_anon_id", id);
    }
    return id;
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const anonId = getAnonId();
      const res = await fetch(`/api/workspace/usage?anonId=${anonId}`);
      if (res.ok) {
        const data = await res.json();
        setUsageData({ uploadsUsed: data.uploadsUsed, uploadLimit: data.uploadLimit });
      }
    } catch { /* silent */ }
  }, [getAnonId]);

  const incrementUsage = useCallback(async () => {
    try {
      const anonId = getAnonId();
      const res = await fetch("/api/workspace/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonId }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsageData({ uploadsUsed: data.uploadsUsed, uploadLimit: data.uploadLimit });
      }
    } catch { /* silent */ }
  }, [getAnonId]);

  // Fetch usage on mount
  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  // Safety: auto-dismiss drag overlay after 3s to prevent stuck state
  useEffect(() => {
    if (!globalDragging) return;
    const timeout = setTimeout(() => { dragCounter.current = 0; setGlobalDragging(false); }, 3000);
    return () => clearTimeout(timeout);
  }, [globalDragging]);

  // Processing percentage animation + rotating status messages
  useEffect(() => {
    if (view !== "processing") { setProcessingPct(0); setProcessingMsgIdx(0); return; }
    const start = Date.now();
    const duration = 50000; // 50 seconds to reach ~95%
    const tick = () => {
      const elapsed = Date.now() - start;
      const linear = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - linear, 3);
      const pct = Math.min(Math.round(eased * 95), 95);
      setProcessingPct(pct);
      if (linear < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const msgInterval = setInterval(() => setProcessingMsgIdx(i => (i + 1) % 7), 3000);
    return () => clearInterval(msgInterval);
  }, [view]);

  /* Intersection Observer: trigger process strip animation when visible */
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimateStrip(false);          // reset first (allows replay)
          requestAnimationFrame(() => setAnimateStrip(true));
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ===== FILE HANDLING =====
  const handleFile = useCallback((file: File) => {
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) { alert("File is too large. Max 50MB."); return; }
    const validExts = ["pdf", "docx", "xlsx", "xls", "csv", "txt"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!validExts.includes(ext)) { alert("Unsupported file type. Please upload PDF, DOCX, XLSX, CSV, or TXT."); return; }
    setSelectedFile(file);
  }, []);

  const removeFile = useCallback(() => {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ===== ANALYSIS - client-side PDF extraction + parse-lite API =====
  const startAnalysis = useCallback(async () => {
    if (!selectedFile) return;

    // Check usage limit before starting
    if (usageData && usageData.uploadsUsed >= usageData.uploadLimit) {
      setShowUpgradePrompt(true);
      return;
    }

    setView("processing");
    setStatusMsg("Uploading files...");
    trackLiteUpload(selectedFile.name, selectedFile.name.split(".").pop()?.toLowerCase() || "unknown");

    try {
      let documentText = "";
      const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "";

      // Hero image extraction (PDF only) - Try-Me-specific, runs in parallel with text extraction
      if (ext === "pdf") {
        setStatusMsg("Extracting property image...");
        try {
          const heroBlob = await extractHeroImageFromPDF(selectedFile);
          if (heroBlob && heroBlob.size > 5000) {
            setHeroImageUrl(URL.createObjectURL(heroBlob));
            console.log("[om-analyzer] Smart hero image set (blob)");
            // Upload to Firebase Storage for persistent URL (non-blocking)
            (async () => {
              try {
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve, reject) => {
                  reader.onload = () => {
                    const result = reader.result as string;
                    resolve((reader.result as string).split(",")[1]);
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(heroBlob);
                });
                const res = await fetch("/api/om-analyzer/upload-image", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ imageBase64: base64 }),
                });
                if (res.ok) {
                  const { url } = await res.json();
                  if (url) {
                    setHeroImageUrl(url);
                    console.log("[om-analyzer] Hero image persisted to Storage:", url);
                  }
                }
              } catch (uploadErr) {
                console.warn("[om-analyzer] Storage upload failed, using blob URL:", uploadErr);
              }
            })();
          } else {
            console.log("[om-analyzer] No good property image found in PDF - will use map fallback");
          }
        } catch (imgErr) {
          console.warn("[om-analyzer] Hero image extraction failed:", imgErr);
        }
      }

      // === Text extraction: uses the SAME helper as Pro workspace ===
      // extractTextFromFile handles:
      //   • PDF text extraction (first 12 pages via pdf.js)
      //   • Vision OCR fallback for scanned / image-heavy OMs (critical for design-heavy broker flyers)
      //   • Excel/XLSX extraction via SheetJS
      //   • CSV/TXT/JSON/MD
      //   • Per-page headers (--- Page N ---) for better LLM context
      setStatusMsg("Reading file contents...");
      try {
        documentText = await extractTextFromFile(selectedFile);
        console.log(`[om-analyzer] Extracted ${documentText.length} chars from ${selectedFile.name}`);
      } catch (extractErr: any) {
        console.error("[om-analyzer] Text extraction failed:", extractErr);
        documentText = `[${ext.toUpperCase()} file: ${selectedFile.name}]\n(Extraction failed - property name may be in filename)`;
      }

      // Call unified tryme-analyze route - runs the EXACT SAME Pro pipeline
      // (runParseEngine + runScoreEngine) against an ephemeral Firestore
      // record. Guarantees Try Me scores match Pro scores byte-for-byte.
      setStatusMsg("Analyzing property data...");
      const analysisType = selectedAssetType === "auto" ? undefined : selectedAssetType;
      const response = await fetch("/api/om-analyzer/tryme-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentText: documentText.substring(0, 40000),
          fileName: selectedFile.name,
          source: "om-analyzer-page",
          analysisType,
          anonId: getAnonId(),
        }),
      });

      if (!response.ok) throw new Error("Analysis failed");
      const result = await response.json();

      // Score is already included in the response as result.proScore
      if (result.proScore) {
        setScoreResult(result.proScore);
      }

      setData(result);
      setView("result");
      trackLiteResult(result?.propertyName || selectedFile.name, result?.proScore?.totalScore || computeDealScore(result));

      // Increment usage counter after successful analysis
      incrementUsage();
    } catch (err) {
      console.error("Analysis error:", err);
      setData(generateDemoResult(selectedFile.name));
      setView("result");
      // Still increment on demo fallback (counts as an analysis attempt)
      incrementUsage();
    }
  }, [selectedFile, usageData, incrementUsage]);

  const resetAnalyzer = useCallback(() => {
    // Hard reset via full navigation - bulletproof, clears every piece of
    // state including any lingering blob URLs, hero images, usage caches,
    // and the file input. State-based reset was occasionally not flushing
    // the result view cleanly.
    try {
      if (heroImageUrl && heroImageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(heroImageUrl);
      }
    } catch {}
    if (typeof window !== "undefined") {
      // Use replace() + reload() to force a hard reset even when the current
      // URL is already /om-analyzer (setting href to the same path is a no-op
      // in most browsers, which was causing the button to appear dead).
      try {
        if (window.location.pathname === "/om-analyzer") {
          window.location.reload();
        } else {
          window.location.replace("/om-analyzer");
        }
      } catch {
        window.location.href = "/om-analyzer?reset=" + Date.now();
      }
      return;
    }
    setSelectedFile(null);
    setData(null);
    setHeroImageUrl("");
    setScoreResult(null);
    setView("upload");
    setStatusMsg("");
    if (fileRef.current) fileRef.current.value = "";
  }, [heroImageUrl]);

  return (
    <div className="ds-page-wrapper"
      onDragEnter={e => { e.preventDefault(); dragCounter.current++; if (view === "upload") setGlobalDragging(true); }}
      onDragOver={e => { e.preventDefault(); }}
      onDragLeave={e => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setGlobalDragging(false); } }}
      onDrop={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); setDragging(false); if (view === "upload" && e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
    >
      {/* Global drag overlay */}
      {globalDragging && (
        <div
          onDragOver={e => e.preventDefault()}
          onDragLeave={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); }}
          onDrop={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); setDragging(false); if (view === "upload" && e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
          className="tm-drag-overlay"
          style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(13,13,20,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            padding: "48px 64px", borderRadius: 20,
            border: "2px dashed #84CC16", background: "rgba(132,204,22,0.05)",
            textAlign: "center",
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>Drop your file anywhere</div>
            <div style={{ fontSize: 14, color: "#9ca3af" }}>PDF, Word, or Excel. We&apos;ll analyze it instantly</div>
          </div>
        </div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        html { scroll-behavior: smooth; }
        body, input, button, select, textarea { font-family: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scoreCount { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
        @keyframes barGrow { from { width: 0; } }
        @keyframes stepFadeIn { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes connectorGrow { from { width: 0; } to { width: 100%; } }
        @keyframes scanDown { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(400px); opacity: 0; } }
        @keyframes progressFill { from { width: 0; } to { width: 100%; } }
        @keyframes docSlide { 0% { transform: translateY(6px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes extractPulse { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }
        @keyframes scoreFill { from { stroke-dashoffset: 75.4; } to { stroke-dashoffset: var(--score-offset); } }
        @keyframes metricBar { from { width: 0; } to { width: var(--bar-w); } }
        @keyframes shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
        @keyframes omPulse {
          0% { box-shadow: inset 0 0 10px rgba(132,204,22,0.4), 0 0 20px rgba(132,204,22,0.15), 0 0 40px rgba(132,204,22,0.08); }
          50% { box-shadow: inset 0 0 20px rgba(132,204,22,0.5), 0 0 35px rgba(132,204,22,0.25), 0 0 60px rgba(132,204,22,0.12); }
          100% { box-shadow: inset 0 0 10px rgba(132,204,22,0.4), 0 0 20px rgba(132,204,22,0.15), 0 0 40px rgba(132,204,22,0.08); }
        }
        @keyframes omCardFadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes omProcessDot { 0% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0.3; transform: scale(0.8); } }
        @keyframes omFlowLine { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
        @keyframes omScanLine { 0% { top: 10%; opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { top: 85%; opacity: 0; } }
        @keyframes omFlowDot { 0% { left: 0; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: calc(100% - 6px); opacity: 0; } }

        /* Feature block scroll-trigger animation classes */
        .ds-feature-hidden * { animation-play-state: paused !important; opacity: 0; }
        .ds-feature-animate { animation: fadeInUp 0.5s ease-out both; }
        .ds-feature-animate * { animation-play-state: running; }

        .ds-om-outputs > div:hover { cursor: default; }
        /* Reusable curved green underline callout */
        .ds-callout {
          color: #84CC16;
          position: relative;
          display: inline-block;
        }
        .ds-callout::after {
          content: '';
          position: absolute;
          bottom: -12px;
          left: 15%;
          width: 70%;
          height: 14px;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 16' preserveAspectRatio='none'%3E%3Cpath d='M4 14 Q100 -2 196 14' stroke='%2384CC16' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center;
          background-size: 100% 100%;
        }
        /* Light bg variant */
        .ds-callout-dark {
          color: #4D7C0F;
          position: relative;
          display: inline-block;
        }
        .ds-callout-dark::after {
          content: '';
          position: absolute;
          bottom: -12px;
          left: 15%;
          width: 70%;
          height: 14px;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 16' preserveAspectRatio='none'%3E%3Cpath d='M4 14 Q100 -2 196 14' stroke='%234D7C0F' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center;
          background-size: 100% 100%;
        }
        .om-insight-card { opacity: 0; animation: omCardFadeIn 0.5s ease-out forwards; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .om-insight-card:hover { transform: translateY(-3px) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.08) !important; }
        /* Grid overlay removed - building background only */
        @media (max-width: 900px) {
          .om-insight-grid { grid-template-columns: 1fr !important; }
          .om-insight-circle { width: 160px !important; height: 160px !important; }
          .om-insight-outputs { grid-template-columns: 1fr !important; }
          .om-insight-arrow { display: none !important; }
        }
        .ds-process-strip { opacity: 1; }
        .ds-process-step { opacity: 1; }
        .ds-process-connector { position: relative; height: 2px; flex: 1; min-width: 32px; background: rgba(255,255,255,0.1); overflow: hidden; border-radius: 1px; align-self: center; }
        .ds-process-connector::after { content: ''; position: absolute; left: 0; top: 0; height: 100%; width: 100%; background: #84CC16; border-radius: 1px; }
        .ds-card { transition: all 0.25s ease; border-radius: 20px; background: rgba(22,22,31,0.6); border: 1px solid rgba(255,255,255,0.06); backdropFilter: blur(10px); }
        .ds-card:hover { transform: translateY(-3px); box-shadow: 0 0 30px rgba(132,204,22,0.06); }
        .ds-btn { display: inline-flex; align-items: center; justify-content: center; font-weight: 700; border-radius: 50px; cursor: pointer; transition: all 0.2s ease; text-decoration: none; border: none; }
        .ds-btn:hover { transform: translateY(-1px); }
        .ds-btn-primary { background: #84CC16; color: #0d0d14; box-shadow: 0 0 30px rgba(132,204,22,0.4), 0 0 60px rgba(132,204,22,0.15); }
        .ds-btn-primary:hover { box-shadow: 0 0 30px rgba(132,204,22,0.4), 0 0 60px rgba(132,204,22,0.15); transform: translateY(-2px); }
        .ds-btn-outline { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.12); }
        .ds-btn-outline:hover { border-color: #84CC16; color: #84CC16; box-shadow: 0 0 20px rgba(132,204,22,0.15); }
        .om-upload-zone { transition: all 0.2s ease; }
        .om-upload-zone:hover { border-color: #84CC16 !important; background: rgba(132,204,22,0.08) !important; }
        .dl-btn { transition: all 0.2s ease; }
        .dl-btn:hover { background: rgba(132,204,22,0.15) !important; transform: translateY(-1px); }
        .om-dark-btn { transition: all 0.2s ease; }
        .om-cta-btn { transition: all 0.2s ease; }
        .om-cta-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(132,204,22,0.3); }
        .om-feature-card { transition: all 0.25s ease; }
        .om-feature-card:hover { transform: translateY(-2px); }
        footer a { transition: color 0.15s ease; }
        footer a:hover { color: #84CC16 !important; }
        input:focus { box-shadow: 0 0 0 3px rgba(132,204,22,0.1) !important; }
        @media (max-width: 900px) {
          .ds-hero-grid { grid-template-columns: 1fr !important; text-align: center; }
          .ds-hero-left h1 { font-size: 36px !important; }
          .ds-hero-btns { justify-content: center !important; }
          .ds-features-3 { grid-template-columns: 1fr !important; }
          .ds-features-grid { grid-template-columns: 1fr !important; }
          .ds-pro-grid { grid-template-columns: 1fr !important; }
          .ds-pricing-grid { grid-template-columns: 1fr !important; }
          .ds-steps-grid { grid-template-columns: 1fr !important; }
          .ds-why-grid { grid-template-columns: 1fr !important; }
          .ds-faq-grid { grid-template-columns: 1fr !important; }
          .ds-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
          .ds-nav-links { display: none !important; }
          .ds-pro-features { grid-template-columns: 1fr 1fr !important; }
          .ds-workflow-steps { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-process-strip { transform: scale(0.85); transform-origin: left center; }
          .ds-om-outputs { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-report-cards { grid-template-columns: repeat(2, 1fr) !important; }
          .ds-report-header { text-align: center; justify-content: center !important; }
          .ds-feature-block { flex-direction: column !important; gap: 32px !important; }
          .ds-secondary-features { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .ds-footer-grid { grid-template-columns: 1fr !important; }
          .ds-pro-features { grid-template-columns: 1fr !important; }
        }

        /* ─── Try Me result card mobile ─── */
        @media (max-width: 768px) {
          .tm-result-flex { flex-direction: column !important; }
          .tm-result-image { width: 100% !important; flex-shrink: 1 !important; border-left: none !important; border-top: 1px solid rgba(0,0,0,0.05); flex-direction: row !important; padding: 12px !important; }
          .tm-result-text { padding: 16px !important; }
          .tm-metrics-strip { grid-template-columns: repeat(2, 1fr) !important; }
          .tm-signal-cards { flex-direction: column !important; }
          .tm-signal-cards > div { min-width: 0 !important; }
          .tm-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .tm-table-wrap table { min-width: 460px !important; }
          .ds-hero-grid { gap: 24px !important; }
          .ds-feature-block { gap: 24px !important; }
          .ds-section-pad { padding-left: 16px !important; padding-right: 16px !important; padding-top: 60px !important; padding-bottom: 48px !important; }
          .ds-hero-section { padding-top: 80px !important; padding-bottom: 40px !important; }
          .ds-hero-left h1 { font-size: 28px !important; line-height: 1.15 !important; }
          .ds-hero-left p { font-size: 16px !important; margin-bottom: 24px !important; }
          .ds-process-strip { transform: scale(0.7) !important; transform-origin: center center !important; }
          .tm-upload-zone { padding: 32px 16px !important; }
          .tm-drag-overlay { padding: 24px 16px !important; }
          /* Reduce section header margins */
          .ds-section-pad h2 { font-size: 26px !important; margin-bottom: 10px !important; }
          .ds-section-pad p { max-width: 100% !important; }
          /* Pricing grid - single column on mobile */
          .ds-pricing-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          /* Secondary features - stack vertically */
          .ds-secondary-features { grid-template-columns: 1fr !important; gap: 16px !important; }
          /* Compare visual - swap table for stacked cards */
          .ds-compare-table { display: none !important; }
          .ds-compare-cards { display: flex !important; }
          /* Section dividers - reduce negative margins */
          .ds-section-divider { margin: -40px auto 32px !important; }
          /* Footer tighter on mobile */
          .ds-footer-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          footer { padding: 40px 16px 24px !important; }
        }
        @media (max-width: 480px) {
          .tm-metrics-strip { grid-template-columns: 1fr !important; }
          .ds-hero-left h1 { font-size: 24px !important; }
          .ds-section-pad { padding-top: 40px !important; padding-bottom: 36px !important; }
        }
      `}</style>

      {/* ===== UPGRADE PROMPT OVERLAY ===== */}
      {showUpgradePrompt && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(13,13,20,0.8)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowUpgradePrompt(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#16161f", borderRadius: 16, padding: "40px 36px", maxWidth: 420,
            textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, background: "rgba(132,204,22,0.15)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            {(() => {
              const used = usageData?.uploadsUsed ?? 0;
              const limit = usageData?.uploadLimit ?? 2;
              const isAnonGate = !usageData?.tier || usageData.tier === "anonymous" || (usageData.tier === "free" && limit <= 2);
              const headline = isAnonGate
                ? `You've used your ${used} free ${used === 1 ? "deal" : "deals"}. Keep going?`
                : `You've used all ${limit} free deals. Ready to move faster?`;
              const sub = isAnonGate
                ? "Sign up free for 5 total deals + save to your workspace. Or start a 7-day Pro trial for 100 deals/mo."
                : "Start a 7-day free Pro trial. 100 deals/month for $40. Card required, cancel anytime.";
              return (
                <>
                  <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: "#ffffff", margin: "0 0 8px", letterSpacing: -0.3 }}>
                    {headline}
                  </h3>
                  <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6, margin: "0 0 24px" }}>
                    {sub}
                  </p>
                </>
              );
            })()}
            <a
              href="/workspace/login?upgrade=pro"
              onClick={(e) => {
                e.preventDefault();
                try { trackProCTAClick("lite_result_upgrade_prompt"); } catch {}
                setShowUpgradePrompt(false);
                window.location.href = "/workspace/login?upgrade=pro";
              }}
              style={{
                display: "inline-block", padding: "14px 36px",
                background: "linear-gradient(135deg, #84CC16, #a8d600)", color: "#0d0d14",
                borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: "none",
                marginBottom: 8, cursor: "pointer",
              }}
            >
              Start 7-Day Free Trial
            </a>
            {(!usageData?.tier || usageData.tier === "anonymous") && (
              <a
                href="/register"
                onClick={(e) => {
                  e.preventDefault();
                  setShowUpgradePrompt(false);
                  window.location.href = "/register";
                }}
                style={{
                  display: "block", padding: "10px 20px",
                  color: "#84CC16", fontSize: 13, fontWeight: 600, textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                Or sign up free (5 deals total)
              </a>
            )}
            <a
              href="/om-analyzer#pricing"
              onClick={(e) => {
                e.preventDefault();
                setShowUpgradePrompt(false);
                window.location.href = "/om-analyzer#pricing";
              }}
              style={{
                display: "block", padding: "10px 20px",
                color: "#9ca3af", fontSize: 13, fontWeight: 500, textDecoration: "none",
                cursor: "pointer",
              }}
            >
              Compare all plans
            </a>
            <button onClick={() => setShowUpgradePrompt(false)} style={{
              display: "block", width: "100%", marginTop: 12, padding: "10px",
              background: "none", border: "none", color: "#6b7280", cursor: "pointer",
              fontSize: 13, fontWeight: 500,
            }}>
              Maybe later
            </button>
          </div>
        </div>
      )}

      <DealSignalNav />

      {/* ===== RESULT: minimal header bar ===== */}
      {view === "result" && (
        <div style={{ padding: "12px 0", paddingTop: 76, borderBottom: "1px solid #EDF0F5", background: "transparent" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={resetAnalyzer} style={{
              padding: "8px 20px", background: "#16161f", border: "1.5px solid #D8DFE9",
              borderRadius: 6, fontSize: 13, fontWeight: 600, color: "#9ca3af", cursor: "pointer",
            }}>
              &larr; Analyze Another
            </button>
          </div>
        </div>
      )}

      {/* ===== HERO + LANDING PAGE ===== */}
      {view === "upload" && (
        <section
          onDragOver={e => { e.preventDefault(); }}
          onDrop={e => { e.preventDefault(); dropZoneCounter.current = 0; setDragging(false); if (e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
          style={{ background: "#0d0d14", paddingTop: 64 }}>

          {/* ── 1. HERO ── */}
          <div className="ds-section-pad ds-hero-section" style={{ padding: "100px 32px 120px", background: "#0d0d14", position: "relative", overflow: "hidden" }}>
            {/* Subtle line-drawing cityscape background */}
            <svg
              style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.08 }}
              viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax meet" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              {/* Skyline buildings */}
              <g stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Far left - short building */}
                <rect x="20" y="340" width="60" height="260" />
                <line x1="35" y1="360" x2="35" y2="380" /><line x1="55" y1="360" x2="55" y2="380" />
                <line x1="35" y1="400" x2="35" y2="420" /><line x1="55" y1="400" x2="55" y2="420" />
                <line x1="35" y1="440" x2="35" y2="460" /><line x1="55" y1="440" x2="55" y2="460" />

                {/* Tall tower */}
                <rect x="100" y="180" width="50" height="420" />
                <rect x="110" y="160" width="30" height="20" />
                <line x1="125" y1="140" x2="125" y2="160" />
                <line x1="115" y1="200" x2="115" y2="220" /><line x1="135" y1="200" x2="135" y2="220" />
                <line x1="115" y1="240" x2="115" y2="260" /><line x1="135" y1="240" x2="135" y2="260" />
                <line x1="115" y1="280" x2="115" y2="300" /><line x1="135" y1="280" x2="135" y2="300" />
                <line x1="115" y1="320" x2="115" y2="340" /><line x1="135" y1="320" x2="135" y2="340" />
                <line x1="115" y1="360" x2="115" y2="380" /><line x1="135" y1="360" x2="135" y2="380" />

                {/* Wide office block */}
                <rect x="170" y="290" width="90" height="310" />
                <line x1="170" y1="350" x2="260" y2="350" />
                <line x1="170" y1="410" x2="260" y2="410" />
                <line x1="170" y1="470" x2="260" y2="470" />
                <line x1="190" y1="290" x2="190" y2="600" /><line x1="215" y1="290" x2="215" y2="600" />
                <line x1="240" y1="290" x2="240" y2="600" />

                {/* Modern tower with setback */}
                <rect x="290" y="220" width="55" height="380" />
                <rect x="295" y="200" width="45" height="20" />
                <rect x="300" y="240" width="10" height="15" /><rect x="320" y="240" width="10" height="15" />
                <rect x="300" y="280" width="10" height="15" /><rect x="320" y="280" width="10" height="15" />
                <rect x="300" y="320" width="10" height="15" /><rect x="320" y="320" width="10" height="15" />
                <rect x="300" y="360" width="10" height="15" /><rect x="320" y="360" width="10" height="15" />
                <rect x="300" y="400" width="10" height="15" /><rect x="320" y="400" width="10" height="15" />

                {/* Skyscraper with spire */}
                <rect x="370" y="130" width="45" height="470" />
                <polygon points="380,130 392,80 405,130" />
                <line x1="392" y1="50" x2="392" y2="80" />
                <line x1="382" y1="160" x2="382" y2="175" /><line x1="402" y1="160" x2="402" y2="175" />
                <line x1="382" y1="200" x2="382" y2="215" /><line x1="402" y1="200" x2="402" y2="215" />
                <line x1="382" y1="240" x2="382" y2="255" /><line x1="402" y1="240" x2="402" y2="255" />
                <line x1="382" y1="280" x2="382" y2="295" /><line x1="402" y1="280" x2="402" y2="295" />
                <line x1="382" y1="320" x2="382" y2="335" /><line x1="402" y1="320" x2="402" y2="335" />
                <line x1="382" y1="360" x2="382" y2="375" /><line x1="402" y1="360" x2="402" y2="375" />

                {/* Short retail building */}
                <rect x="440" y="420" width="70" height="180" />
                <rect x="455" y="440" width="15" height="25" /><rect x="480" y="440" width="15" height="25" />
                <rect x="455" y="490" width="15" height="25" /><rect x="480" y="490" width="15" height="25" />
                <rect x="460" y="540" width="40" height="60" />

                {/* Mid-rise with flat roof */}
                <rect x="530" y="320" width="65" height="280" />
                <line x1="545" y1="340" x2="545" y2="355" /><line x1="565" y1="340" x2="565" y2="355" /><line x1="580" y1="340" x2="580" y2="355" />
                <line x1="545" y1="375" x2="545" y2="390" /><line x1="565" y1="375" x2="565" y2="390" /><line x1="580" y1="375" x2="580" y2="390" />
                <line x1="545" y1="410" x2="545" y2="425" /><line x1="565" y1="410" x2="565" y2="425" /><line x1="580" y1="410" x2="580" y2="425" />
                <line x1="545" y1="445" x2="545" y2="460" /><line x1="565" y1="445" x2="565" y2="460" /><line x1="580" y1="445" x2="580" y2="460" />

                {/* Glass tower */}
                <rect x="620" y="200" width="50" height="400" />
                <line x1="620" y1="240" x2="670" y2="240" /><line x1="620" y1="280" x2="670" y2="280" />
                <line x1="620" y1="320" x2="670" y2="320" /><line x1="620" y1="360" x2="670" y2="360" />
                <line x1="620" y1="400" x2="670" y2="400" /><line x1="620" y1="440" x2="670" y2="440" />
                <line x1="620" y1="480" x2="670" y2="480" /><line x1="620" y1="520" x2="670" y2="520" />
                <line x1="645" y1="200" x2="645" y2="600" />

                {/* Twin towers */}
                <rect x="700" y="250" width="35" height="350" /><rect x="745" y="270" width="35" height="330" />
                <line x1="710" y1="275" x2="710" y2="290" /><line x1="725" y1="275" x2="725" y2="290" />
                <line x1="710" y1="310" x2="710" y2="325" /><line x1="725" y1="310" x2="725" y2="325" />
                <line x1="710" y1="345" x2="710" y2="360" /><line x1="725" y1="345" x2="725" y2="360" />
                <line x1="755" y1="295" x2="755" y2="310" /><line x1="770" y1="295" x2="770" y2="310" />
                <line x1="755" y1="330" x2="755" y2="345" /><line x1="770" y1="330" x2="770" y2="345" />
                <line x1="755" y1="365" x2="755" y2="380" /><line x1="770" y1="365" x2="770" y2="380" />

                {/* Warehouse / industrial */}
                <rect x="810" y="400" width="80" height="200" />
                <line x1="810" y1="400" x2="850" y2="370" /><line x1="850" y1="370" x2="890" y2="400" />
                <rect x="830" y="500" width="20" height="30" /><rect x="860" y="500" width="20" height="30" />

                {/* Tall modern */}
                <rect x="920" y="170" width="45" height="430" />
                <rect x="925" y="155" width="35" height="15" />
                <line x1="942" y1="135" x2="942" y2="155" />
                {[0,1,2,3,4,5,6,7,8].map(i => <line key={`tm${i}`} x1="932" y1={195+i*45} x2="932" y2={210+i*45} />)}
                {[0,1,2,3,4,5,6,7,8].map(i => <line key={`tm2${i}`} x1="952" y1={195+i*45} x2="952" y2={210+i*45} />)}

                {/* Right cluster */}
                <rect x="990" y="310" width="55" height="290" />
                <line x1="1005" y1="330" x2="1005" y2="350" /><line x1="1025" y1="330" x2="1025" y2="350" />
                <line x1="1005" y1="370" x2="1005" y2="390" /><line x1="1025" y1="370" x2="1025" y2="390" />
                <line x1="1005" y1="410" x2="1005" y2="430" /><line x1="1025" y1="410" x2="1025" y2="430" />

                <rect x="1060" y="260" width="40" height="340" />
                <line x1="1075" y1="280" x2="1075" y2="295" /><line x1="1090" y1="280" x2="1090" y2="295" />
                <line x1="1075" y1="315" x2="1075" y2="330" /><line x1="1090" y1="315" x2="1090" y2="330" />
                <line x1="1075" y1="350" x2="1075" y2="365" /><line x1="1090" y1="350" x2="1090" y2="365" />

                {/* Far right buildings */}
                <rect x="1120" y="380" width="60" height="220" />
                <rect x="1130" y="400" width="15" height="20" /><rect x="1155" y="400" width="15" height="20" />
                <rect x="1130" y="440" width="15" height="20" /><rect x="1155" y="440" width="15" height="20" />

                <rect x="1200" y="300" width="50" height="300" />
                <line x1="1215" y1="320" x2="1215" y2="340" /><line x1="1235" y1="320" x2="1235" y2="340" />
                <line x1="1215" y1="360" x2="1215" y2="380" /><line x1="1235" y1="360" x2="1235" y2="380" />
                <line x1="1215" y1="400" x2="1215" y2="420" /><line x1="1235" y1="400" x2="1235" y2="420" />

                <rect x="1270" y="350" width="70" height="250" />
                <line x1="1270" y1="350" x2="1305" y2="320" /><line x1="1305" y1="320" x2="1340" y2="350" />
                <rect x="1290" y="500" width="25" height="40" />

                <rect x="1360" y="420" width="60" height="180" />
                <line x1="1375" y1="440" x2="1375" y2="455" /><line x1="1400" y1="440" x2="1400" y2="455" />
                <line x1="1375" y1="475" x2="1375" y2="490" /><line x1="1400" y1="475" x2="1400" y2="490" />
              </g>

              {/* Ground line */}
              <line x1="0" y1="600" x2="1440" y2="600" stroke="#ffffff" strokeWidth="1" opacity="0.5" />

              {/* Dot grid pattern in sky */}
              <g fill="#ffffff" opacity="0.3">
                {[0,1,2,3,4,5,6,7,8,9,10,11].map(row =>
                  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(col => (
                    <circle key={`d${row}-${col}`} cx={100 + col * 95} cy={40 + row * 45} r="1" />
                  ))
                )}
              </g>
            </svg>

            {/* Soft gradient fade at bottom of cityscape */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(to top, #0d0d14, transparent)", pointerEvents: "none", zIndex: 0 }} />

            {/* Gradient orbs for hero depth */}
            <div style={{ position: "absolute", top: -100, left: -200, width: 500, height: 500, borderRadius: "50%", background: "rgba(132,204,22,0.12)", filter: "blur(128px)", pointerEvents: "none", zIndex: 0 }} />
            <div style={{ position: "absolute", bottom: -100, right: -150, width: 400, height: 400, borderRadius: "50%", background: "rgba(132,204,22,0.06)", filter: "blur(128px)", pointerEvents: "none", zIndex: 0 }} />
            <div className="ds-hero-grid" style={{
              maxWidth: 1100, margin: "0 auto",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center",
              position: "relative", zIndex: 1,
            }}>
              {/* Left */}
              <div className="ds-hero-left" style={{ animation: "fadeInUp 0.5s ease-out" }}>

                <div style={{
                  fontSize: 13, fontWeight: 700, color: "#84CC16",
                  textTransform: "uppercase" as const, letterSpacing: 2,
                  marginBottom: 16,
                }}>
                  Commercial Real Estate
                </div>

                <h1 style={{
                  fontSize: 56, fontWeight: 800, color: "#ffffff", lineHeight: 1.1,
                  marginBottom: 20, letterSpacing: -1.5,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  Move Faster Than<br />the Market on<br /><span className="ds-callout">Every Deal</span>.
                </h1>
                <p style={{
                  fontSize: 19, color: "#9ca3af", lineHeight: 1.7,
                  maxWidth: 500, marginBottom: 36,
                }}>
                  DealSignals turns deals and OMs into actionable investment insight, powering faster pre-diligence decisions.
                </p>
              </div>

              {/* Right - upload column */}
              <div style={{ animation: "fadeInUp 0.5s ease-out 0.1s both", marginTop: -40 }}>
                {/* "Try now" label */}
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#84CC16", letterSpacing: 0.3 }}>
                    Analyze CRE on-market deals. Try now.
                  </span>
                </div>

                {/* Upload drop zone
                    Flicker fix: children of the drop zone get
                    pointer-events: none while dragging, so the browser
                    never retargets drag events to them. This eliminates
                    the dragleave/dragenter ping-pong that causes flicker.
                    Also: on dragleave, double-check relatedTarget is
                    actually outside before clearing. */}
                <div
                  onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (!dragging) setDragging(true); }}
                  onDragLeave={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = e.relatedTarget as Node | null;
                    if (next && e.currentTarget.contains(next)) return;
                    setDragging(false);
                  }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); if (e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]); }}
                  onClick={() => !selectedFile && fileRef.current?.click()}
                  className="tm-upload-zone"
                  style={{
                    background: dragging ? "rgba(132,204,22,0.06)" : "rgba(255,255,255,0.03)",
                    borderRadius: 20, padding: selectedFile ? "24px" : "48px 32px",
                    cursor: selectedFile ? "default" : "pointer",
                    border: `2px dashed ${dragging ? "#84CC16" : "rgba(132,204,22,0.25)"}`,
                    textAlign: "center",
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                >
                  {/* Wrapper that goes pointer-events: none during drag so
                      child elements can't become drag targets. */}
                  <div style={{ pointerEvents: dragging ? "none" : "auto" }}>
                  {!selectedFile ? (
                    <>
                      <div style={{
                        width: 56, height: 56, borderRadius: "50%", background: "rgba(132,204,22,0.12)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
                      }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "#ffffff", margin: "0 0 6px" }}>
                        {dragging ? "Drop your file here" : "Upload OM, flyer, deal summary or broker package"}
                      </p>
                      <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>
                        PDF, Word, Excel, or CSV &middot; Max 50MB
                      </p>
                      <button onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="ds-btn ds-btn-primary" style={{
                        fontSize: 14, padding: "12px 32px",
                      }}>
                        Select File
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        background: "rgba(255,255,255,0.05)", borderRadius: 10, textAlign: "left",
                      }}>
                        <span style={{ padding: "2px 8px", background: "rgba(132,204,22,0.15)", borderRadius: 6, fontSize: 9, fontWeight: 700, color: "#84CC16", textTransform: "uppercase", flexShrink: 0 }}>
                          {selectedFile.name.split(".").pop()}
                        </span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, fontSize: 13, color: "#ffffff" }}>{selectedFile.name}</span>
                        <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                        <button onClick={(e) => { e.stopPropagation(); removeFile(); }} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>&times;</button>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); startAnalysis(); }} className="ds-btn ds-btn-primary" style={{
                        display: "block", width: "100%", fontSize: 15, padding: "13px 32px", marginTop: 12,
                      }}>
                        Get Deal Signal
                      </button>
                    </>
                  )}
                  </div>
                </div>
                <input ref={fileRef} type="file" style={{ display: "none" }} accept={ACCEPTED_EXT}
                  onChange={(e) => { if (e.target.files?.length) handleFile(e.target.files[0]); }} />

                {/* Usage counter */}
                {usageData && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 }}>
                    <div style={{ height: 4, width: 56, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, transition: "width 0.3s ease",
                        width: `${Math.min(100, (usageData.uploadsUsed / usageData.uploadLimit) * 100)}%`,
                        background: usageData.uploadsUsed >= usageData.uploadLimit ? "#84CC16" : usageData.uploadsUsed >= usageData.uploadLimit - 1 ? "#eab308" : "#10b981",
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: usageData.uploadsUsed >= usageData.uploadLimit ? "#84CC16" : "#9ca3af" }}>
                      {usageData.uploadsUsed} / {usageData.uploadLimit} free
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── TRUST BAR ── */}
          <div style={{ padding: "20px 32px", maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ padding: "16px 32px", background: "rgba(132,204,22,0.03)", border: "1px solid rgba(132,204,22,0.06)", borderRadius: 12, display: "flex", justifyContent: "center", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
              {[
                "Built for real-world acquisition workflows",
                "90%+ extraction accuracy on standard CRE metrics",
                "Pre-diligence in 1 minute, not hours",
              ].map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Hero showcase (native HTML/CSS mockup) ── */}
          <div id="examples" style={{ scrollMarginTop: 80 }}>
            <HeroShowcase />
          </div>

          {/* ── ASSET-SPECIFIC MODELS (highlight only, no backend detail) ── */}
          <div id="asset-models" className="ds-section-pad" style={{
            padding: "100px 32px 80px", background: "#0d0d14",
            position: "relative", overflow: "hidden",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}>
            {/* Soft backdrop glow */}
            <div style={{
              position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)",
              width: 900, height: 500, borderRadius: "50%",
              background: "rgba(132,204,22,0.04)", filter: "blur(160px)",
              pointerEvents: "none",
            }} />

            <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 1 }}>
              {/* Section header */}
              <div style={{ textAlign: "center", marginBottom: 48 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", padding: "6px 16px",
                  borderRadius: 50, background: "rgba(132,204,22,0.08)", color: "#84CC16",
                  fontSize: 12, fontWeight: 700, marginBottom: 16, gap: 6,
                  letterSpacing: 0.5, textTransform: "uppercase" as const,
                  border: "1px solid rgba(132,204,22,0.18)",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Asset-Specific Models
                </div>
                <h2 style={{
                  fontSize: 42, fontWeight: 800, color: "#ffffff", lineHeight: 1.15,
                  marginBottom: 14, fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  A dedicated model for <span className="ds-callout">every asset class</span>.
                </h2>
                <p style={{ fontSize: 17, color: "#9ca3af", lineHeight: 1.7, maxWidth: 640, margin: "0 auto" }}>
                  A grocery-anchored center doesn&apos;t score the same way as a warehouse, an apartment building, or raw land.
                  Each asset type gets its own purpose-built model - so the signal you get is the signal that matters.
                </p>
              </div>

              {/* Asset tile grid - five purpose-built models with detailed line drawings */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 16,
              }} className="ds-asset-grid">
                {[
                  {
                    label: "Retail",
                    blurb: "Shopping centers, grocery-anchored, single-tenant NNN, QSR, mixed-use.",
                    weights: ["Tenant roster", "Rollover", "Anchor credit"],
                    /* Shopping center - canopy with 4 storefronts + signage + sidewalk */
                    draw: (
                      <>
                        <path d="M4 38 L46 38" />
                        <path d="M6 38 L6 20 L44 20 L44 38" />
                        <path d="M4 20 L46 20 L46 16 L4 16 Z" />
                        <path d="M12 38 L12 26 L18 26 L18 38" />
                        <path d="M21 38 L21 26 L27 26 L27 38" />
                        <path d="M30 38 L30 26 L36 26 L36 38" />
                        <path d="M8 24 L40 24" strokeDasharray="2 2" />
                        <circle cx="15" cy="32" r="0.8" fill="currentColor" />
                        <circle cx="24" cy="32" r="0.8" fill="currentColor" />
                        <circle cx="33" cy="32" r="0.8" fill="currentColor" />
                      </>
                    ),
                  },
                  {
                    label: "Industrial",
                    blurb: "Warehouse, distribution, flex, last-mile logistics.",
                    weights: ["Clear height", "Dock doors", "Tenant credit"],
                    /* Warehouse - big box + sawtooth roof + loading docks */
                    draw: (
                      <>
                        <path d="M4 38 L46 38" />
                        <path d="M6 38 L6 18" />
                        <path d="M44 38 L44 18" />
                        <path d="M6 18 L14 14 L14 18 L22 14 L22 18 L30 14 L30 18 L38 14 L38 18 L44 18" />
                        <path d="M10 38 L10 28 L16 28 L16 38" />
                        <path d="M19 38 L19 28 L25 28 L25 38" />
                        <path d="M28 38 L28 28 L34 28 L34 38" />
                        <path d="M37 38 L37 28 L41 28 L41 38" />
                        <path d="M10 33 L16 33" />
                        <path d="M19 33 L25 33" />
                        <path d="M28 33 L34 33" />
                      </>
                    ),
                  },
                  {
                    label: "Office",
                    blurb: "Multi-tenant office, medical office, suburban & urban CBD.",
                    weights: ["WALT", "Tenant credit", "TI/LC load"],
                    /* Office tower - tall building with window grid */
                    draw: (
                      <>
                        <path d="M4 38 L46 38" />
                        <path d="M10 38 L10 8 L40 8 L40 38" />
                        <path d="M10 12 L40 12" />
                        <path d="M13 12 L13 38" />
                        <path d="M18 12 L18 38" />
                        <path d="M23 12 L23 38" />
                        <path d="M28 12 L28 38" />
                        <path d="M33 12 L33 38" />
                        <path d="M37 12 L37 38" />
                        <path d="M10 18 L40 18" />
                        <path d="M10 24 L40 24" />
                        <path d="M10 30 L40 30" />
                        <path d="M22 30 L22 38 L28 38 L28 30" />
                      </>
                    ),
                  },
                  {
                    label: "Multifamily",
                    blurb: "Garden-style, mid-rise, high-rise, build-to-rent.",
                    weights: ["Rent growth", "OpEx", "Occupancy"],
                    /* Apartment - building with balconies + pitched roof */
                    draw: (
                      <>
                        <path d="M4 38 L46 38" />
                        <path d="M8 38 L8 14 L42 14 L42 38" />
                        <path d="M6 14 L25 6 L44 14" />
                        <path d="M12 18 L18 18 L18 22 L12 22 Z" />
                        <path d="M22 18 L28 18 L28 22 L22 22 Z" />
                        <path d="M32 18 L38 18 L38 22 L32 22 Z" />
                        <path d="M12 26 L18 26 L18 30 L12 30 Z" />
                        <path d="M22 26 L28 26 L28 30 L22 30 Z" />
                        <path d="M32 26 L38 26 L38 30 L32 30 Z" />
                        <path d="M22 32 L28 32 L28 38" />
                        <path d="M11 34 L19 34" />
                        <path d="M31 34 L39 34" />
                      </>
                    ),
                  },
                  {
                    label: "Land",
                    blurb: "Raw land, entitled parcels, development sites.",
                    weights: ["Entitlements", "Topography", "Utilities"],
                    /* Land - rolling hills + tree + survey stake */
                    draw: (
                      <>
                        <path d="M4 38 L46 38" />
                        <path d="M4 30 Q 14 22 24 30 T 46 30" />
                        <path d="M4 34 Q 16 28 28 34 T 46 34" />
                        <path d="M34 30 L34 18" />
                        <circle cx="34" cy="15" r="3.5" />
                        <path d="M34 15 L30 13" />
                        <path d="M34 15 L38 13" />
                        <path d="M12 30 L12 20" />
                        <path d="M10 22 L14 22 L10 18 L14 18 L10 14 L14 14" strokeWidth="1.2" />
                        <path d="M42 14 L42 22 L46 22 L46 14 Z" strokeDasharray="1.5 1.5" />
                        <path d="M44 14 L44 10" />
                      </>
                    ),
                  },
                ].map((a, i) => (
                  <div
                    key={a.label}
                    className="ds-asset-tile"
                    style={{
                      position: "relative",
                      display: "flex", flexDirection: "column", gap: 12,
                      padding: "22px 18px 20px",
                      background: "linear-gradient(180deg, rgba(22,26,35,0.65) 0%, rgba(14,14,22,0.8) 100%)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 16,
                      textAlign: "left",
                      transition: "all 0.25s ease",
                      cursor: "default",
                      animationDelay: `${i * 60}ms`,
                      overflow: "hidden",
                    }}
                  >
                    {/* Corner glow */}
                    <div style={{
                      position: "absolute", top: -30, right: -30, width: 110, height: 110,
                      background: "radial-gradient(circle, rgba(132,204,22,0.10) 0%, rgba(132,204,22,0) 70%)",
                      pointerEvents: "none",
                    }} />

                    {/* Line drawing illustration */}
                    <div style={{
                      position: "relative",
                      height: 96, borderRadius: 10,
                      background: "linear-gradient(180deg, rgba(132,204,22,0.05) 0%, rgba(132,204,22,0.00) 100%)",
                      border: "1px solid rgba(132,204,22,0.12)",
                      display: "flex", alignItems: "flex-end", justifyContent: "center",
                      padding: "10px 0 6px",
                    }}>
                      {/* Subtle grid lines */}
                      <div style={{
                        position: "absolute", inset: 0, borderRadius: 10,
                        backgroundImage: "linear-gradient(rgba(132,204,22,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(132,204,22,0.04) 1px, transparent 1px)",
                        backgroundSize: "10px 10px",
                        pointerEvents: "none",
                      }} />
                      <svg
                        viewBox="0 0 50 42"
                        width="100%"
                        height="100%"
                        fill="none"
                        stroke="#84CC16"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ position: "relative", maxWidth: 150 }}
                      >
                        {a.draw}
                      </svg>
                    </div>

                    {/* Label + tag */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: -0.2 }}>{a.label}</div>
                      <div style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase",
                        color: "#84CC16",
                        background: "rgba(132,204,22,0.10)",
                        padding: "3px 8px", borderRadius: 4,
                        border: "1px solid rgba(132,204,22,0.22)",
                      }}>Model</div>
                    </div>

                    {/* Blurb */}
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", lineHeight: 1.55, minHeight: 54 }}>
                      {a.blurb}
                    </div>

                    {/* Weights */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "auto" }}>
                      {a.weights.map(w => (
                        <span key={w} style={{
                          fontSize: 9.5, fontWeight: 700,
                          color: "rgba(255,255,255,0.75)",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          padding: "3px 7px", borderRadius: 20,
                        }}>{w}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer note */}
              <div style={{
                marginTop: 36, textAlign: "center",
                fontSize: 13, color: "rgba(255,255,255,0.45)",
              }}>
                We auto-detect the asset type from your OM and route it to the right model.
                <span style={{ color: "#84CC16", fontWeight: 600 }}> No extra clicks.</span>
              </div>
            </div>

            <style jsx>{`
              :global(.ds-asset-tile):hover {
                transform: translateY(-3px);
                border-color: rgba(132,204,22,0.32) !important;
                box-shadow: 0 12px 32px rgba(0,0,0,0.45), 0 0 40px rgba(132,204,22,0.08);
              }
              @media (max-width: 1000px) {
                :global(.ds-asset-grid) { grid-template-columns: repeat(3, 1fr) !important; }
              }
              @media (max-width: 700px) {
                :global(.ds-asset-grid) { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
              }
              @media (max-width: 420px) {
                :global(.ds-asset-grid) { grid-template-columns: 1fr !important; }
              }
            `}</style>
          </div>

          {/* ── 2. WHY DEALSIGNALS ── */}
          <div id="how-it-works" className="ds-section-pad" style={{ padding: "120px 32px 100px", background: "#0d0d14", position: "relative", overflow: "hidden" }}>
            {/* Subtle background depth */}
            <div style={{ position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)", width: 800, height: 800, borderRadius: "50%", background: "rgba(132,204,22,0.03)", filter: "blur(180px)", pointerEvents: "none" }} />

            <div style={{ maxWidth: 1000, margin: "0 auto", position: "relative", zIndex: 1 }}>

              {/* Section header */}
              <div style={{ textAlign: "center", marginBottom: 72 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", padding: "6px 16px",
                  borderRadius: 50, background: "rgba(132,204,22,0.06)", color: "#84CC16",
                  fontSize: 12, fontWeight: 700, marginBottom: 16, gap: 6,
                  letterSpacing: 0.5, textTransform: "uppercase" as const,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  How It Works
                </div>
                <h2 style={{ fontSize: 42, fontWeight: 800, color: "#ffffff", lineHeight: 1.15, marginBottom: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Stop reading OMs.<br />Start <span className="ds-callout">making decisions</span>.
                </h2>
                <p style={{ fontSize: 17, color: "#9ca3af", lineHeight: 1.7, maxWidth: 600, margin: "0 auto" }}>
                  You don&apos;t need another tool. You need a faster way to filter deals, get a second opinion, and focus your time on what actually pencils.
                </p>
              </div>

              {/* Three value prop cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 80 }} className="ds-why-grid">
                {[
                  {
                    icon: "M13 10V3L4 14h7v7l9-11h-7z",
                    headline: "Pre-diligence in 1 minute",
                    subline: "Not hours. Not days.",
                    body: "Every deal you touch gets scored, extracted, and summarized before you finish reading the first page of the OM. Know if it's worth pursuing in about a minute.",
                    stat: "~1 min",
                    statLabel: "avg. time to signal",
                  },
                  {
                    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                    headline: "A second opinion in minutes",
                    subline: "Built on real CRE logic.",
                    body: "DealSignals isn't guessing. It scores across 6 investment dimensions: pricing, cashflow, tenant quality, rollover risk, location, and upside. A standardized lens on every deal.",
                    stat: "6",
                    statLabel: "scoring dimensions",
                  },
                  {
                    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
                    headline: "Focus your time where it counts",
                    subline: "Filter. Compare. Decide.",
                    body: "Stop spending hours on deals that don't pencil. Upload your pipeline, score everything, and put your energy into the deals that actually matter.",
                    stat: "100+",
                    statLabel: "deals / month on Pro",
                  },
                ].map((card, i) => (
                  <ScrollReveal key={card.headline} delay={0.1 + i * 0.15}>
                    <div style={{
                      background: "rgba(22,26,35,0.6)", borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.06)", padding: "36px 28px",
                      position: "relative", overflow: "hidden",
                    }}>
                      {/* Glow accent */}
                      <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: "rgba(132,204,22,0.04)", filter: "blur(40px)", pointerEvents: "none" }} />

                      {/* Icon */}
                      <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: "rgba(132,204,22,0.08)", border: "1px solid rgba(132,204,22,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
                      }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={card.icon} /></svg>
                      </div>

                      {/* Stat callout */}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
                        <span style={{ fontSize: 32, fontWeight: 800, color: "#84CC16", lineHeight: 1, letterSpacing: -1 }}>{card.stat}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(132,204,22,0.6)" }}>{card.statLabel}</span>
                      </div>

                      {/* Copy */}
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", marginBottom: 4, lineHeight: 1.3 }}>{card.headline}</h3>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#84CC16", marginBottom: 12 }}>{card.subline}</p>
                      <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{card.body}</p>
                    </div>
                  </ScrollReveal>
                ))}
              </div>


            </div>
          </div>

          {/* testimonials section removed */}

          {/* ── 6. FEATURES - PRODUCT STORY ── */}
          <div id="features" className="ds-section-pad" style={{ padding: "120px 32px 80px", background: "#0d0d14", position: "relative", overflow: "hidden" }}>
            {/* Background depth */}
            <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: "rgba(132,204,22,0.05)", filter: "blur(160px)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -150, left: -100, width: 500, height: 500, borderRadius: "50%", background: "rgba(132,204,22,0.03)", filter: "blur(140px)", pointerEvents: "none" }} />
            {/* Subtle city skyline silhouette at bottom */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 220, pointerEvents: "none", opacity: 0.04 }}>
              <svg width="100%" height="100%" viewBox="0 0 1200 220" preserveAspectRatio="none" fill="#84CC16">
                <path d="M0 220 V180 H30 V140 H50 V180 H70 V120 H80 V100 H90 V120 H110 V160 H130 V130 H140 V90 H150 V60 H160 V90 H170 V130 H190 V180 H220 V150 H240 V110 H250 V80 H260 V50 H270 V80 H280 V110 H300 V160 H330 V180 H360 V140 H370 V100 H380 V70 H390 V40 H400 V70 H410 V100 H420 V140 H450 V170 H480 V130 H500 V90 H510 V60 H520 V30 H530 V60 H540 V90 H560 V150 H590 V180 H620 V140 H640 V100 H650 V70 H660 V100 H670 V140 H700 V170 H730 V120 H750 V80 H760 V50 H770 V80 H780 V120 H810 V160 H840 V130 H860 V90 H870 V55 H880 V90 H890 V130 H920 V170 H950 V140 H970 V100 H980 V70 H990 V45 H1000 V70 H1010 V100 H1030 V150 H1060 V180 H1090 V140 H1110 V110 H1120 V80 H1130 V110 H1140 V140 H1170 V180 H1200 V220 Z" />
              </svg>
            </div>

            <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 1 }}>

              {/* Section header */}
              <div style={{ textAlign: "center", marginBottom: 64 }}>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 16px", borderRadius: 50, background: "rgba(132,204,22,0.06)", color: "#84CC16", fontSize: 12, fontWeight: 700, marginBottom: 16, gap: 6, letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  Quick Analysis
                </div>
                <h2 style={{ fontSize: 42, fontWeight: 800, color: "#ffffff", lineHeight: 1.15, marginBottom: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Size up a deal in <span className="ds-callout">60 seconds</span>.
                </h2>
                <p style={{ fontSize: 17, color: "#9ca3af", lineHeight: 1.7, maxWidth: 580, margin: "0 auto" }}>
                  Upload an OM. Get scoring and a decision-ready view.
                </p>
              </div>

              {/* ── Feature blocks: alternating left/right ── */}
              {[
                {
                  num: "01", title: "Extract 40+ Fields", desc: "Drop an OM, flyer, rent roll, or broker package. 40+ structured fields come back: price, NOI, cap rate, tenants, lease terms, and more.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, padding: "24px 28px", border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                      {/* Scan line animation overlay */}
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, #84CC16, transparent)", animation: "scanDown 2.5s ease-in-out both", zIndex: 2 }} />

                      {/* File header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, animation: "fadeInUp 0.3s ease-out 0s both" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Walgreens_OM_2026.pdf</div>
                          <div style={{ fontSize: 9, color: "#6b7280" }}>2.4 MB · Processing...</div>
                        </div>
                        <div style={{ padding: "4px 10px", borderRadius: 50, background: "rgba(132,204,22,0.1)", border: "1px solid rgba(132,204,22,0.2)" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#84CC16", animation: "pulse 1.5s ease-in-out both" }}>EXTRACTING</span>
                        </div>
                      </div>

                      {/* Divider with progress */}
                      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0 14px", position: "relative" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "100%", background: "linear-gradient(90deg, #84CC16, rgba(132,204,22,0.3))", animation: "progressFill 2s ease-out forwards" }} />
                      </div>

                      {/* Animated fields dropping in */}
                      {[
                        { label: "Property Name", value: "Walgreens NNN - Cedar Park", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", delay: "0.1s" },
                        { label: "Purchase Price", value: "$7,050,000", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", delay: "0.25s" },
                        { label: "Cap Rate", value: "5.85%", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", delay: "0.4s" },
                        { label: "Net Operating Income", value: "$412,425", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6", delay: "0.55s" },
                        { label: "Tenant", value: "Walgreens Co. (Investment Grade)", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", delay: "0.7s" },
                        { label: "Lease Expiry", value: "Nov 2038 (12.6 yrs remaining)", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", delay: "0.85s" },
                        { label: "Building Size", value: "14,820 SF", icon: "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4", delay: "1.0s" },
                      ].map(f => (
                        <div key={f.label} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 4,
                          borderRadius: 8, background: "rgba(255,255,255,0.02)",
                          animation: `fadeInUp 0.35s ease-out ${f.delay} both`,
                          border: "1px solid rgba(255,255,255,0.03)",
                        }}>
                          <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(132,204,22,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 600, marginBottom: 1 }}>{f.label}</div>
                            <div style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{f.value}</div>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5" style={{ flexShrink: 0, opacity: 0.6 }}><polyline points="20 6 9 17 4 12" /></svg>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: "#84CC16", fontWeight: 600, animation: "fadeInUp 0.3s ease-out 1.2s both" }}>40+ fields extracted in 8 seconds</div>
                    </div>
                  ),
                },
                {
                  num: "02", title: "Get a Buy/Pass Signal", desc: "An instant verdict, not just a score - green flags, yellow flags, and red flags called out so you know exactly what's driving the call.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, padding: "28px", border: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                      {/* Subtle glow behind score */}
                      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 200, height: 200, borderRadius: "50%", background: "rgba(132,204,22,0.08)", filter: "blur(60px)", pointerEvents: "none" }} />

                      {/* Score ring with animated pulse */}
                      <div style={{ position: "relative", zIndex: 1, textAlign: "center", marginBottom: 20 }}>
                        <div style={{ position: "relative", display: "inline-block" }}>
                          <div style={{ width: 96, height: 96, borderRadius: "50%", border: "4px solid #84CC16", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(132,204,22,0.2), inset 0 0 20px rgba(132,204,22,0.05)", animation: "pulse 2.5s ease-in-out both" }}>
                            <div>
                              <span style={{ fontSize: 36, fontWeight: 800, color: "#84CC16", lineHeight: 1 }}>74</span>
                              <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(132,204,22,0.6)", letterSpacing: 1, marginTop: 2 }}>/ 100</div>
                            </div>
                          </div>
                          {/* BUY badge */}
                          <div style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", padding: "3px 14px", borderRadius: 50, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 800, letterSpacing: 1, whiteSpace: "nowrap" as const }}>BUY SIGNAL</div>
                        </div>
                      </div>

                      {/* Animated callout cards */}
                      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 28 }}>
                        {[
                          { icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z", label: "Strong Location", detail: "High-traffic retail corridor", color: "#84CC16", delay: "0.2s" },
                          { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "Investment Grade Tenant", detail: "Walgreens (S&P: BBB)", color: "#84CC16", delay: "0.4s" },
                          { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", label: "Below Market Rents", detail: "12% upside at renewal", color: "#D97706", delay: "0.6s" },
                          { icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", label: "Rollover Risk", detail: "Lease expires in 18 months", color: "#ef4444", delay: "0.8s" },
                          { icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6", label: "Moderate DSCR", detail: "1.42x - meets threshold", color: "#D97706", delay: "1.0s" },
                        ].map(c => (
                          <div key={c.label} style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                            borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${c.color}20`,
                            animation: `fadeInUp 0.4s ease-out ${c.delay} both`,
                          }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${c.color}12`, border: `1px solid ${c.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{c.label}</div>
                              <div style={{ fontSize: 10, color: "#6b7280" }}>{c.detail}</div>
                            </div>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0, boxShadow: `0 0 8px ${c.color}40` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                },
                {
                  num: "03", title: "Rank and Decide", desc: "One leaderboard for your whole pipeline - deals ranked 0–100 so you always know which ones deserve your next hour.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Scoreboard header */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 0.8 }}>Deal Scoreboard</span>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>Sorted by Score ↓</span>
                      </div>
                      {/* Column headers */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 54px 54px 54px", padding: "8px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Property</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.5, textAlign: "center" }}>Score</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.5, textAlign: "center" }}>Signal</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.5, textAlign: "center" }}>Cap</span>
                      </div>
                      {/* Animated rows */}
                      {[
                        { name: "Walgreens NNN", loc: "Cedar Park, TX", score: 74, signal: "BUY", signalColor: "#84CC16", cap: "5.85%", delay: "0.15s" },
                        { name: "CVS Pharmacy", loc: "Plano, TX", score: 71, signal: "BUY", signalColor: "#84CC16", cap: "5.40%", delay: "0.3s" },
                        { name: "Autozone NNN", loc: "Round Rock, TX", score: 68, signal: "HOLD", signalColor: "#D97706", cap: "6.25%", delay: "0.45s" },
                        { name: "Dollar General", loc: "Lawrenceville, GA", score: 61, signal: "HOLD", signalColor: "#eab308", cap: "6.50%", delay: "0.6s" },
                        { name: "O'Reilly Auto NNN", loc: "Pflugerville, TX", score: 48, signal: "PASS", signalColor: "#ef4444", cap: "7.80%", delay: "0.75s" },
                      ].map((row, i) => (
                        <div key={row.name} style={{
                          display: "grid", gridTemplateColumns: "1fr 54px 54px 54px", padding: "10px 20px", alignItems: "center",
                          borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none",
                          animation: `fadeInUp 0.35s ease-out ${row.delay} both`,
                          background: i === 0 ? "rgba(132,204,22,0.03)" : "transparent",
                        }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{row.name}</div>
                            <div style={{ fontSize: 9, color: "#6b7280" }}>{row.loc}</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: row.signalColor }}>{row.score}</span>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 50, background: `${row.signalColor}14`, color: row.signalColor, border: `1px solid ${row.signalColor}30` }}>{row.signal}</span>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>{row.cap}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  num: "04", title: "Export to Excel", desc: "A ready-to-edit underwriting model, not a static PDF - six sheets covering inputs, rent roll, operating statement, debt, breakeven, and cap scenarios.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Excel tab bar */}
                      <div style={{ display: "flex", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 8px" }}>
                        {["Summary", "Rent Roll", "Operating", "Debt & Returns", "Breakeven", "Cap Scenarios"].map((tab, i) => (
                          <span key={tab} style={{ fontSize: 9, fontWeight: i === 0 ? 700 : 500, padding: "8px 12px", color: i === 0 ? "#84CC16" : "#6b7280", borderBottom: i === 0 ? "2px solid #84CC16" : "2px solid transparent", background: i === 0 ? "rgba(132,204,22,0.04)" : "transparent" }}>{tab}</span>
                        ))}
                      </div>

                      {/* Live spreadsheet area */}
                      <div style={{ padding: "16px 20px" }}>
                        {/* Price input with "editable" highlight */}
                        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(132,204,22,0.25)", background: "rgba(132,204,22,0.03)", animation: "fadeInUp 0.3s ease-out 0.1s both" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#84CC16" }}>Purchase Price</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>$7,050,000</span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </div>
                          </div>
                        </div>

                        {/* Calculated fields that react */}
                        {[
                          { label: "Cap Rate (Going-In)", value: "5.85%", sub: "= NOI / Price", delay: "0.25s" },
                          { label: "Net Operating Income", value: "$412,425", sub: "= Gross Revenue - OpEx", delay: "0.4s" },
                          { label: "Cash-on-Cash Return", value: "7.92%", sub: "= Annual CF / Equity", delay: "0.55s" },
                          { label: "DSCR", value: "1.42x", sub: "= NOI / Debt Service", delay: "0.7s" },
                          { label: "IRR (5-Year Hold)", value: "11.4%", sub: "= Projected internal rate", delay: "0.85s" },
                        ].map(r => (
                          <div key={r.label} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)",
                            animation: `fadeInUp 0.3s ease-out ${r.delay} both`,
                          }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af" }}>{r.label}</div>
                              <div style={{ fontSize: 8, color: "#4a5568", fontFamily: "monospace" }}>{r.sub}</div>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>{r.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Download bar */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
                        <div style={{ padding: "6px 16px", borderRadius: 8, background: "#84CC16", color: "#0d0d14", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          Download .xlsx
                        </div>
                        <span style={{ fontSize: 10, color: "#6b7280" }}>6 sheets · 58 rows · 14 formulas</span>
                      </div>
                    </div>
                  ),
                },
                {
                  num: "05", title: "Organize Your Pipeline", desc: "One home for your entire book - group by asset class, client, or strategy instead of digging through email threads and Downloads folders.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Asset type tabs */}
                      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
                        {[
                          { label: "Retail NNN", count: 4, active: true },
                          { label: "Multifamily", count: 2, active: false },
                          { label: "Industrial", count: 3, active: false },
                          { label: "Office", count: 1, active: false },
                        ].map(tab => (
                          <div key={tab.label} style={{
                            padding: "10px 14px", fontSize: 10, fontWeight: tab.active ? 700 : 500,
                            color: tab.active ? "#84CC16" : "#6b7280",
                            borderBottom: tab.active ? "2px solid #84CC16" : "2px solid transparent",
                            background: tab.active ? "rgba(132,204,22,0.04)" : "transparent",
                            display: "flex", alignItems: "center", gap: 5,
                          }}>
                            {tab.label}
                            <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 50, background: tab.active ? "rgba(132,204,22,0.15)" : "rgba(255,255,255,0.06)", color: tab.active ? "#84CC16" : "#6b7280" }}>{tab.count}</span>
                          </div>
                        ))}
                      </div>

                      {/* Retail NNN deals list */}
                      <div style={{ padding: "12px 16px" }}>
                        {[
                          { name: "Walgreens NNN", loc: "Cedar Park, TX", price: "$7.05M", cap: "5.85%", score: 74, color: "#84CC16", delay: "0.15s" },
                          { name: "CVS Pharmacy", loc: "Plano, TX", price: "$5.2M", cap: "5.40%", score: 71, color: "#84CC16", delay: "0.3s" },
                          { name: "Dollar General", loc: "Lawrenceville, GA", price: "$2.8M", cap: "6.50%", score: 61, color: "#eab308", delay: "0.45s" },
                          { name: "7-Eleven NNN", loc: "Frisco, TX", price: "$3.1M", cap: "5.95%", score: 58, color: "#D97706", delay: "0.6s" },
                        ].map((d, i) => (
                          <div key={d.name} style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginBottom: 4,
                            borderRadius: 8, background: i === 0 ? "rgba(132,204,22,0.03)" : "rgba(255,255,255,0.01)",
                            border: i === 0 ? "1px solid rgba(132,204,22,0.12)" : "1px solid rgba(255,255,255,0.03)",
                            animation: `fadeInUp 0.3s ease-out ${d.delay} both`,
                          }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${d.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: d.color, flexShrink: 0 }}>{d.score}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{d.name}</div>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>{d.loc}</div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{d.price}</div>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>{d.cap} cap</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Bottom stats */}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.01)" }}>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>4 deals · Avg score: 66</span>
                        <span style={{ fontSize: 9, color: "#84CC16", fontWeight: 600 }}>+ Upload New Deal</span>
                      </div>
                    </div>
                  ),
                },
                {
                  num: "06", title: "Compare Side-by-Side", desc: "Two or three deals, one head-to-head table - the gaps on DSCR, NOI, and downside risk jump out in seconds.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Header with asset type */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 0.8 }}>Retail NNN Comparison</span>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>3 deals</span>
                      </div>

                      {/* ── Desktop: 4-column comparison table ── */}
                      <div className="ds-compare-table" style={{ padding: "12px 18px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr", gap: 0, fontSize: 10 }}>
                          <div style={{ padding: "8px 0", fontWeight: 600, color: "#6b7280" }}>Metric</div>
                          <div style={{ padding: "8px 4px", fontWeight: 700, color: "#fff", textAlign: "center" }}>Walgreens</div>
                          <div style={{ padding: "8px 4px", fontWeight: 700, color: "#fff", textAlign: "center" }}>CVS</div>
                          <div style={{ padding: "8px 4px", fontWeight: 700, color: "#fff", textAlign: "center" }}>Dollar Gen.</div>
                          {[
                            { m: "Score", v: ["74", "71", "61"], c: ["#84CC16", "#84CC16", "#eab308"] },
                            { m: "Price", v: ["$7.05M", "$5.2M", "$2.8M"], c: ["#fff", "#fff", "#fff"] },
                            { m: "Cap Rate", v: ["5.85%", "5.40%", "6.50%"], c: ["#fff", "#fff", "#fff"] },
                            { m: "NOI", v: ["$412K", "$281K", "$182K"], c: ["#fff", "#fff", "#fff"] },
                            { m: "DSCR", v: ["1.42x", "1.38x", "1.08x"], c: ["#84CC16", "#84CC16", "#ef4444"] },
                            { m: "Signal", v: ["BUY", "BUY", "HOLD"], c: ["#84CC16", "#84CC16", "#eab308"] },
                          ].map((row, ri) => (
                            <React.Fragment key={row.m}>
                              <div style={{ padding: "7px 0", fontWeight: 600, color: "#6b7280", borderTop: "1px solid rgba(255,255,255,0.04)", animation: `fadeInUp 0.25s ease-out ${0.1 + ri * 0.08}s both` }}>{row.m}</div>
                              {row.v.map((v, i) => (
                                <div key={i} style={{ padding: "7px 4px", fontWeight: 700, color: row.c[i], textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.04)", animation: `fadeInUp 0.25s ease-out ${0.1 + ri * 0.08}s both` }}>{v}</div>
                              ))}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      {/* ── Mobile: stacked deal cards ── */}
                      <div className="ds-compare-cards" style={{ display: "none", flexDirection: "column", gap: 8, padding: "12px 14px" }}>
                        {[
                          { name: "Walgreens NNN", score: 74, signal: "BUY", signalColor: "#84CC16", price: "$7.05M", cap: "5.85%", noi: "$412K", dscr: "1.42x", dscrColor: "#84CC16", winner: true, delay: "0.1s" },
                          { name: "CVS Pharmacy", score: 71, signal: "BUY", signalColor: "#84CC16", price: "$5.2M", cap: "5.40%", noi: "$281K", dscr: "1.38x", dscrColor: "#84CC16", winner: false, delay: "0.25s" },
                          { name: "Dollar General", score: 61, signal: "HOLD", signalColor: "#eab308", price: "$2.8M", cap: "6.50%", noi: "$182K", dscr: "1.08x", dscrColor: "#ef4444", winner: false, delay: "0.4s" },
                        ].map(deal => (
                          <div key={deal.name} style={{
                            background: deal.winner ? "rgba(132,204,22,0.06)" : "rgba(255,255,255,0.02)",
                            border: deal.winner ? "1px solid rgba(132,204,22,0.25)" : "1px solid rgba(255,255,255,0.04)",
                            borderRadius: 10, padding: "10px 12px",
                            animation: `fadeInUp 0.3s ease-out ${deal.delay} both`,
                          }}>
                            {/* Deal header - name + score + signal */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {deal.winner && <span style={{ fontSize: 12 }}>👑</span>}
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{deal.name}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 16, fontWeight: 800, color: deal.signalColor }}>{deal.score}</span>
                                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 50, background: `${deal.signalColor}18`, color: deal.signalColor, border: `1px solid ${deal.signalColor}30` }}>{deal.signal}</span>
                              </div>
                            </div>
                            {/* Metrics row */}
                            <div style={{ display: "flex", gap: 0, justifyContent: "space-between" }}>
                              {[
                                { label: "Price", value: deal.price, color: "#fff" },
                                { label: "Cap", value: deal.cap, color: "#fff" },
                                { label: "NOI", value: deal.noi, color: "#fff" },
                                { label: "DSCR", value: deal.dscr, color: deal.dscrColor },
                              ].map(m => (
                                <div key={m.label} style={{ textAlign: "center", flex: 1 }}>
                                  <div style={{ fontSize: 8, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: 0.3 }}>{m.label}</div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Winner callout */}
                      <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(132,204,22,0.03)", display: "flex", alignItems: "center", gap: 8, animation: "fadeInUp 0.3s ease-out 0.7s both" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#84CC16" }}>Walgreens NNN leads on 5 of 6 metrics</span>
                      </div>
                    </div>
                  ),
                },
                {
                  num: "07", title: "Map Your Deals", desc: "See your pipeline on a map - click any pin for the full scorecard and spot submarket concentration or geographic gaps at a glance.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Map area - dark themed street map */}
                      <div style={{ height: 220, background: "#141B2D", position: "relative", overflow: "hidden" }}>
                        {/* SVG street map background */}
                        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice">
                          {/* City blocks */}
                          <rect x="20" y="15" width="85" height="55" rx="3" fill="#1a2236" />
                          <rect x="120" y="15" width="110" height="55" rx="3" fill="#1a2236" />
                          <rect x="245" y="15" width="70" height="55" rx="3" fill="#1a2236" />
                          <rect x="330" y="15" width="130" height="55" rx="3" fill="#1c2538" />
                          <rect x="20" y="85" width="85" height="60" rx="3" fill="#1c2538" />
                          <rect x="120" y="85" width="50" height="60" rx="3" fill="#1a2236" />
                          <rect x="185" y="85" width="45" height="60" rx="3" fill="#192133" />
                          <rect x="245" y="85" width="70" height="60" rx="3" fill="#1a2236" />
                          <rect x="330" y="85" width="60" height="60" rx="3" fill="#1a2236" />
                          <rect x="405" y="85" width="55" height="60" rx="3" fill="#1c2538" />
                          <rect x="20" y="160" width="150" height="50" rx="3" fill="#1c2538" />
                          <rect x="185" y="160" width="45" height="50" rx="3" fill="#1a2236" />
                          <rect x="245" y="160" width="130" height="50" rx="3" fill="#192133" />
                          <rect x="390" y="160" width="70" height="50" rx="3" fill="#1a2236" />
                          {/* Major roads */}
                          <line x1="0" y1="80" x2="480" y2="80" stroke="#232d42" strokeWidth="5" />
                          <line x1="0" y1="155" x2="480" y2="155" stroke="#232d42" strokeWidth="5" />
                          <line x1="115" y1="0" x2="115" y2="220" stroke="#232d42" strokeWidth="5" />
                          <line x1="240" y1="0" x2="240" y2="220" stroke="#232d42" strokeWidth="4" />
                          <line x1="325" y1="0" x2="325" y2="220" stroke="#232d42" strokeWidth="4" />
                          {/* Minor roads */}
                          <line x1="180" y1="80" x2="180" y2="220" stroke="#1e2840" strokeWidth="3" />
                          <line x1="395" y1="80" x2="395" y2="220" stroke="#1e2840" strokeWidth="3" />
                          {/* Water feature - small pond/lake */}
                          <ellipse cx="420" cy="38" rx="35" ry="22" fill="#15253d" stroke="#1a3050" strokeWidth="1" />
                          {/* Park/green area */}
                          <rect x="130" y="92" width="35" height="18" rx="9" fill="#1a2e1f" opacity="0.6" />
                          {/* Road center lines */}
                          <line x1="0" y1="80" x2="480" y2="80" stroke="#2a3550" strokeWidth="0.5" strokeDasharray="6 4" />
                          <line x1="0" y1="155" x2="480" y2="155" stroke="#2a3550" strokeWidth="0.5" strokeDasharray="6 4" />
                        </svg>
                        {/* Subtle vignette overlay */}
                        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 50%, rgba(14,17,27,0.5) 100%)" }} />

                        {/* Animated pins dropping in */}
                        {[
                          { left: "25%", top: "30%", score: 74, name: "Walgreens", color: "#84CC16", delay: "0.2s", active: true },
                          { left: "52%", top: "58%", score: 71, name: "CVS", color: "#84CC16", delay: "0.5s", active: false },
                          { left: "70%", top: "35%", score: 61, name: "Dollar Gen.", color: "#eab308", delay: "0.8s", active: false },
                          { left: "38%", top: "72%", score: 58, name: "7-Eleven", color: "#D97706", delay: "1.1s", active: false },
                        ].map((pin, i) => (
                          <div key={i} style={{ position: "absolute", left: pin.left, top: pin.top, transform: "translate(-50%, -50%)", animation: `fadeInUp 0.4s ease-out ${pin.delay} both`, zIndex: pin.active ? 3 : 1 }}>
                            {/* Pulse ring for active */}
                            {pin.active && <div style={{ position: "absolute", inset: -8, borderRadius: "50%", border: "1px solid rgba(132,204,22,0.3)", animation: "pulse 2s ease-in-out both" }} />}
                            <div style={{ width: pin.active ? 30 : 24, height: pin.active ? 30 : 24, borderRadius: "50%", background: pin.active ? pin.color : `${pin.color}60`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: pin.active ? "#0d0d14" : "#fff", boxShadow: `0 0 ${pin.active ? 20 : 8}px ${pin.color}40` }}>{pin.score}</div>

                            {/* Hover tooltip for active pin */}
                            {pin.active && (
                              <div style={{ position: "absolute", top: -56, left: "50%", transform: "translateX(-50%)", padding: "8px 12px", borderRadius: 8, background: "#1a1a2e", border: "1px solid rgba(132,204,22,0.2)", whiteSpace: "nowrap" as const, animation: "fadeInUp 0.3s ease-out 0.6s both", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>Walgreens NNN</div>
                                <div style={{ fontSize: 9, color: "#6b7280" }}>$7.05M · 5.85% cap · Score: 74</div>
                                <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 8, height: 8, background: "#1a1a2e", borderRight: "1px solid rgba(132,204,22,0.2)", borderBottom: "1px solid rgba(132,204,22,0.2)" }} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Share bar */}
                      <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.01)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#84CC16" }}>Share Map with Client</span>
                        </div>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>4 pins · Retail NNN Board</span>
                      </div>
                    </div>
                  ),
                },
                {
                  num: "08", title: "Share with Clients", desc: "A branded, password-protected link you can send to anyone - read-only, with optional expiration and no account required on their end.",
                  visual: (
                    <div style={{ background: "rgba(22,26,35,0.8)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      {/* Share link generation */}
                      <div style={{ padding: "20px 24px", animation: "fadeInUp 0.3s ease-out 0.1s both" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Private Share Link</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                            <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>dealsignals.app/s/NRC7wA...</span>
                          </div>
                          <div style={{ padding: "10px 16px", borderRadius: 8, background: "#84CC16", color: "#0d0d14", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" as const, animation: "fadeInUp 0.3s ease-out 0.3s both" }}>Copy</div>
                        </div>

                        {/* Access control */}
                        <div style={{ display: "flex", gap: 8, marginBottom: 16, animation: "fadeInUp 0.3s ease-out 0.4s both" }}>
                          {[
                            { icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", label: "Password protected", active: true },
                            { icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "Expires in 7 days", active: true },
                          ].map(opt => (
                            <div key={opt.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.12)" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={opt.icon} /></svg>
                              <span style={{ fontSize: 9, fontWeight: 600, color: "#84CC16" }}>{opt.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Client preview card */}
                      <div style={{ margin: "0 20px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", animation: "fadeInUp 0.4s ease-out 0.6s both" }}>
                        <div style={{ padding: "4px 12px", background: "rgba(132,204,22,0.06)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>Client Preview</span>
                        </div>
                        <div style={{ padding: "14px 14px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Walgreens NNN - Cedar Park, TX</div>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>Retail NNN · 14,820 SF · $7.05M</div>
                            </div>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #84CC16", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#84CC16" }}>74</div>
                          </div>
                          <div style={{ display: "flex", gap: 12 }}>
                            {[{ l: "Cap", v: "5.85%" }, { l: "NOI", v: "$412K" }, { l: "DSCR", v: "1.42x" }].map(m => (
                              <div key={m.l}>
                                <div style={{ fontSize: 8, color: "#6b7280" }}>{m.l}</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                },
              ].map((feature, idx) => (
                <FeatureBlock key={feature.num} idx={idx}>
                  <div style={{
                    padding: idx === 0 ? "0 0 96px" : "96px 0",
                    borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}>
                    <div className="ds-feature-block" style={{
                      display: "flex", gap: 64, alignItems: "center",
                      flexDirection: idx % 2 === 1 ? "row-reverse" as const : "row" as const,
                    }}>
                      {/* Text side */}
                      <div style={{ flex: 1 }}>
                        {/* Bright number circle */}
                        <div style={{
                          width: 44, height: 44, borderRadius: "50%",
                          background: "#84CC16", color: "#0d0d14",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 800, marginBottom: 16,
                          boxShadow: "0 4px 16px rgba(132,204,22,0.25)",
                        }}>
                          {parseInt(feature.num)}
                        </div>

                        {/* Step label */}
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: "rgba(132,204,22,0.85)",
                          textTransform: "uppercase" as const, letterSpacing: 0.7,
                          marginBottom: 12,
                        }}>
                          Step {parseInt(feature.num)}
                        </div>

                        {/* Title */}
                        <h3 style={{
                          fontSize: 30, fontWeight: 800, color: "#ffffff",
                          marginBottom: 12, lineHeight: 1.25,
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}>
                          {feature.title}
                        </h3>

                        {/* Description */}
                        <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.7, margin: 0, maxWidth: 460 }}>
                          {feature.desc}
                        </p>
                      </div>

                      {/* Visual side - wrapped in mockup frame so buttons look illustrative */}
                      <div style={{ flex: 1, maxWidth: 480, pointerEvents: "none", userSelect: "none", cursor: "default" }}>
                        {/* Mock browser chrome */}
                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "7px 14px", borderRadius: "12px 12px 0 0",
                          background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.06)",
                          borderLeft: "1px solid rgba(255,255,255,0.06)", borderRight: "1px solid rgba(255,255,255,0.06)",
                        }}>
                          <div style={{ display: "flex", gap: 5 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.10)" }} />
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.10)" }} />
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.10)" }} />
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: 0.5, textTransform: "uppercase" as const }}>Preview</span>
                        </div>
                        {/* Visual content with top-left radius removed to blend with chrome bar */}
                        <div style={{ borderRadius: "0 0 12px 12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", borderTop: "none" }}>
                          {feature.visual}
                        </div>
                      </div>
                    </div>
                  </div>
                </FeatureBlock>
              ))}

              {/* ── Secondary features row ── */}
              <div style={{ marginTop: 100, padding: "40px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="ds-secondary-features" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
                  {[
                    { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12", label: "Bulk Portfolio Uploads" },
                    { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Up to 100 Deals / Month with Pro" },
                    { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", label: "White-Label Sharing (hide DealSignals brand)" },
                    { icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "Deal History Tracking" },
                  ].map(f => (
                    <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* ── 8. PRICING ── */}
          <div id="pricing" className="ds-section-pad" style={{ maxWidth: 1000, margin: "0 auto", padding: "120px 32px 80px", position: "relative", overflow: "visible" }}>
            {/* Section divider */}
            <div className="ds-section-divider" style={{
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 50%, transparent)",
              maxWidth: 600,
              margin: "-100px auto 60px",
            }} />
            {/* Gradient orb for pricing */}
            <div style={{ position: "absolute", top: -200, right: -100, width: 500, height: 500, borderRadius: "50%", background: "rgba(132,204,22,0.1)", filter: "blur(128px)", pointerEvents: "none", zIndex: 0 }} />
            <div style={{ textAlign: "center", marginBottom: 56, position: "relative", zIndex: 1 }}>
              <h2 style={{ fontSize: 34, fontWeight: 800, color: "#ffffff", marginBottom: 10 }}>
                Start free. Scale as your deal flow grows.
              </h2>
              <p style={{ fontSize: 14, color: "#5A7091", lineHeight: 1.7, maxWidth: 500, margin: "0 auto" }}>
                DealSignals turns deals and OMs into actionable investment insight, powering faster pre-diligence decisions.
              </p>
            </div>

            {/* 3-tier pricing grid */}
            <div className="ds-pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 60 }}>
              {[
                {
                  name: "Free",
                  price: "0",
                  period: "",
                  desc: "Try DealSignals on real deals.",
                  features: [
                    { text: "5 deal analyses (total)", included: true },
                    { text: "Save deals to workspace", included: true },
                    { text: "Deal Signals scoring", included: true },
                    { text: "Downloadable XLS worksheets of analysis", included: true },
                    { text: "First-pass brief download", included: true },
                    { text: "Interactive property map", included: false },
                    { text: "Deal comparison scoreboard", included: false },
                    { text: "Location Intelligence", included: false },
                  ],
                  cta: "Sign Up Free",
                  ctaLink: "/workspace/login?source=pricing",
                  highlight: false,
                },
                {
                  name: "Pro",
                  price: "40",
                  period: "/mo",
                  desc: "For active investors moving fast on deals.",
                  valueCallout: "7-day free trial · Less than 50¢ per deal",
                  features: [
                    { text: "100 deal analyses/month", included: true },
                    { text: "Bulk portfolio uploads", included: true },
                    { text: "Save deals to workspace", included: true },
                    { text: "Deal Signals scoring", included: true },
                    { text: "Downloadable XLS worksheets of analysis", included: true },
                    { text: "First-pass brief download", included: true },
                    { text: "Pro DealBoard with history", included: true },
                    { text: "Interactive property map", included: true },
                    { text: "Deal comparison scoreboard", included: true },
                    { text: "Location Intelligence", included: true },
                    { text: "White-label shareable links", included: true },
                  ],
                  cta: "Start 7-Day Free Trial",
                  ctaLink: "/workspace/login?upgrade=pro",
                  highlight: true,
                },
                {
                  name: "Pro+",
                  price: "100",
                  period: "/mo",
                  desc: "For high-volume deal flow and serious operators.",
                  valueCallout: "7-day free trial · 20¢ per deal",
                  features: [
                    { text: "500 deal analyses/month", included: true },
                    { text: "Everything in Pro", included: true },
                    { text: "Chrome extension: add deals right from Crexi, CoStar, and LoopNet", included: true },
                    { text: "Priority processing queue", included: true },
                    { text: "Priority support", included: true },
                    { text: "Custom branding", included: true },
                  ],
                  cta: "Start 7-Day Free Trial",
                  ctaLink: "/workspace/login?upgrade=pro_plus",
                  highlight: false,
                  bestValue: true,
                },
              ].map(tier => (
                <div key={tier.name} style={{
                  background: "rgba(22,22,31,0.6)", backdropFilter: "blur(10px)",
                  borderRadius: 16, border: tier.highlight ? "1px solid rgba(132,204,22,0.4)" : "1px solid rgba(255,255,255,0.06)",
                  padding: "36px 28px", position: "relative", overflow: "hidden",
                  transition: "all 0.25s ease",
                  boxShadow: tier.highlight ? "0 0 40px rgba(132,204,22,0.1)" : "none",
                }}>
                  {tier.highlight && (
                    <div style={{ position: "absolute", top: 0, right: 0, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                      Most Popular
                    </div>
                  )}
                  {(tier as any).bestValue && (
                    <div style={{ position: "absolute", top: 0, right: 0, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                      Best Value
                    </div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: tier.highlight ? "#84CC16" : "#9ca3af", marginBottom: 10 }}>
                    {tier.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>$</span>
                    <span style={{ fontSize: 40, fontWeight: 800, color: "#ffffff", letterSpacing: -1 }}>{tier.price}</span>
                    {tier.period && <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{tier.period}</span>}
                  </div>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: (tier as any).valueCallout ? 10 : 28, lineHeight: 1.5 }}>{tier.desc}</p>
                  {(tier as any).valueCallout && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#84CC16", marginBottom: 20, letterSpacing: 0.3 }}>
                      {(tier as any).valueCallout}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                    {tier.features.map(f => (
                      <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: f.included ? "#e2e8f0" : "rgba(255,255,255,0.3)" }}>
                        {f.included ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        )}
                        <span>{f.text}</span>
                      </div>
                    ))}
                  </div>

                  <Link href={tier.ctaLink} style={{
                    display: "block", width: "100%", padding: "12px", textAlign: "center",
                    background: tier.highlight ? "#84CC16" : "rgba(132,204,22,0.12)",
                    color: tier.highlight ? "#0d0d14" : "#84CC16",
                    border: tier.highlight ? "none" : "1px solid rgba(132,204,22,0.3)",
                    borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none", fontFamily: "inherit",
                    boxSizing: "border-box", transition: "all 0.2s ease",
                  }}>
                    {tier.cta}
                  </Link>
                </div>
              ))}
            </div>

          </div>

          {/* ── 9. FAQ ── */}
          <div id="faq" className="ds-section-pad" style={{ maxWidth: 1100, margin: "0 auto", padding: "120px 32px 80px", position: "relative", zIndex: 2 }}>
            {/* Section divider */}
            <div className="ds-section-divider" style={{
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 50%, transparent)",
              maxWidth: 600,
              margin: "-100px auto 60px",
            }} />

            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 64 }}>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "6px 16px", borderRadius: 50, background: "rgba(132,204,22,0.06)", color: "#84CC16", fontSize: 12, fontWeight: 700, marginBottom: 16, gap: 6, letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                FAQ
              </div>
              <h2 style={{ fontSize: 36, fontWeight: 800, color: "#ffffff", marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Questions investors actually ask
              </h2>
              <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
                Everything you need to know about using DealSignals for pre-diligence.
              </p>
            </div>

            {/* Two-column FAQ grid */}
            <div className="ds-faq-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Left column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Category: Getting Started */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 1, padding: "0 0 8px", marginBottom: 4 }}>Getting Started</div>

                {[
                  { q: "What exactly does DealSignals do?", a: "DealSignals is a pre-diligence engine for commercial real estate. Upload an OM, rent roll, or broker flyer and get a scored deal brief with extracted financials, risk signals, and a buy/hold/pass recommendation in under 60 seconds." },
                  { q: "Who is this built for?", a: "Active CRE investors, acquisition analysts, and brokers who evaluate multiple deals per week. If you spend time reading OMs and building spreadsheets before deciding whether to pursue a deal, DealSignals gives you that answer faster." },
                  { q: "What file types can I upload?", a: "PDF (recommended for best accuracy), Word (.docx), Excel (.xlsx/.xls), CSV, and plain text files. Maximum file size is 50MB. Multi-page OMs, single-page flyers, and rent rolls all work." },
                  { q: "How accurate is the extraction?", a: "90%+ accuracy on standard CRE metrics like price, cap rate, NOI, tenant name, lease terms, and building size. DealSignals is designed for pre-diligence speed. Always verify against the source document before making final investment decisions." },
                  { q: "Do I need to create an account?", a: "No. Your first 2 deal analyses are completely free with no signup required. We use an anonymous session to track your usage. You only need an account if you upgrade to Pro to save deals and access your DealBoard." },
                ].map((item, i) => {
                  const faqIdx = i;
                  return (
                    <div key={faqIdx} style={{
                      borderRadius: 12, border: openFaq === faqIdx ? "1px solid rgba(132,204,22,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      background: openFaq === faqIdx ? "rgba(132,204,22,0.03)" : "rgba(22,26,35,0.4)",
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === faqIdx ? null : faqIdx); }}
                        style={{
                          width: "100%", padding: "16px 20px", background: "none",
                          border: "none", textAlign: "left" as const, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                          color: "inherit", font: "inherit", outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: openFaq === faqIdx ? "#84CC16" : "#ffffff", transition: "color 0.2s" }}>{item.q}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={openFaq === faqIdx ? "#84CC16" : "#6b7280"} strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === faqIdx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openFaq === faqIdx && (
                        <div style={{ padding: "0 20px 16px" }}>
                          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Category: Pricing */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 1, padding: "16px 0 8px", marginBottom: 4 }}>Pricing &amp; Plans</div>

                {[
                  { q: "Is it really free?", a: "Yes. Try 2 deals without signing up. Create a free account for 5 total analyses with scoring, risk signals, and Excel export. Same output Pro users get." },
                  { q: "What does Pro include?", a: "Pro ($40/month) starts with a 7-day free trial. Everything in Free, plus 100 deal analyses/month, Pro DealBoard with history, deal comparison scoreboard, interactive property map, Location Intelligence, and white-label shareable links." },
                  { q: "What about Pro+?", a: "Pro+ ($100/month) also starts with a 7-day free trial. Everything in Pro, plus 500 deal analyses/month, priority processing, priority support, and custom branding. Bulk portfolio uploads are included on both Pro and Pro+." },
                ].map((item, i) => {
                  const faqIdx = 5 + i;
                  return (
                    <div key={faqIdx} style={{
                      borderRadius: 12, border: openFaq === faqIdx ? "1px solid rgba(132,204,22,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      background: openFaq === faqIdx ? "rgba(132,204,22,0.03)" : "rgba(22,26,35,0.4)",
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === faqIdx ? null : faqIdx); }}
                        style={{
                          width: "100%", padding: "16px 20px", background: "none",
                          border: "none", textAlign: "left" as const, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                          color: "inherit", font: "inherit", outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: openFaq === faqIdx ? "#84CC16" : "#ffffff", transition: "color 0.2s" }}>{item.q}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={openFaq === faqIdx ? "#84CC16" : "#6b7280"} strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === faqIdx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openFaq === faqIdx && (
                        <div style={{ padding: "0 20px 16px" }}>
                          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Right column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Category: The Product */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 1, padding: "0 0 8px", marginBottom: 4 }}>The Product</div>

                {[
                  { q: "How is this different from just reading the OM?", a: "Reading an OM takes 20–45 minutes and you still have to build a spreadsheet. DealSignals gives you the same data extraction, a structured financial summary, and a scored recommendation in under 60 seconds. It's the difference between reading every deal and filtering to the ones worth your time." },
                  { q: "What does the Deal Score actually measure?", a: "The Deal Score (0–100) evaluates six investment dimensions: pricing relative to market, cashflow strength, tenant credit quality, rollover and lease risk, location fundamentals, and upside potential. Each dimension is scored independently so you can see exactly where a deal is strong or weak." },
                  { q: "What's in the Excel export?", a: "Downloadable XLS worksheets of analysis covering deal summary inputs, rent roll, operating statement, debt and returns analysis, breakeven scenarios, and cap rate sensitivity tables. Every sheet is formatted and ready for your own underwriting adjustments." },
                  { q: "Can I share analysis with clients?", a: "Yes. Pro users can generate a unique shareable link for any deal. Your client sees the full analysis (score, metrics, financial summary) without needing a DealSignals account. Pro+ users get white-label branded links." },
                  { q: "What property types does it support?", a: "DealSignals works across all major CRE asset classes: retail NNN, multifamily, industrial, office, medical, self-storage, and mixed-use. The scoring models adapt to the specific asset type and deal structure." },
                ].map((item, i) => {
                  const faqIdx = 8 + i;
                  return (
                    <div key={faqIdx} style={{
                      borderRadius: 12, border: openFaq === faqIdx ? "1px solid rgba(132,204,22,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      background: openFaq === faqIdx ? "rgba(132,204,22,0.03)" : "rgba(22,26,35,0.4)",
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === faqIdx ? null : faqIdx); }}
                        style={{
                          width: "100%", padding: "16px 20px", background: "none",
                          border: "none", textAlign: "left" as const, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                          color: "inherit", font: "inherit", outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: openFaq === faqIdx ? "#84CC16" : "#ffffff", transition: "color 0.2s" }}>{item.q}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={openFaq === faqIdx ? "#84CC16" : "#6b7280"} strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === faqIdx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openFaq === faqIdx && (
                        <div style={{ padding: "0 20px 16px" }}>
                          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Category: Security */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase" as const, letterSpacing: 1, padding: "16px 0 8px", marginBottom: 4 }}>Privacy &amp; Security</div>

                {[
                  { q: "Is my data private and secure?", a: "Yes. Documents are processed in real-time and not stored permanently on our servers. We don't sell or share your data. No tracking cookies, no analytics on your deals. Free tier doesn't even require an account." },
                  { q: "Can other users see my deals?", a: "No. Your DealBoard is completely private. The only way someone else can see a deal is if you explicitly generate a share link for it. Share links can be password-protected and set to expire." },
                ].map((item, i) => {
                  const faqIdx = 13 + i;
                  return (
                    <div key={faqIdx} style={{
                      borderRadius: 12, border: openFaq === faqIdx ? "1px solid rgba(132,204,22,0.15)" : "1px solid rgba(255,255,255,0.06)",
                      background: openFaq === faqIdx ? "rgba(132,204,22,0.03)" : "rgba(22,26,35,0.4)",
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === faqIdx ? null : faqIdx); }}
                        style={{
                          width: "100%", padding: "16px 20px", background: "none",
                          border: "none", textAlign: "left" as const, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                          color: "inherit", font: "inherit", outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: openFaq === faqIdx ? "#84CC16" : "#ffffff", transition: "color 0.2s" }}>{item.q}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={openFaq === faqIdx ? "#84CC16" : "#6b7280"} strokeWidth="2" style={{ transition: "transform 0.2s", transform: openFaq === faqIdx ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {openFaq === faqIdx && (
                        <div style={{ padding: "0 20px 16px" }}>
                          <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom CTA */}
            <div style={{ textAlign: "center", marginTop: 56 }}>
              <p style={{ fontSize: 15, color: "#9ca3af", marginBottom: 16 }}>
                Still have questions? Upload a deal and see for yourself.
              </p>
              <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="ds-btn ds-btn-primary" style={{ fontSize: 14, padding: "12px 32px" }}>
                Try Your First Deal - Free
              </button>
            </div>
          </div>

        </section>
      )}

      {/* ===== PROCESSING STATE ===== */}
      {view === "processing" && (
        <section style={{
          background: "#0d0d14",
          minHeight: "100vh",
          paddingTop: 64,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Subtle green radial glow */}
          <div style={{
            position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)",
            width: 500, height: 500,
            background: "radial-gradient(circle, rgba(132,204,22,0.12) 0%, rgba(132,204,22,0) 70%)",
            borderRadius: "50%", pointerEvents: "none", zIndex: 0,
          }} />

          {/* Animated cityscape silhouette */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 220, zIndex: 1, overflow: "hidden" }}>
            {/* Layer 1 - far buildings, slow pan */}
            <svg style={{ position: "absolute", bottom: 0, left: 0, width: "200%", height: 180, opacity: 0.04, animation: "panCity1 60s linear infinite" }} viewBox="0 0 2400 180" preserveAspectRatio="none">
              <path d="M0,140 h30 v-60 h20 v60 h40 v-90 h15 v-20 h15 v110 h50 v-70 h20 v70 h30 v-50 h25 v50 h35 v-100 h10 v-30 h10 v130 h45 v-80 h20 v80 h30 v-45 h20 v45 h50 v-110 h15 v-15 h15 v125 h40 v-60 h25 v60 h30 v-85 h20 v85 h45 v-70 h15 v70 h35 v-95 h10 v-25 h15 v120 h40 v-55 h20 v55 h50 v-75 h20 v75 h30 v-40 h25 v40 h35 v-100 h15 v100 h40 v-65 h20 v65 h45 v-110 h10 v-20 h10 v130 h30 v-50 h20 v50 h40 v-80 h15 v80 h50 v-70 h25 v70 h30 v-90 h20 v90 h0 V180 H0 Z" fill="#84CC16"/>
            </svg>
            {/* Layer 2 - mid buildings, medium pan */}
            <svg style={{ position: "absolute", bottom: 0, left: 0, width: "200%", height: 160, opacity: 0.06, animation: "panCity2 45s linear infinite" }} viewBox="0 0 2400 160" preserveAspectRatio="none">
              <path d="M0,120 h25 v-80 h18 v80 h35 v-50 h22 v50 h28 v-100 h12 v-25 h12 v125 h45 v-65 h18 v65 h38 v-90 h15 v90 h30 v-40 h25 v40 h42 v-110 h10 v-15 h14 v125 h35 v-55 h20 v55 h50 v-75 h18 v75 h28 v-95 h15 v95 h40 v-60 h22 v60 h32 v-85 h12 v85 h48 v-70 h15 v70 h30 v-105 h10 v-20 h12 v125 h42 v-50 h20 v50 h35 v-80 h18 v80 h28 v-45 h22 v45 h45 v-90 h15 v90 h38 v-65 h20 v65 h30 v-100 h12 v100 V160 H0 Z" fill="#84CC16"/>
            </svg>
            {/* Layer 3 - near buildings, faster pan */}
            <svg style={{ position: "absolute", bottom: 0, left: 0, width: "200%", height: 120, opacity: 0.08, animation: "panCity3 30s linear infinite" }} viewBox="0 0 2400 120" preserveAspectRatio="none">
              <path d="M0,80 h40 v-40 h30 v40 h20 v-60 h25 v60 h35 v-30 h30 v30 h25 v-50 h20 v50 h40 v-70 h15 v70 h30 v-35 h25 v35 h45 v-55 h20 v55 h30 v-45 h30 v45 h20 v-65 h25 v65 h35 v-40 h20 v40 h40 v-50 h30 v50 h25 v-70 h20 v70 h45 v-35 h25 v35 h30 v-55 h20 v55 h35 v-45 h25 v45 h40 v-60 h30 v60 h20 v-30 h25 v30 h45 v-50 h20 v50 h30 v-40 h30 v40 V120 H0 Z" fill="#84CC16"/>
            </svg>
            {/* Gradient fade at top of cityscape */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to bottom, #0d0d14, transparent)", zIndex: 2 }} />
          </div>

          {/* Content container */}
          <div style={{ position: "relative", zIndex: 3, textAlign: "center", maxWidth: 600, padding: "0 24px" }}>
            {/* File name pill */}
            {selectedFile && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 14px", background: "rgba(132,204,22,0.08)",
                border: "1px solid rgba(132,204,22,0.15)", borderRadius: 20,
                fontSize: 12, marginBottom: 24,
              }}>
                <span style={{
                  padding: "2px 6px", background: "rgba(132,204,22,0.2)", borderRadius: 4,
                  fontSize: 9, fontWeight: 700, color: "#84CC16", textTransform: "uppercase",
                }}>
                  {selectedFile.name.split(".").pop()}
                </span>
                <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#9CA3AF" }}>
                  {selectedFile.name}
                </span>
              </div>
            )}

            {/* Compact progress ring + percentage */}
            <div style={{ marginBottom: 24, position: "relative", width: 80, height: 80, marginLeft: "auto", marginRight: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="80" height="80" viewBox="0 0 80 80" style={{ position: "absolute", inset: 0 }}>
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(132,204,22,0.08)" strokeWidth="2" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#84CC16" strokeWidth="2"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={`${2 * Math.PI * 34 * (1 - processingPct / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.1s linear", transformOrigin: "40px 40px", transform: "rotate(-90deg)" }}
                />
              </svg>
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: "#84CC16",
                  fontFamily: "'Inter', sans-serif", fontVariantNumeric: "tabular-nums",
                }}>
                  {processingPct}%
                </div>
              </div>
            </div>

            {/* Stage labels: UPLOAD → EXTRACT → READ → ANALYZE → GENERATE */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
              {[
                { label: "UPLOAD", done: statusMsg !== "Uploading files..." },
                { label: "EXTRACT", done: !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                { label: "READ", done: statusMsg !== "Reading file contents..." && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                { label: "ANALYZE", done: !statusMsg.includes("Analyzing") && !statusMsg.includes("Reading") && !statusMsg.includes("image") && statusMsg !== "Uploading files..." },
                { label: "GENERATE", done: statusMsg.includes("Generating") || statusMsg.includes("complete") },
              ].map((stage, i, arr) => {
                const isCurrent = !stage.done && (i === 0 || arr[i - 1].done);
                return (
                  <div key={stage.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: stage.done ? "rgba(132,204,22,0.2)" : isCurrent ? "rgba(132,204,22,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${stage.done ? "#84CC16" : isCurrent ? "#84CC16" : "rgba(132,204,22,0.2)"}`,
                      animation: isCurrent ? "pulse 1.5s ease-in-out infinite" : "none",
                    }}>
                      {stage.done ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: isCurrent ? "#84CC16" : "rgba(132,204,22,0.3)" }} />
                      )}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: stage.done ? "#84CC16" : isCurrent ? "#84CC16" : "#6B7280",
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                      {stage.label}
                    </span>
                    {i < arr.length - 1 && (
                      <div style={{ width: 12, height: 1, background: "rgba(132,204,22,0.15)" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Rotating status message */}
            <p key={`status-${processingMsgIdx}`} style={{
              fontSize: 14, fontWeight: 500, color: "#84CC16", margin: "0 0 32px",
              fontFamily: "'Inter', sans-serif", animation: "factSwap 0.6s ease-out",
            }}>
              {[
                "Scanning document structure...",
                "Extracting financial data points...",
                "Calculating cap rate and NOI...",
                "Running sale price scenarios...",
                "Scoring tenant credit quality...",
                "Mapping location intelligence...",
                "Building your deal analysis...",
              ][processingMsgIdx]}
            </p>

          </div>

          {/* CSS animations */}
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.6; }
            }
            @keyframes fadeInOut {
              0%, 10% { opacity: 0; }
              20%, 80% { opacity: 1; }
              90%, 100% { opacity: 0; }
            }
            @keyframes factSwap {
              0% { opacity: 0; transform: translateY(4px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes panCity1 {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            @keyframes panCity2 {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            @keyframes panCity3 {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </section>
      )}

      {/* ===== RESULT STATE ===== */}
      {view === "result" && data && (
        <section data-ds-result style={{ padding: "24px 0 60px", background: "#faf8ff" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
            <PropertyOutput data={data} heroImageUrl={heroImageUrl} usageData={usageData} />
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={resetAnalyzer} style={{
                padding: "12px 28px", background: "#16161f", border: "1.5px solid rgba(227, 190, 189, 0.2)",
                borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#9ca3af", fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                &larr; Analyze Another OM
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ===== FOOTER ===== */}
      <footer style={{
        background: "#0d0d14",
        padding: "64px 32px 32px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div className="ds-footer-grid" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr", gap: 48, marginBottom: 40 }}>
          <div>
            <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 40 }} />
            <p style={{ fontSize: 13, color: "#8b93a8", lineHeight: 1.7, marginTop: 16, maxWidth: 300, fontFamily: "'Inter', sans-serif" }}>
              AI underwriting for commercial real estate. Upload an OM, rent roll, or broker package and get institutional-grade signals in under 60 seconds.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11, fontWeight: 600, color: "#84CC16",
                padding: "5px 11px", borderRadius: 999,
                background: "rgba(132,204,22,0.08)",
                border: "1px solid rgba(132,204,22,0.25)",
                fontFamily: "'Inter', sans-serif", letterSpacing: 0.3,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#84CC16", boxShadow: "0 0 6px #84CC16" }} />
                All systems operational
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 11, fontWeight: 600, color: "#8b93a8",
                padding: "5px 11px", borderRadius: 999,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontFamily: "'Inter', sans-serif", letterSpacing: 0.3,
              }}>
                Retail · Industrial · Office · Land
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ffffff", marginBottom: 18, textTransform: "uppercase", letterSpacing: 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Product</div>
            {[
              { label: "Examples", hash: "examples" },
              { label: "How it works", hash: "how-it-works" },
              { label: "Features", hash: "features" },
              { label: "FAQ", hash: "faq" },
            ].map(link => (
              <a
                key={link.label}
                href={`#${link.hash}`}
                onClick={(e) => {
                  e.preventDefault();
                  // Landing-only sections: if we're on the processing/result
                  // view, flip back to the landing view first, then scroll
                  // once the section has mounted. Without this reset, the
                  // footer links silently did nothing whenever the user had
                  // just analyzed a deal.
                  const scroll = () => {
                    const el = typeof document !== "undefined" ? document.getElementById(link.hash) : null;
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  };
                  if (view !== "upload") {
                    setView("upload");
                    // Two RAFs ensures the new view is committed to the DOM
                    // before we try to scroll to the anchor.
                    requestAnimationFrame(() => requestAnimationFrame(scroll));
                  } else {
                    scroll();
                  }
                }}
                style={{
                  display: "block", fontSize: 13, color: "#cbd2e0", textDecoration: "none", marginBottom: 12,
                  fontFamily: "'Inter', sans-serif", transition: "color 0.15s ease", cursor: "pointer",
                }}
              >{link.label}</a>
            ))}
            <a
              href="#pricing"
              onClick={(e) => {
                e.preventDefault();
                const scroll = () => {
                  const el = typeof document !== "undefined" ? document.getElementById("pricing") : null;
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                };
                if (view !== "upload") {
                  setView("upload");
                  requestAnimationFrame(() => requestAnimationFrame(scroll));
                } else {
                  scroll();
                }
              }}
              style={{
                display: "block", fontSize: 13, color: "#cbd2e0", textDecoration: "none", marginBottom: 12,
                fontFamily: "'Inter', sans-serif", cursor: "pointer",
              }}
            >Pricing</a>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ffffff", marginBottom: 18, textTransform: "uppercase", letterSpacing: 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Company</div>
            <Link href="/contact" style={{
              display: "block", fontSize: 13, color: "#cbd2e0", textDecoration: "none", marginBottom: 12, fontFamily: "'Inter', sans-serif",
            }}>Contact</Link>
            <Link href="/workspace/login" style={{
              display: "block", fontSize: 13, color: "#cbd2e0", textDecoration: "none", marginBottom: 12, fontFamily: "'Inter', sans-serif",
            }}>Log In</Link>
            <Link href="/workspace/login?mode=register" style={{
              display: "block", fontSize: 13, color: "#cbd2e0", textDecoration: "none", marginBottom: 12, fontFamily: "'Inter', sans-serif",
            }}>Sign Up</Link>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ffffff", marginBottom: 18, textTransform: "uppercase", letterSpacing: 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Legal</div>
            <Link href="/terms" style={{
              display: "block", fontSize: 13, color: "#cbd2e0", textDecoration: "none", marginBottom: 12, fontFamily: "'Inter', sans-serif",
            }}>Terms of Use</Link>
            <Link href="/privacy" style={{
              display: "block", fontSize: 13, color: "#cbd2e0", textDecoration: "none", marginBottom: 12, fontFamily: "'Inter', sans-serif",
            }}>Privacy Policy</Link>
          </div>
        </div>

        <div style={{
          maxWidth: 1100, margin: "0 auto", paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}>
          <span style={{ fontSize: 12, color: "#5b6170", fontFamily: "'Inter', sans-serif" }}>
            &copy; {new Date().getFullYear()} DealSignals, Inc. All rights reserved.
          </span>
          <span style={{ fontSize: 12, color: "#5b6170", fontFamily: "'Inter', sans-serif" }}>
            Made for CRE investors and brokers.
          </span>
        </div>
      </footer>
    </div>
  );
}


/* ===========================================================================
   PROPERTY OUTPUT - IDENTICAL to pro workspace/properties/[id]/page.tsx
   Uses flat API data (d.fieldName) instead of gf(fields, group, name)
   Same rendering, same sections, same order.
   =========================================================================== */

/* ===========================================================================
   DEAL SCORE RING - SVG circular score gauge
   =========================================================================== */
function DealScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 54;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circumference * (1 - pct);
  const color = score >= 70 ? "#059669" : score >= 50 ? "#C49A3C" : "#84CC16";
  const bgColor = score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";
  const sentiment = score >= 80 ? "BULLISH" : score >= 60 ? "NEUTRAL" : "BEARISH";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: 130, height: 130 }}>
        <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="65" cy="65" r={radius} fill="none" stroke="rgba(227, 190, 189, 0.15)" strokeWidth={stroke} />
          <circle cx="65" cy="65" r={radius} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#151b2b", lineHeight: 1, letterSpacing: -1 }}>{score}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{sentiment}</span>
        </div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
    </div>
  );
}

/* Compute a numeric deal score from signal data */
function computeDealScore(d: any): number {
  const signals = d.signals || {};
  let total = 0, count = 0;
  const keys = ["cap_rate", "dscr", "occupancy", "basis", "tenant_quality", "rollover_risk"];
  for (const k of keys) {
    const val = String(signals[k] || "");
    if (val.includes("🟢") || val.toLowerCase().includes("green")) { total += 90; count++; }
    else if (val.includes("🟡") || val.toLowerCase().includes("yellow")) { total += 60; count++; }
    else if (val.includes("🔴") || val.toLowerCase().includes("red")) { total += 30; count++; }
  }
  if (count === 0) {
    // Fallback: estimate from financial metrics
    const cap = Number(d.capRateOm) || 0;
    const dscr = Number(d.dscrOm) || 0;
    const occ = Number(d.occupancyPct) || 0;
    let fallback = 50;
    if (cap >= 5 && cap <= 7) fallback += 10;
    if (dscr >= 1.35) fallback += 10;
    if (occ >= 90) fallback += 10;
    return Math.min(99, Math.max(10, fallback));
  }
  return Math.round(total / count);
}

function PropertyOutput({ data: d, heroImageUrl, usageData }: { data: AnalysisData; heroImageUrl?: string; usageData?: { uploadsUsed: number; uploadLimit: number } | null }) {
  const [captureEmail, setCaptureEmail] = useState("");
  const [captureStatus, setCaptureStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [captureMsg, setCaptureMsg] = useState("");
  const location = [d.address, d.city, d.state].filter(Boolean).join(", ");
  const encodedAddress = encodeURIComponent(location || d.propertyName);
  const recommendation = typeof d.signals?.recommendation === "string" ? d.signals.recommendation : d.signals?.recommendation?.text ? String(d.signals.recommendation.text) : String(d.signals?.recommendation || "");
  const brief = typeof d.brief === "string" ? d.brief : Array.isArray(d.brief) ? d.brief.join("\n") : String(d.brief || "");
  const tenants = d.tenants || [];
  const dealScore = d.proScore?.totalScore || computeDealScore(d);
  const scoreBand = d.proScore?.scoreBand || (dealScore >= 70 ? "buy" : dealScore >= 50 ? "hold" : "pass");
  const scoreRecommendation = d.proScore?.recommendation || "";
  const scoreCategories = d.proScore?.categories || [];
  const detectedType = d.analysisType || d.assetType || "retail";

  const metricsStripItems = [
    { label: "Price", value: fmt$(d.askingPrice) },
    { label: "Cap Rate", value: fmtPct(d.capRateOm) },
    { label: "NOI", value: fmt$(d.noiOm) },
    { label: "DSCR", value: fmtX(d.dscrOm) },
    { label: "Price/SF", value: d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}` : "--" },
    { label: "Cash-on-Cash", value: fmtPct(d.cashOnCashOm) },
  ].filter(s => s.value !== "--");

  const metrics: [string, string, string?][] = ([
    ["Asking Price (OM)", fmt$(d.askingPrice)],
    ["Price / SF (OM)", d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}/SF` : "--", "Asking Price ÷ Gross Leasable Area (GLA)"],
    ["GLA (OM)", fmtSF(d.buildingSf)],
    ["Occupancy (OM)", fmtPct(d.occupancyPct)],
    ["Base Rent (OM)", fmt$(d.baseRent)],
    ["NOI (OM)", fmt$(d.noiOm)],
    ["NOI (Adjusted)", fmt$(d.noiAdjusted), "NOI recalculated using standard expense assumptions (insurance, mgmt %, reserves) instead of OM figures"],
    ["Entry Cap (OM)", fmtPct(d.capRateOm), "NOI (OM) ÷ Asking Price"],
    ["Debt Service", fmt$(d.annualDebtService), "Annual mortgage payment based on loan amount, interest rate, and amortization period"],
    ["DSCR (OM)", fmtX(d.dscrOm), "NOI (OM) ÷ Annual Debt Service - measures ability to cover debt payments"],
    ["DSCR (Adjusted)", fmtX(d.dscrAdjusted), "NOI (Adjusted) ÷ Annual Debt Service"],
    ["Cash-on-Cash", fmtPct(d.cashOnCashOm), "Pre-tax cash flow ÷ Total cash invested (down payment + closing costs)"],
    ["Debt Yield", fmtPct(d.debtYield), "NOI ÷ Loan Amount - lender risk metric independent of interest rate"],
    ["Breakeven Occupancy", fmtPct(d.breakevenOccupancy), "Minimum occupancy needed to cover all expenses and debt service"],
  ] as [string, string, string?][]).filter(([, v]) => v !== "--");

  const signals = [
    ["Overall", d.signals?.overall],
    ["Cap Rate", d.signals?.cap_rate],
    ["DSCR", d.signals?.dscr],
    ["Occupancy", d.signals?.occupancy],
    ["Basis / Price", d.signals?.basis],
    ["Tenant Quality", d.signals?.tenant_quality],
    ["Rollover Risk", d.signals?.rollover_risk],
  ].filter(([, v]) => v);

  const hasData = metrics.length > 0 || signals.length > 0;

  // Match Pro's classifier exactly (PropertyDetailClient.tsx):
  //  - green emoji OR the word "green" → positive
  //  - everything else (including plain text with no marker) → negative
  // Previously Try Me dropped any signal without an emoji, which silently
  // hid the West Bend Plaza strengths because the LLM sometimes embeds the
  // emoji inside the text and sometimes doesn't.
  const strengths: { label: string; text: string }[] = [];
  const risks: { label: string; text: string }[] = [];
  signals.forEach(([label, val]) => {
    const raw = String(val || "");
    if (!raw.trim()) return;
    const lower = raw.toLowerCase();
    const hasGreen = raw.includes("🟢") || lower.includes("green");
    const text = raw.replace(/[🟢🟡🔴]/gu, "").trim();
    if (hasGreen) {
      strengths.push({ label: String(label), text });
    } else {
      risks.push({ label: String(label), text });
    }
  });

  // Price sensitivity table calculation
  const calculateSensitivity = (priceAdjustment: number) => {
    const adjustedPrice = (d.askingPrice || 0) * (1 + priceAdjustment);
    const noi = d.noiOm || 0;
    const capRate = adjustedPrice > 0 ? (noi / adjustedPrice) * 100 : 0;

    // Debt assumptions: LTV 75%, Interest 6.5%, 30-year amortization, 2% closing costs
    const ltv = 0.75;
    const interestRate = 0.065;
    const amortYears = 30;
    const closingCostsPct = 0.02;

    const loanAmount = adjustedPrice * ltv;
    const monthlyRate = interestRate / 12;
    const numPayments = amortYears * 12;
    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    const annualDS = monthlyPayment * 12;
    const dscr = noi > 0 ? noi / annualDS : 0;

    const downPayment = adjustedPrice * (1 - ltv);
    const closingCosts = adjustedPrice * closingCostsPct;
    const totalCash = downPayment + closingCosts;
    const cashFlow = noi - annualDS;
    const coc = totalCash > 0 ? (cashFlow / totalCash) * 100 : 0;

    return { capRate, dscr, coc };
  };

  const sensitivityRows = [
    { label: "-30%", adjustment: -0.30 },
    { label: "-20%", adjustment: -0.20 },
    { label: "-10%", adjustment: -0.10 },
    { label: "-5%", adjustment: -0.05 },
    { label: "OM Price", adjustment: 0, isOM: true },
    { label: "+5%", adjustment: 0.05 },
    { label: "+10%", adjustment: 0.10 },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* ===== HERO CARD - Combined Deal Summary + Image + Score (like pro) ===== */}
      <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", marginBottom: 20, overflow: "hidden" }}>
        {/* Top bar: property name + asset badge + location */}
        <div style={{ padding: "24px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 26, fontWeight: 800, color: "#0F172A", margin: 0, lineHeight: 1.2, flex: 1 }}>{d.propertyName}</h1>
            <span style={{
              padding: "5px 12px", background: "rgba(132,204,22,0.12)", color: "#4d7c0f",
              borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 0.8, flexShrink: 0, whiteSpace: "nowrap", border: "1px solid rgba(132,204,22,0.2)",
            }}>
              {detectedType.toUpperCase()}
            </span>
          </div>
          {location && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
              <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{location}</span>
              {[
                { label: "Maps", url: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}` },
                { label: "Earth", url: `https://earth.google.com/web/search/${encodedAddress}/` },
              ].map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                  padding: "2px 8px", background: "#F3F4F6", borderRadius: 4,
                  fontSize: 10, color: "#6B7280", textDecoration: "none", fontWeight: 600,
                }}>{link.label} &rarr;</a>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(0,0,0,0.05)", margin: "16px 0 0" }} />

        {/* Main content: Deal Summary (left) + Image/Score (right) */}
        <div className="tm-result-flex" style={{ display: "flex", gap: 0 }}>
          {/* Left: Deal Summary + metadata */}
          <div className="tm-result-text" style={{ flex: 1, padding: "24px 28px", minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Executive Summary</div>
            {brief ? (() => {
              let parsed: { overview?: string; strengths?: string[]; concerns?: string[] } | null = null;
              try {
                const obj = JSON.parse(brief);
                if (obj && typeof obj.overview === "string") parsed = obj;
              } catch { /* legacy plain text */ }

              if (parsed) {
                return (
                  <div>
                    <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.75, margin: "0 0 14px" }}>{parsed.overview}</p>

                    {parsed.strengths && parsed.strengths.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Key Strengths</div>
                        {parsed.strengths.map((s: string, i: number) => (
                          <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 5 }}>
                            <span style={{ color: "#22C55E", fontSize: 13, lineHeight: "18px", flexShrink: 0 }}>✓</span>
                            <span style={{ fontSize: 12, color: "#374151", lineHeight: "18px" }}>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {parsed.concerns && parsed.concerns.length > 0 && (
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Primary Concerns</div>
                        {parsed.concerns.map((c: string, i: number) => (
                          <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 5 }}>
                            <span style={{ color: "#F59E0B", fontSize: 13, lineHeight: "18px", flexShrink: 0 }}>△</span>
                            <span style={{ fontSize: 12, color: "#374151", lineHeight: "18px" }}>{c}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              // Legacy fallback
              return (
                <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.75 }}>
                  {brief.split("\n").filter((p: string) => p.trim()).slice(0, 3).map((p: string, i: number) => (
                    <p key={i} style={{ margin: "0 0 12px" }}>{p}</p>
                  ))}
                </div>
              );
            })() : (
              <p style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>Analysis summary will appear here once processing completes.</p>
            )}

            {/* Property metadata chips */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(0,0,0,0.04)" }}>
              {[
                { label: "Type", value: d.assetType },
                { label: "Built", value: d.yearBuilt },
                { label: "Tenants", value: d.tenantCount },
                { label: "WALE", value: d.wale ? `${d.wale} yrs` : null },
                { label: "Traffic", value: d.traffic },
              ].filter((x) => x.value).map((x) => (
                <div key={x.label} style={{ background: "#F9FAFB", borderRadius: 6, padding: "6px 10px", border: "1px solid rgba(0,0,0,0.04)" }}>
                  <div style={{ fontSize: 8, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 1 }}>{x.label}</div>
                  <div style={{ fontSize: 12, color: "#0F172A", fontWeight: 600 }}>{x.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Image stacked on Score */}
          <div className="tm-result-image" style={{ width: 280, flexShrink: 0, borderLeft: "1px solid rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 20px", gap: 16 }}>
            <PropertyImage heroImageUrl={heroImageUrl} location={location} encodedAddress={encodedAddress} propertyName={d.propertyName} />
            <DealScoreRing score={dealScore} label="Deal Score" />
          </div>
        </div>
      </div>

      {/* ===== METRICS STRIP - Horizontal single-row key metrics ===== */}
      {metricsStripItems.length > 0 && (
        <div className="tm-metrics-strip" style={{ background: "#ffffff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", padding: "14px 0", marginBottom: 20, display: "grid", gridTemplateColumns: `repeat(${metricsStripItems.length}, 1fr)` }}>
          {metricsStripItems.map((item, idx) => (
            <div key={item.label} style={{
              padding: "10px 14px",
              borderRight: idx < metricsStripItems.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4, fontFamily: "'Inter', sans-serif" }}>{item.label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", fontVariantNumeric: "tabular-nums", fontFamily: "'Inter', sans-serif" }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ===== RECOMMENDATION BANNER ===== */}
      {recommendation && (
        <div style={{
          padding: "16px 20px", borderRadius: 10, marginBottom: 20,
          background: recommendation.includes("🟢") ? "rgba(5,150,105,0.06)" : recommendation.includes("🔴") ? "rgba(220,38,38,0.06)" : "rgba(217,119,6,0.06)",
          color: recommendation.includes("🟢") ? "#065f46" : recommendation.includes("🔴") ? "#991b1b" : "#92400e",
          border: recommendation.includes("🟢") ? "1px solid rgba(5,150,105,0.15)" : recommendation.includes("🔴") ? "1px solid rgba(220,38,38,0.15)" : "1px solid rgba(217,119,6,0.15)",
          fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>{recommendation.includes("🟢") ? "🟢" : recommendation.includes("🔴") ? "🔴" : "🟡"}</span>
          <span>{recommendation.replace(/🟢|🟡|🔴/g, "").trim()}</span>
        </div>
      )}

      {/* Score Breakdown removed from Try Me - Pro-only feature */}

      {/* ===== PRICE SENSITIVITY TABLE ===== */}
      {(d.askingPrice && d.noiOm) && (
        <div className="tm-table-wrap" style={{ background: "#ffffff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", padding: "20px", marginBottom: 20, overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#0F172A", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Sale Price Scenarios</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
            <thead>
              <tr>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#6B7280", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Scenario</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#6B7280", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Purchase Price</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#6B7280", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Cap Rate</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#6B7280", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>DSCR</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#6B7280", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>Cash-on-Cash</th>
              </tr>
            </thead>
            <tbody>
              {sensitivityRows.map((row, idx) => {
                const sens = calculateSensitivity(row.adjustment);
                const capRateGood = sens.capRate >= 7;
                const dscrGood = sens.dscr >= 1.25;
                const cocGood = sens.coc >= 8;
                const capRateColor = capRateGood ? "#059669" : sens.capRate >= 6.5 ? "#D97706" : "#DC2626";
                const dscrColor = dscrGood ? "#059669" : sens.dscr >= 1.15 ? "#D97706" : "#DC2626";
                const cocColor = cocGood ? "#059669" : sens.coc >= 5 ? "#D97706" : "#DC2626";

                return (
                  <tr key={row.label} style={{
                    background: row.isOM ? "rgba(0,0,0,0.02)" : idx % 2 === 1 ? "rgba(0,0,0,0.01)" : "transparent",
                    borderBottom: row.isOM ? "2px solid #84CC16" : "1px solid rgba(0,0,0,0.05)",
                  }}>
                    <td style={{ padding: "10px 12px", fontWeight: row.isOM ? 700 : 500, color: "#374151" }}>
                      {row.isOM ? <span style={{ color: "#84CC16", fontWeight: 700 }}>⭐ {row.label}</span> : row.label}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{fmt$((d.askingPrice || 0) * (1 + row.adjustment))}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: capRateColor, fontVariantNumeric: "tabular-nums" }}>{sens.capRate.toFixed(2)}%</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: dscrColor, fontVariantNumeric: "tabular-nums" }}>{sens.dscr.toFixed(2)}x</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: cocColor, fontVariantNumeric: "tabular-nums" }}>{sens.coc.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 10, color: "#6B7280", fontStyle: "italic" }}>
            Assumptions: LTV 75%, Rate 6.5%, 30-yr amortization, 2% closing costs. Green ≥ 7% cap, 1.25x DSCR, 8% CoC.
          </div>
        </div>
      )}

      {/* ===== STRENGTHS & RISKS - pro-style separate cards with tinted headers ===== */}
      {(strengths.length > 0 || risks.length > 0) && (
        <div className="tm-signal-cards" style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          {/* Strengths Card */}
          <div style={{ flex: 1, minWidth: 280, background: "#ffffff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.04)", background: "#F0FDF4", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#059669", fontFamily: "'Inter', sans-serif" }}>Strengths</h3>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#059669", opacity: 0.7, fontWeight: 600 }}>{strengths.length}</span>
            </div>
            {strengths.length === 0 ? (
              <div style={{ padding: "16px 18px", fontSize: 12, color: "#6B7280" }}>No strong signals detected</div>
            ) : strengths.map((s, i) => (
              <div key={i} style={{ padding: "12px 18px", borderBottom: i < strengths.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#151b2b", textTransform: "uppercase", letterSpacing: 0.3 }}>{s.label}</span>
                </div>
                <p style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.6, margin: "0 0 0 15px", wordBreak: "break-word" }}>{s.text}</p>
              </div>
            ))}
          </div>
          {/* Risks Card */}
          <div style={{ flex: 1, minWidth: 280, background: "#ffffff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(0,0,0,0.04)", background: "#FEF2F2", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#DC2626", fontFamily: "'Inter', sans-serif" }}>Risks</h3>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#DC2626", opacity: 0.7, fontWeight: 600 }}>{risks.length}</span>
            </div>
            {risks.length === 0 ? (
              <div style={{ padding: "16px 18px", fontSize: 12, color: "#6B7280" }}>No risk signals detected</div>
            ) : risks.map((r, i) => (
              <div key={i} style={{ padding: "12px 18px", borderBottom: i < risks.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#151b2b", textTransform: "uppercase", letterSpacing: 0.3 }}>{r.label}</span>
                </div>
                <p style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.6, margin: "0 0 0 15px", wordBreak: "break-word" }}>{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== WHAT TO DOUBLE CHECK - pro-style review panel ===== */}
      {(() => {
        const checks: string[] = [];
        if (!d.askingPrice) checks.push("Asking price was not found in the document - verify with broker or listing.");
        if (!d.noiOm) checks.push("NOI could not be extracted - confirm net operating income from the OM or financials.");
        if (!d.buildingSf) checks.push("Building square footage was not detected - verify GLA from the property listing.");
        if (!d.occupancyPct) checks.push("Occupancy percentage was not found - check current occupancy with the seller.");
        if (d.noiOm && d.noiAdjusted && Math.abs(Number(d.noiAdjusted) - Number(d.noiOm)) > Number(d.noiOm) * 0.1) checks.push("Adjusted NOI differs significantly from OM NOI - review expense assumptions.");
        if (!d.wale) checks.push("WALE (weighted average lease expiration) could not be calculated - verify lease terms.");
        if (d.tenants && d.tenants.length === 0) checks.push("No tenant data was extracted - confirm tenant roster from the rent roll.");
        if (d.capRateOm && Number(d.capRateOm) > 9) checks.push("Cap rate appears unusually high - verify NOI and asking price are correct.");
        if (d.capRateOm && Number(d.capRateOm) < 3) checks.push("Cap rate appears unusually low - verify this is not a development or value-add play.");
        if (checks.length === 0) return null;
        return (
          <div style={{ background: "#FFFBF0", borderRadius: 12, border: "1px solid #F3E8C8", overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3E8C8", display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2" strokeLinecap="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#92400E", fontFamily: "'Inter', sans-serif" }}>What to Double Check</h3>
            </div>
            <div style={{ padding: "10px 18px" }}>
              <p style={{ fontSize: 11, color: "#78350F", margin: "0 0 8px", opacity: 0.7 }}>
                AI extraction flagged these items for manual verification
              </p>
              {checks.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", fontSize: 12, color: "#78350F", lineHeight: 1.5 }}>
                  <span style={{ color: "#D97706", fontWeight: 700, flexShrink: 0 }}>•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ===== VALUE-ADD OPPORTUNITIES ===== */}
      {(() => {
        const vaFlags: { type: string; strength: string; summary: string }[] = [];
        // Derive value-add signals from available data
        const occupancy = Number(d.occupancyPct) || 0;
        const noiOm = Number(d.noiOm) || 0;
        const noiAdj = Number(d.noiAdjusted) || 0;
        if (occupancy > 0 && occupancy < 90) vaFlags.push({ type: "Vacancy Lease-Up", strength: occupancy < 75 ? "strong" : "moderate", summary: `Current occupancy at ${occupancy}%. Lease-up to market could significantly increase NOI.` });
        if (noiAdj > 0 && noiOm > 0 && noiAdj > noiOm * 1.05) vaFlags.push({ type: "Expense Optimization", strength: noiAdj > noiOm * 1.15 ? "strong" : "moderate", summary: `Adjusted NOI (${fmt$(noiAdj)}) exceeds OM NOI (${fmt$(noiOm)}), suggesting expense inefficiencies to address.` });
        if (d.signals?.rollover_risk && String(d.signals.rollover_risk).includes("🔴")) vaFlags.push({ type: "Lease Rollover", strength: "moderate", summary: "Near-term lease expirations create opportunity to negotiate at current or higher market rents." });
        if (d.signals?.basis && String(d.signals.basis).includes("🟢")) vaFlags.push({ type: "Below-Market Basis", strength: "strong", summary: "Entry basis appears favorable relative to market comps. Potential for immediate equity upside." });
        if (vaFlags.length === 0) return null;
        const strengthStyle: Record<string, { color: string; bg: string }> = {
          strong: { color: "#059669", bg: "rgba(5,150,105,0.08)" },
          moderate: { color: "#D97706", bg: "rgba(217,119,6,0.08)" },
        };
        return (
          <div style={{ background: "#ffffff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.04)", background: "#F9FAFB" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#059669", borderRadius: 2 }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#0F172A", fontFamily: "'Inter', sans-serif" }}>Value-Add Opportunities</h3>
              </div>
              <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0 11px", lineHeight: 1.4 }}>Actionable signals that indicate NOI improvement potential</p>
            </div>
            <div style={{ padding: "12px 20px" }}>
              {vaFlags.map((flag, i) => {
                const s = strengthStyle[flag.strength] || strengthStyle.moderate;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", marginBottom: i < vaFlags.length - 1 ? 6 : 0, borderRadius: 8, background: flag.strength === "strong" ? "rgba(5,150,105,0.04)" : "rgba(217,119,6,0.04)" }}>
                    <span style={{ fontSize: 16, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{flag.strength === "strong" ? "📈" : "📊"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6B7280" }}>{flag.type}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: s.color, background: "rgba(0,0,0,0.08)", padding: "1px 6px", borderRadius: 3 }}>{flag.strength}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", lineHeight: 1.4 }}>{flag.summary}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}



      {/* ===== KEY METRICS + SIGNALS ===== */}
      {hasData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {metrics.length > 0 && (
            <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "#F9FAFB", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#0F172A", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Key Metrics</h3>
              </div>
              {metrics.map(([label, val, tooltip], i) => (
                <div key={String(label)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px",
                  background: i % 2 === 1 ? "rgba(0,0,0,0.01)" : "transparent",
                }}>
                  <span style={{ fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center", gap: 5 }}>
                    {String(label)}
                    {tooltip && <MetricTooltip text={String(tooltip)} />}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{String(val)}</span>
                </div>
              ))}
            </div>
          )}
          {signals.length > 0 && (
            <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "#F9FAFB", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#0F172A", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Signal Assessment</h3>
              </div>
              {signals.map(([label, val], i) => {
                const raw = String(val);
                const color = signalColor(raw);
                const bgColor = color === "#059669" ? "rgba(5,150,105,0.05)" : color === "#D97706" ? "rgba(217,119,6,0.05)" : color === "#DC2626" ? "rgba(220,38,38,0.05)" : "rgba(132,204,22,0.03)";
                const borderLeft = color === "#059669" ? "3px solid #059669" : color === "#D97706" ? "3px solid #D97706" : color === "#DC2626" ? "3px solid #DC2626" : "3px solid #84CC16";
                // Strip leading emoji + space for cleaner display
                const text = raw.replace(/^[🟢🟡🔴]\s*/, "");
                return (
                  <div key={String(label)} style={{
                    padding: "12px 18px",
                    background: bgColor, borderLeft, display: "flex", flexDirection: "column", gap: 2,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.3 }}>{String(label)}</span>
                    </div>
                    <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.5, paddingLeft: 14 }}>{text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== TENANT SUMMARY ===== */}
      {tenants.length > 0 && (
        <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "12px 18px", background: "#F9FAFB" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#0F172A", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Tenant Summary</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 16px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>Tenant</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#6B7280" }}>SF</th>
                <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#6B7280" }}>Annual Rent</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>Type</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>Lease End</th>
                <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#6B7280" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t: any, i: number) => (
                <tr key={i} style={{ background: i % 2 === 1 ? "rgba(0,0,0,0.01)" : "transparent" }}>
                  <td style={{ padding: "6px 16px", fontWeight: 600, color: "#374151" }}>{t.name}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#374151" }}>{t.sf ? Math.round(Number(t.sf)).toLocaleString() : "--"}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "#374151" }}>{fmt$(t.rent)}</td>
                  <td style={{ padding: "6px 12px", color: "#6B7280" }}>{t.type || "--"}</td>
                  <td style={{ padding: "6px 12px", color: "#6B7280" }}>{t.end || "--"}</td>
                  <td style={{ padding: "6px 12px" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8,
                      color: String(t.status || "").includes("Expir") || String(t.status || "").includes("MTM") ? "#D97706" : "#059669",
                      background: String(t.status || "").includes("Expir") || String(t.status || "").includes("MTM") ? "rgba(217,119,6,0.15)" : "rgba(5,150,105,0.15)",
                    }}>{t.status || "--"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== DOWNLOAD ASSETS ===== */}
      {hasData && (
        <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 3, height: 14, background: "#84CC16", borderRadius: 2 }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#0F172A", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Download Assets</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button className="dl-btn" onClick={() => { trackDownload("xlsx", d.propertyName || ""); downloadLiteXLSX(d); }} style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
              background: "rgba(5,150,105,0.05)", border: "1px solid rgba(5,150,105,0.15)", borderRadius: 6,
              color: "#374151", textAlign: "left", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(5,150,105,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, color: "#0F172A" }}>Underwriting Workbook <span style={{ marginLeft: 6, padding: "1px 5px", background: "rgba(5,150,105,0.1)", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#059669" }}>XLSX</span></div>
                <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.4 }}>Downloadable XLS worksheets: Inputs, Rent Roll, Operating Statement, Debt &amp; Returns, Breakeven, Cap Scenarios</div>
              </div>
            </button>
            <button className="dl-btn" onClick={() => { trackDownload("docx", d.propertyName || ""); downloadLiteBrief(d); }} style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 18px",
              background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: 6,
              color: "#374151", textAlign: "left", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(37,99,235,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, color: "#0F172A" }}>First-Pass Brief <span style={{ marginLeft: 6, padding: "1px 5px", background: "rgba(37,99,235,0.1)", borderRadius: 4, fontSize: 9, fontWeight: 700, color: "#2563EB" }}>DOC</span></div>
                <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.4 }}>Investment memo with assessment, key metrics, signal ratings, and recommendation</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ===== DISCLAIMER ===== */}
      <p style={{ fontSize: 10, color: "#9CA3AF", margin: "0 0 8px", fontStyle: "italic", textAlign: "center" }}>
        First-pass underwriting screen &middot; Directional only &middot; Verify all data independently
      </p>

      {/* ===== BOLD PRO CTA ===== */}
      <div style={{
        background: "linear-gradient(135deg, #0d0d14 0%, #111827 50%, #0d0d14 100%)",
        borderRadius: 16, padding: "48px 40px", marginTop: 32,
        border: "1px solid rgba(132,204,22,0.15)",
        position: "relative", overflow: "hidden", textAlign: "center",
      }}>
        <div style={{ position: "absolute", top: "-50%", left: "50%", transform: "translateX(-50%)", width: 500, height: 500, borderRadius: "50%", background: "rgba(132,204,22,0.08)", filter: "blur(120px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{
            fontSize: 28, fontWeight: 800, color: "#ffffff", marginBottom: 12,
            fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.3,
          }}>
            Save this breakdown. Compare it. Share it.
          </h2>
          <p style={{ fontSize: 16, color: "#d1d5db", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 8px" }}>
            With DealSignals Pro, every analysis is saved to your DealBoard. Score side-by-side, export full workbooks, pin deals to a map, and send branded briefs to clients.
          </p>
          <p style={{ fontSize: 14, color: "#84CC16", fontWeight: 600, marginBottom: 28 }}>
            Try Pro free for 7 days. 100 deals/month for $40 - less than 50¢ per deal.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                try { trackProCTAClick("lite_result_bottom"); } catch {}
                window.location.href = "/workspace/login?upgrade=pro";
              }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 36px", borderRadius: 10,
                background: "#84CC16", color: "#0d0d14",
                fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 0 30px rgba(132,204,22,0.4), 0 0 60px rgba(132,204,22,0.15)",
              }}
            >
              Start 7-Day Free Trial
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </button>
          </div>
          {usageData && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 16, fontFamily: "'Inter', sans-serif" }}>
              <span style={{ color: usageData.uploadsUsed >= usageData.uploadLimit ? "#f87171" : "#84CC16", fontWeight: 700 }}>
                {usageData.uploadsUsed}/{usageData.uploadLimit}
              </span>{" "}
              free {usageData.uploadLimit === 1 ? "analysis" : "analyses"} used
            </p>
          )}
        </div>
      </div>

    </div>
  );
}




/* ===========================================================================
   DEMO FALLBACK
   =========================================================================== */
function generateDemoResult(filename: string): AnalysisData {
  const name = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b(om|offering|memorandum|final|draft|copy)\b/gi, "").trim() || "NNN Retail Property";
  return {
    propertyName: name, address: "1234 Main Street", city: "Austin", state: "TX",
    assetType: "Single-Tenant NNN Retail", yearBuilt: "2019", tenantCount: "1", wale: "8.5",
    traffic: "32,000 AADT on Main St", buildingSf: 15000, occupancyPct: 100,
    askingPrice: 4250000, pricePerSf: 283.33, capRateOm: 5.85, capRateAdjusted: 5.67,
    baseRent: 248625, noiOm: 248625, noiAdjusted: 241200, annualDebtService: 153400,
    dscrOm: 1.62, dscrAdjusted: 1.57, cashOnCashOm: 8.45, debtYield: 9.0, breakevenOccupancy: 62.5,
    brief: "This single-tenant net lease property presents a solid acquisition opportunity with an investment-grade tenant on a long-term absolute NNN lease. The property was built in 2019, suggesting minimal near-term capital expenditure requirements.\n\nThe in-place cap rate of 5.85% is in line with current market benchmarks for credit-tenant NNN retail. The DSCR of 1.62x provides comfortable debt service coverage, and the 8.5-year remaining lease term offers meaningful cash flow visibility.",
    signals: { overall: "🟢 Buy - Solid fundamentals with strong tenant credit", cap_rate: "🟢 In-line with market for credit NNN retail (5.50–6.25%)", dscr: "🟢 Comfortable coverage at 1.62x (threshold: 1.25x)", occupancy: "🟢 100% occupied - single-tenant, no vacancy risk during lease term", basis: "🟢 Below replacement cost at $283/SF", tenant_quality: "🟢 Investment-grade credit, national brand", rollover_risk: "🟢 8.5-year WALE - low near-term rollover risk", recommendation: "🟢 Buy - Move quickly. Strong credit tenant, long lease term, and solid basis." },
    tenants: [{ name: name.split(" ")[0] || "National Tenant", sf: 15000, rent: 248625, type: "Absolute NNN", end: "Dec 2034", status: "Active" }],
  };
}

/* ===========================================================================
   LITE DOWNLOAD - XLSX (6-sheet workbook via ExcelJS)
   =========================================================================== */
async function downloadLiteXLSX(d: any) {
  let EJ: any;
  try {
    if ((window as any).ExcelJS) { EJ = (window as any).ExcelJS; }
    else { await new Promise<void>((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"; s.onload = () => { EJ = (window as any).ExcelJS; res(); }; s.onerror = () => rej(); document.head.appendChild(s); }); }
  } catch { alert("Could not load Excel library."); return; }

  const wb = new EJ.Workbook();
  const pName = d.propertyName || "Property";
  const loc = [d.address, d.city, d.state].filter(Boolean).join(", ");

  // Style constants matching pro version
  const navy = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF262C5C" } };
  const ltBlue = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFDCE6F1" } };
  const yellow = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFF00" } };
  const white = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFFF" } };
  const hdrFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
  const titleFont = { bold: true, color: { argb: "FF262C5C" }, size: 12, name: "Arial" };
  const secFont = { bold: true, color: { argb: "FF262C5C" }, size: 10, name: "Arial" };
  const labelFont = { bold: true, color: { argb: "FF000000" }, size: 10, name: "Arial" };
  const valFont = { color: { argb: "FF0000FF" }, size: 10, name: "Arial" };
  const noteFont = { color: { argb: "FF888888" }, size: 9, name: "Arial", italic: true };
  const redFont = { bold: true, color: { argb: "FFFF0000" }, size: 10, name: "Arial" };
  const thinBorder = { style: "thin" as const, color: { argb: "FFD8DFE9" } };
  const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  function hdrRow(ws: any, r: number, vals: string[], widths?: number[]) {
    vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.font = hdrFont; c.fill = navy; c.border = borders; c.alignment = { vertical: "middle" }; });
    if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  }
  function dataRow(ws: any, r: number, label: string, val: any, note?: string, opts?: { yellow?: boolean; bold?: boolean; red?: boolean }) {
    const lc = ws.getCell(r, 1); lc.value = label; lc.font = opts?.bold ? { ...labelFont, color: { argb: "FF262C5C" } } : labelFont; lc.fill = white; lc.border = borders;
    const vc = ws.getCell(r, 2); vc.value = val; vc.font = opts?.red ? redFont : valFont; vc.fill = opts?.yellow ? yellow : ltBlue; vc.border = borders;
    if (note !== undefined) { const nc = ws.getCell(r, 3); nc.value = note; nc.font = noteFont; nc.border = borders; }
  }

  // ── SHEET 1: Inputs ──
  const ws1 = wb.addWorksheet("Inputs");
  ws1.getColumn(1).width = 28; ws1.getColumn(2).width = 32; ws1.getColumn(3).width = 30;
  let r = 2;
  const tc = ws1.getCell(r, 1); tc.value = `${pName} - INPUTS`; tc.font = titleFont; r++;
  const lc = ws1.getCell(r, 1); lc.value = loc; lc.font = { color: { argb: "FF666666" }, size: 10, name: "Arial" }; r += 2;
  const s1 = ws1.getCell(r, 1); s1.value = "PROPERTY INFORMATION"; s1.font = secFont; r++;
  hdrRow(ws1, r, ["Field", "Value", "Notes"]); r++;
  dataRow(ws1, r++, "Address", d.address || "", "From OM");
  dataRow(ws1, r++, "City / State", `${d.city || ""}, ${d.state || ""}`, "");
  dataRow(ws1, r++, "Asset Type", d.assetType || "", "");
  dataRow(ws1, r++, "Year Built", d.yearBuilt || "", "From OM");
  dataRow(ws1, r++, "GLA (SF)", d.buildingSf || "", "");
  dataRow(ws1, r++, "Occupancy", d.occupancyPct ? `${d.occupancyPct}%` : "", "");
  dataRow(ws1, r++, "Tenants", d.tenantCount || "", "");
  dataRow(ws1, r++, "WALE", d.wale ? `${d.wale} yrs` : "", "");
  if (d.traffic) dataRow(ws1, r++, "Traffic", d.traffic, "");
  r++;
  const s2 = ws1.getCell(r, 1); s2.value = "DEAL ASSUMPTIONS"; s2.font = secFont; r++;
  hdrRow(ws1, r, ["Field", "Value", "Notes"]); r++;
  dataRow(ws1, r++, "Purchase Price", d.askingPrice || "", "Asking price per OM", { yellow: true });
  dataRow(ws1, r++, "Basis / SF", d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}` : "", "");
  r++;
  const s3 = ws1.getCell(r, 1); s3.value = "DEBT ASSUMPTIONS"; s3.font = secFont; r++;
  hdrRow(ws1, r, ["Field", "Value", "Notes"]); r++;
  dataRow(ws1, r++, "LTV", "65%", "Assumed 65%", { yellow: true });
  dataRow(ws1, r++, "Interest Rate", "7.25%", "Assumed 7.25%", { yellow: true });
  dataRow(ws1, r++, "Amortization (Yrs)", "25", "25-yr");
  dataRow(ws1, r++, "Loan Amount", fmt$(d.loanAmount), "");
  dataRow(ws1, r++, "Equity Required", fmt$(d.equityRequired), "");

  // ── SHEET 2: Rent Roll ──
  const ws2 = wb.addWorksheet("Rent Roll");
  const tenants = d.tenants || [];
  r = 2;
  ws2.getCell(r, 1).value = `RENT ROLL - ${pName}`; ws2.getCell(r, 1).font = titleFont; r += 2;
  hdrRow(ws2, r, ["Tenant", "SF", "Annual Rent", "Type", "Lease End", "Status"], [24, 10, 16, 16, 14, 12]); r++;
  for (const t of tenants) {
    const isExpired = String(t.status||"").toLowerCase().includes("expir") || String(t.status||"").toLowerCase().includes("mtm") || String(t.status||"").toLowerCase().includes("vacant");
    [t.name, t.sf, t.rent, t.type, t.end, t.status].forEach((v, i) => {
      const c = ws2.getCell(r, i + 1); c.value = v; c.border = borders; c.fill = white;
      c.font = i === 0 ? labelFont : (isExpired ? redFont : valFont);
    }); r++;
  }
  if (!tenants.length) { ws2.getCell(r, 1).value = "No tenant data extracted"; ws2.getCell(r, 1).font = noteFont; }

  // ── SHEET 3: Operating Statement ──
  const ws3 = wb.addWorksheet("Operating Statement");
  r = 2;
  ws3.getCell(r, 1).value = `OPERATING STATEMENT - ${pName}`; ws3.getCell(r, 1).font = titleFont; r += 2;
  hdrRow(ws3, r, ["Line Item", "Amount", "Notes"], [34, 22, 34]); r++;
  const s4 = ws3.getCell(r, 1); s4.value = "REVENUE"; s4.font = secFont; r++;
  dataRow(ws3, r++, "Base Rent", fmt$(d.baseRent), "In-place rent from OM");
  if (d.nnnReimbursements) dataRow(ws3, r++, "NNN Reimbursements", fmt$(d.nnnReimbursements), "");
  if (d.grossScheduledIncome) dataRow(ws3, r++, "Gross Scheduled Income", fmt$(d.grossScheduledIncome), "");
  if (d.vacancyAllowance) dataRow(ws3, r++, "Vacancy Allowance", fmt$(d.vacancyAllowance), "");
  if (d.effectiveGrossIncome) dataRow(ws3, r++, "Effective Gross Income (EGI)", fmt$(d.effectiveGrossIncome), "", { bold: true });
  r++;
  const s5 = ws3.getCell(r, 1); s5.value = "EXPENSES"; s5.font = secFont; r++;
  if (d.propertyTaxes) dataRow(ws3, r++, "Real Estate Taxes", fmt$(d.propertyTaxes), "From OM");
  if (d.insurance) dataRow(ws3, r++, "Insurance", fmt$(d.insurance), "From OM");
  if (d.camExpenses) dataRow(ws3, r++, "CAM", fmt$(d.camExpenses), "");
  if (d.managementFee) dataRow(ws3, r++, "Management Fee", fmt$(d.managementFee), "");
  if (d.reserves) dataRow(ws3, r++, "Reserves", fmt$(d.reserves), "");
  if (d.totalExpenses) dataRow(ws3, r++, "Total Expenses", fmt$(d.totalExpenses), "");
  r++;
  const s6 = ws3.getCell(r, 1); s6.value = "NET OPERATING INCOME"; s6.font = secFont; r++;
  dataRow(ws3, r++, "NOI (OM)", fmt$(d.noiOm), "", { bold: true });
  dataRow(ws3, r++, "NOI (Adjusted)", fmt$(d.noiAdjusted), "After mgmt + reserves", { bold: true });

  // ── SHEET 4: Debt & Returns ──
  const ws4 = wb.addWorksheet("Debt & Returns");
  r = 2;
  ws4.getCell(r, 1).value = `DEBT SERVICE & RETURNS - ${pName}`; ws4.getCell(r, 1).font = titleFont; r += 2;
  hdrRow(ws4, r, ["Metric", "Value", "Notes"], [34, 22, 34]); r++;
  ws4.getCell(r, 1).value = "DEBT SERVICE"; ws4.getCell(r, 1).font = secFont; r++;
  dataRow(ws4, r++, "Loan Amount", fmt$(d.loanAmount), "");
  dataRow(ws4, r++, "Annual Debt Service", fmt$(d.annualDebtService), "", { bold: true });
  r++;
  ws4.getCell(r, 1).value = "COVERAGE & YIELD"; ws4.getCell(r, 1).font = secFont; r++;
  dataRow(ws4, r++, "DSCR (OM)", fmtX(d.dscrOm), "Target: >1.35x");
  dataRow(ws4, r++, "DSCR (Adjusted)", fmtX(d.dscrAdjusted), "");
  dataRow(ws4, r++, "Cash-on-Cash", fmtPct(d.cashOnCashOm), "");
  dataRow(ws4, r++, "Debt Yield", fmtPct(d.debtYield), "");
  r++;
  ws4.getCell(r, 1).value = "CAP RATES"; ws4.getCell(r, 1).font = secFont; r++;
  dataRow(ws4, r++, "Entry Cap (OM)", fmtPct(d.capRateOm), "");
  if (d.capRateAdjusted) dataRow(ws4, r++, "Entry Cap (Adjusted)", fmtPct(d.capRateAdjusted), "");
  dataRow(ws4, r++, "Price / SF", d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}` : "--", "");
  r++;
  ws4.getCell(r, 1).value = "SIGNALS"; ws4.getCell(r, 1).font = secFont; r++;
  Object.entries(d.signals || {}).forEach(([k, v]) => {
    const isRed = String(v).includes("🔴") || String(v).includes("red");
    dataRow(ws4, r++, k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), String(v), "", isRed ? { red: true } : undefined);
  });

  // ── SHEET 5: Breakeven ──
  const ws5 = wb.addWorksheet("Breakeven");
  r = 2;
  ws5.getCell(r, 1).value = `BREAKEVEN ANALYSIS - ${pName}`; ws5.getCell(r, 1).font = titleFont; r += 2;
  hdrRow(ws5, r, ["Metric", "Value", "Notes"], [40, 22, 34]); r++;
  dataRow(ws5, r++, "Breakeven Occupancy", d.breakevenOccupancy ? `${Number(d.breakevenOccupancy).toFixed(1)}%` : "--", "(Adj OpEx + DS) / Rent");
  dataRow(ws5, r++, "Breakeven Rent / SF", d.breakevenRentPerSf ? `$${Number(d.breakevenRentPerSf).toFixed(2)}` : "--", "");

  // ── SHEET 6: Cap Scenarios ──
  const ws6 = wb.addWorksheet("Cap Scenarios");
  const noi = Number(d.noiAdjusted || d.noiOm) || 0;
  const sf = Number(d.buildingSf) || 1;
  const loan65 = Number(d.loanAmount) || 0;
  r = 2;
  ws6.getCell(r, 1).value = `CAP RATE SCENARIO TABLE - ${pName}`; ws6.getCell(r, 1).font = titleFont; r++;
  ws6.getCell(r, 1).value = `Based on ${d.noiAdjusted ? "adjusted" : "in-place"} NOI of ${fmt$(noi)}`; ws6.getCell(r, 1).font = noteFont; r++;
  hdrRow(ws6, r, ["Cap Rate", "Implied Value", "Price/SF", "Loan Amount (65%)", "Annual DS", "DSCR"], [12, 18, 12, 18, 16, 10]); r++;
  for (let cr = 6.5; cr <= 10; cr += 0.5) {
    const iv = noi / (cr / 100); const loanAmt = iv * 0.65; const pmt = loanAmt > 0 ? (loanAmt * (0.0725 / 12)) / (1 - Math.pow(1 + 0.0725 / 12, -300)) * 12 : 0;
    const dscr = pmt > 0 ? noi / pmt : 0;
    [`${cr.toFixed(1)}%`, fmt$(iv), `$${(iv / sf).toFixed(0)}`, fmt$(loanAmt), fmt$(pmt), `${dscr.toFixed(2)}x`].forEach((v, i) => {
      const c = ws6.getCell(r, i + 1); c.value = v; c.border = borders;
      c.font = i === 0 ? { ...valFont, bold: true } : valFont; c.fill = i === 0 ? ltBlue : white;
    }); r++;
  }

  // Download
  const safeName = pName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${safeName}-Underwriting.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ===========================================================================
   LITE DOWNLOAD - Brief (.doc) - pro-grade multi-section format
   =========================================================================== */
function downloadLiteBrief(d: any) {
  const pName = d.propertyName || "Property";
  const loc = [d.address, d.city, d.state].filter(Boolean).join(", ");
  const tenants = d.tenants || [];
  const noi = Number(d.noiAdjusted || d.noiOm) || 0;
  const sf = Number(d.buildingSf) || 1;

  // Build signal class helper
  function sc(v: string): string { if (String(v).includes("🟢")) return "sg"; if (String(v).includes("🟡")) return "sy"; if (String(v).includes("🔴")) return "sr"; return ""; }

  // Deal snapshot bullets
  const snap: string[] = [];
  if (d.assetType) snap.push(`${d.assetType}${d.buildingSf ? `, ${Math.round(Number(d.buildingSf)).toLocaleString()} SF GLA` : ""}${d.yearBuilt ? `, Year Built ${d.yearBuilt}` : ""}`);
  if (d.occupancyPct) snap.push(`${d.occupancyPct}% occupied${d.tenantCount ? ` - ${d.tenantCount} tenant${Number(d.tenantCount) > 1 ? "s" : ""}` : ""}`);
  if (d.noiOm) snap.push(`In-place NOI ${fmt$(d.noiOm)}${d.noiAdjusted && d.noiAdjusted !== d.noiOm ? ` (adjusted: ${fmt$(d.noiAdjusted)})` : ""}`);
  if (d.askingPrice) snap.push(`Asking price ${fmt$(d.askingPrice)}${d.pricePerSf ? ` ($${Number(d.pricePerSf).toFixed(0)}/SF)` : ""}`);
  if (d.capRateOm) snap.push(`Entry cap rate ${Number(d.capRateOm).toFixed(2)}%`);
  if (d.wale) snap.push(`WALE: ${d.wale} years`);
  if (d.traffic) snap.push(d.traffic);

  // Metrics table rows
  const metrics = [
    ["Asking Price", fmt$(d.askingPrice)],
    ["Price / SF", d.pricePerSf ? `$${Number(d.pricePerSf).toFixed(2)}/SF` : ""],
    ["GLA", d.buildingSf ? `${Math.round(Number(d.buildingSf)).toLocaleString()} SF` : ""],
    ["Occupancy", d.occupancyPct ? `${d.occupancyPct}%` : ""],
    ["In-Place NOI", fmt$(d.noiOm)],
    ["Adjusted NOI", fmt$(d.noiAdjusted)],
    ["DSCR (OM)", d.dscrOm ? `${Number(d.dscrOm).toFixed(2)}x` : ""],
    ["DSCR (Adjusted)", d.dscrAdjusted ? `${Number(d.dscrAdjusted).toFixed(2)}x` : ""],
    ["Cash-on-Cash", d.cashOnCashOm ? `${Number(d.cashOnCashOm).toFixed(2)}%` : ""],
    ["Debt Yield", d.debtYield ? `${Number(d.debtYield).toFixed(2)}%` : ""],
    ["Breakeven Occupancy", d.breakevenOccupancy ? `${Number(d.breakevenOccupancy).toFixed(1)}%` : ""],
  ].filter(([, v]) => v);

  // Signal rows
  const signals = [
    ["Overall Deal", d.signals?.overall], ["Entry Cap Rate", d.signals?.cap_rate],
    ["DSCR", d.signals?.dscr], ["Occupancy Stability", d.signals?.occupancy],
    ["Basis / Price Per SF", d.signals?.basis], ["Tenant Quality", d.signals?.tenant_quality],
    ["Leasing Rollover", d.signals?.rollover_risk],
  ].filter(([, v]) => v) as [string, string][];

  // Cap scenarios
  const capRows: string[] = [];
  for (let cr = 7; cr <= 10; cr += 0.5) {
    const iv = noi / (cr / 100);
    capRows.push(`<tr><td><b>${cr.toFixed(1)}%</b></td><td>${fmt$(iv)}</td><td>$${(iv / sf).toFixed(0)}/SF</td></tr>`);
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
<style>
@page{size:8.5in 11in;margin:0.75in 1in}
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a;line-height:1.6}
h1{font-size:18pt;color:#0B1120;border-bottom:2.5px solid #C49A3C;padding-bottom:8px;margin:0 0 4px 0}
h2{font-size:13pt;color:#253352;margin:22px 0 8px 0;padding-bottom:4px;border-bottom:1px solid #E0E5ED}
h3{font-size:11pt;color:#253352;margin:16px 0 6px 0}
p{margin:5px 0}
.sub{font-size:9.5pt;color:#8899B0;font-style:italic;margin-bottom:16px}
.loc{font-size:10.5pt;color:#555;margin:2px 0 2px 0}
ul{margin:6px 0 6px 18px;padding:0}
li{margin:3px 0;line-height:1.5}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:10pt}
th{background:#262C5C;color:#fff;text-align:left;padding:7px 10px;border:1px solid #262C5C;font-weight:600}
td{padding:5px 10px;border:1px solid #D8DFE9}
.alt{background:#F6F8FB}
.val{font-weight:600}
.sg{color:#059669;font-weight:600}
.sy{color:#D97706;font-weight:600}
.sr{color:#DC2626;font-weight:600}
.note{font-size:9pt;color:#8899B0;font-style:italic}
.footer{margin-top:30px;padding-top:10px;border-top:1px solid #D8DFE9;font-size:8.5pt;color:#8899B0}
</style></head><body>

<h1>FIRST-PASS UNDERWRITING BRIEF</h1>
<h2 style="border:none;margin-top:6px;font-size:15pt;">${pName}</h2>
<p class="loc">${loc}</p>
<p class="sub">First-pass underwriting screen. Directional only &mdash; not a formal recommendation.</p>

${snap.length > 0 ? `<h2>Deal Snapshot</h2><ul>${snap.map(s => `<li>${s}</li>`).join("")}</ul>` : ""}

<h2>Initial Assessment</h2>
${(typeof d.brief === "string" ? d.brief : Array.isArray(d.brief) ? d.brief.join("\n") : String(d.brief || "No assessment available.")).split("\n").map((p: string) => p.trim() ? `<p>${p}</p>` : "").join("")}

<h2>Key Metrics</h2>
<table>
<tr><th>Metric</th><th>Value</th></tr>
${metrics.map(([l, v], i) => `<tr${i % 2 ? ' class="alt"' : ""}><td>${l}</td><td class="val">${v}</td></tr>`).join("")}
</table>

<h2>Signal Assessment</h2>
<table>
<tr><th>Category</th><th>Signal</th></tr>
${signals.map(([l, v], i) => `<tr${i % 2 ? ' class="alt"' : ""}><td>${l}</td><td class="${sc(v)}">${v}</td></tr>`).join("")}
</table>

${tenants.length > 0 ? `<h2>Tenant Summary</h2>
<table>
<tr><th>Tenant</th><th>SF</th><th>Annual Rent</th><th>Type</th><th>Lease End</th><th>Status</th></tr>
${tenants.map((t: any, i: number) => {
  const isRisk = String(t.status || "").toLowerCase().includes("expir") || String(t.status || "").toLowerCase().includes("vacant") || String(t.status || "").toLowerCase().includes("mtm");
  return `<tr${i % 2 ? ' class="alt"' : ""}><td><b>${t.name}</b></td><td>${t.sf ? Number(t.sf).toLocaleString() : ""}</td><td>${t.rent ? fmt$(t.rent) : ""}</td><td>${t.type || ""}</td><td>${t.end || ""}</td><td class="${isRisk ? "sr" : "sg"}">${t.status || ""}</td></tr>`;
}).join("")}
</table>` : ""}

<h2>Cap Rate Scenarios</h2>
<p class="note">Based on ${d.noiAdjusted ? "adjusted" : "in-place"} NOI of ${fmt$(noi)}</p>
<table>
<tr><th>Cap Rate</th><th>Implied Value</th><th>Price/SF</th></tr>
${capRows.join("")}
</table>

<h2>Breakeven Analysis</h2>
<table>
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>Breakeven Occupancy</td><td class="val">${d.breakevenOccupancy ? `${Number(d.breakevenOccupancy).toFixed(1)}%` : "--"}</td></tr>
<tr class="alt"><td>Breakeven Rent / SF</td><td class="val">${d.breakevenRentPerSf ? `$${Number(d.breakevenRentPerSf).toFixed(2)}` : "--"}</td></tr>
</table>

${d.signals?.recommendation ? `<h2>First-Pass Conclusion</h2>
<p><b class="${sc(d.signals.recommendation)}">${d.signals.recommendation}</b></p>` : ""}

<p class="footer">Generated by Deal Signals &mdash; dealsignals.app</p>
</body></html>`;

  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${pName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-")}-First-Pass-Brief.doc`;
  a.click(); URL.revokeObjectURL(url);
}
