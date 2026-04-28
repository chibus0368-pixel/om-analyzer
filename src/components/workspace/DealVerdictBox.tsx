"use client";

/**
 * DealVerdictBox
 *
 * Shared Buy / Neutral / Pass verdict banner, driven by the Quick Screen
 * engine. Renders in two densities:
 *
 *   variant="main"  - Large hero box at the top of the property overview.
 *                     Shows score gauge + full executive-summary rationale.
 *                     This is the single source of truth for the verdict.
 *
 *   variant="slim"  - Short single-line repeat at the top of each Pro
 *                     Analysis tab. Keeps the verdict visible when the tab
 *                     is shared in isolation, without duplicating rationale.
 *
 * Both variants read from the same `runQuickScreen()` call so there is zero
 * chance of the verdict on the main page disagreeing with the verdict
 * repeated inside a tab.
 */

import { useMemo } from "react";
import type { Property, ExtractedField, ScoreBand } from "@/lib/workspace/types";
import {
  runQuickScreen,
  type QuickScreenInput,
  type QuickScreenReport,
  type AssetType,
  type UnitType,
  type Verdict,
} from "@/lib/analysis/quick-screen";
import { useUnderwritingDefaults } from "@/lib/workspace/use-underwriting-defaults";

/** Map the persisted server-side band to the BUY / NEUTRAL / PASS tri-state
 *  the verdict card renders. Strong_buy + buy collapse to BUY, hold is
 *  NEUTRAL, pass + strong_reject collapse to PASS. */
function bandToVerdict(band: ScoreBand | string | undefined | null): Verdict {
  switch (band) {
    case "strong_buy":
    case "buy":
      return "BUY";
    case "pass":
    case "strong_reject":
      return "PASS";
    case "hold":
    default:
      return "NEUTRAL";
  }
}

/* ── Design tokens ────────────────────────────────────── */
const C = {
  onSurface: "#0F172A",
  secondary: "#6B7280",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  radius: 12,
};

function gf(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

function verdictStyle(verdict: Verdict) {
  if (verdict === "BUY") return {
    // Canonical brand green (lime): matches the Pro tab accent, asset pills,
    // and Bull scenario so "positive / good" reads as one color across the app.
    bg: "linear-gradient(135deg, #F7FEE7 0%, #ECFCCB 100%)",
    border: "#BEF264",
    accent: "#365314",
    label: "BUY",
    pill: "#4D7C0F",
    pillBg: "#DCFCE7",
    pillText: "#166534",
    pillBorder: "#86EFAC",
  };
  if (verdict === "PASS") return {
    bg: "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)",
    border: "#FCA5A5",
    accent: "#991B1B",
    label: "PASS",
    pill: "#DC2626",
    pillBg: "#FEE2E2",
    pillText: "#991B1B",
    pillBorder: "#FCA5A5",
  };
  return {
    bg: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
    border: "#FCD34D",
    accent: "#78350F",
    label: "NEUTRAL",
    pill: "#D97706",
    pillBg: "#FEF3C7",
    pillText: "#78350F",
    pillBorder: "#FCD34D",
  };
}

/** Same mapping used by DealQuickScreen. Kept here so the verdict box is
 *  self-contained and can be dropped in anywhere without rewiring. */
function buildQuickScreenInput(
  property: Property,
  fields: ExtractedField[],
  baseline: {
    ltvPct: number; interestRatePct: number; amortYears: number;
    holdYears: number; targetLeveredIrrPct: number;
  },
): QuickScreenInput | null {
  const askingPrice = Number(gf(fields, "pricing_deal_terms", "asking_price"))
    || (property as any)?.cardAskingPrice
    || 0;

  const analysisType = ((property as any)?.analysisType as string | undefined) || "multifamily";
  const assetType: AssetType = (() => {
    switch (analysisType) {
      case "retail": return "retail";
      case "industrial": return "industrial";
      case "office": return "office";
      case "multifamily": return "multifamily";
      case "land": return "land";
      default: return "other";
    }
  })();

  let unitType: UnitType = "sf";
  let unitsOrSf = 0;

  if (assetType === "multifamily") {
    unitType = "units";
    unitsOrSf = Number(gf(fields, "multifamily_addons", "unit_count"))
      || property.suiteCount
      || 0;
  } else {
    unitType = "sf";
    unitsOrSf = Number(gf(fields, "property_basics", "building_sf"))
      || property.buildingSf
      || (property as any)?.cardBuildingSf
      || 0;
  }

  if (!askingPrice || !unitsOrSf) return null;

  const noi = Number(gf(fields, "expenses", "noi_om"))
    || Number(gf(fields, "expenses", "noi_adjusted"))
    || (property as any)?.cardNoi
    || null;

  const statedCapRate = Number(gf(fields, "pricing_deal_terms", "cap_rate_om"))
    || (property as any)?.cardCapRate
    || null;

  const occupancy = Number(gf(fields, "property_basics", "occupancy_pct"))
    || property.occupancyPct
    || null;

  const yearBuilt = Number(gf(fields, "property_basics", "year_built"))
    || property.yearBuilt
    || null;

  const marketRent = assetType === "multifamily"
    ? Number(gf(fields, "multifamily_addons", "avg_rent_per_unit")) || null
    : null;

  return {
    purchasePrice: askingPrice,
    unitsOrSf,
    unitType,
    assetType,
    market: property.market,
    submarket: property.submarket,
    city: property.city,
    state: property.state,
    noi,
    occupancyPct: occupancy,
    marketRentPerUnit: marketRent,
    inPlaceRentPerUnit: marketRent,
    statedCapRatePct: statedCapRate,
    yearBuilt,
    ltv: baseline.ltvPct / 100,
    interestRatePct: baseline.interestRatePct,
    amortYears: baseline.amortYears,
    holdYears: baseline.holdYears,
    targetIrrPct: baseline.targetLeveredIrrPct,
  };
}

export interface DealVerdictBoxProps {
  property: Property;
  fields: ExtractedField[];
  variant?: "main" | "slim";
  /**
   * Optional investment-thesis brief (LLM-generated JSON string with
   * `overview`, `strengths`, `concerns`). When provided on the main
   * variant, its overview replaces the short engine summary line and
   * the strengths/concerns render as a two-column list below the KPIs.
   */
  brief?: string | null;
  /**
   * Server-persisted score / band from the asset-type-aware score engine.
   * When provided, overrides the client Quick Screen score so every
   * surface (properties list, hero badge, verdict card) agrees. If null,
   * the verdict card falls back to the live Quick Screen computation.
   */
  scoreTotal?: number | null;
  scoreBand?: ScoreBand | string | null;
}

interface ParsedBrief {
  overview?: string;
  strengths?: string[];
  concerns?: string[];
}

function parseBrief(raw?: string | null): ParsedBrief | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj.overview === "string") return obj as ParsedBrief;
  } catch { /* legacy plain text */ }
  return { overview: trimmed };
}

export default function DealVerdictBox({ property, fields, variant = "main", brief, scoreTotal, scoreBand }: DealVerdictBoxProps) {
  const workspaceId = property.workspaceId || null;
  const { defaults, loaded: baselineLoaded } = useUnderwritingDefaults(workspaceId);

  const baseline = useMemo(() => ({
    ltvPct: defaults.ltv,
    interestRatePct: defaults.interestRate,
    amortYears: defaults.amortYears,
    holdYears: defaults.holdYears,
    targetLeveredIrrPct: defaults.targetLeveredIrr,
  }), [defaults]);

  const input = useMemo(
    () => buildQuickScreenInput(property, fields, baseline),
    [property, fields, baseline],
  );
  const report: QuickScreenReport | null = useMemo(
    () => (input ? runQuickScreen(input) : null),
    [input],
  );
  const parsedBrief = useMemo(() => parseBrief(brief), [brief]);

  if (!input || !report) {
    // Quiet empty state. Main page keeps its normal layout; tabs don't need
    // a second "waiting on inputs" card since the tab body will show one.
    if (variant === "slim") return null;

    // Land deals don't fit the per-unit / per-SF Quick Screen model
    // (price/acre + entitlement timing matter, not NOI/unit). Show a
    // land-specific message instead of pretending we'll auto-screen
    // it once a unit count appears.
    const isLand = ((property as any)?.analysisType || "").toLowerCase() === "land";

    return (
      <div style={{
        background: "#fff",
        border: `1px dashed ${C.ghost}`,
        borderRadius: C.radius,
        padding: 20,
        marginBottom: 16,
        fontSize: 13,
        color: C.secondary,
        lineHeight: 1.5,
      }}>
        {isLand ? (
          <>
            <strong style={{ color: C.onSurface }}>Land deal — no auto-verdict.</strong>{" "}
            Quick Screen runs on building cash flow and doesn&apos;t apply to raw land.
            See <strong>Offer Scenarios</strong> for price/acre and reverse-pricing math, and
            the <strong>Rent Roll</strong> tab is hidden for land deals as expected.
          </>
        ) : (
          <>
            <strong style={{ color: C.onSurface }}>Verdict pending.</strong>{" "}
            The screen needs at least an asking price and unit count (or building SF).
            Re-upload a more detailed OM, or click the property name / address /
            metric values above to edit them inline.
          </>
        )}
      </div>
    );
  }

  // Prefer the server-side persisted score when available. That score is
  // asset-type-aware (scoreByType dispatches by analysisType) and is the
  // same number every other surface in the app reads from. Fall back to
  // the live Quick Screen score only when no persisted score exists.
  const effectiveScore: number = scoreTotal != null ? scoreTotal : report.score;
  const effectiveVerdict: Verdict = scoreBand ? bandToVerdict(scoreBand) : report.verdict;

  const v = verdictStyle(effectiveVerdict);
  const scoreColor = effectiveVerdict === "BUY" ? "#4D7C0F"
    : effectiveVerdict === "PASS" ? "#DC2626"
    : "#D97706";

  const modeLine = `${report.dealScale === "small-operator" ? "Small Operator Mode" : "Institutional Mode"}${baselineLoaded ? "" : " · Loading baseline..."}`;

  if (variant === "slim") {
    // One-line strip. No gauge, no rationale prose. Just the verdict pill
    // plus mode so the reader who jumped straight to a deep tab still
    // knows the current read on the deal.
    return (
      <div style={{
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: 10,
        padding: "8px 14px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <span style={{
          padding: "3px 10px",
          background: v.pillBg,
          color: v.pillText,
          border: `1px solid ${v.pillBorder}`,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.1,
          borderRadius: 999,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>{v.label}</span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.7,
          color: v.accent,
          textTransform: "uppercase",
          opacity: 0.8,
        }}>{modeLine}</span>
        <span style={{
          marginLeft: "auto",
          fontSize: 11,
          fontWeight: 600,
          color: v.accent,
          opacity: 0.75,
        }}>
          Score <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{effectiveScore}</span>/100
        </span>
      </div>
    );
  }

  // Main variant: hero banner. Score gauge + verdict + four headline KPIs
  // that matter for the current asset class. The Pro Analysis tabs below
  // own the detail; this card is the 3-second read.
  const cap = report.snapshot.goingInCapRatePct;
  const dscr = report.snapshot.dscr;
  const askVsRepl = report.snapshot.askVsReplacementCostPct;
  const baseIrr = report.scenarios.find(s => s.label === "Base")?.leveredIrrPct ?? null;

  const kpis = [
    {
      label: "Going-in Cap",
      value: cap != null ? `${cap.toFixed(2)}%` : "--",
      tone: cap == null ? "neutral" : cap >= 6.5 ? "good" : cap >= 5.0 ? "warn" : "bad",
    },
    {
      label: "DSCR",
      value: dscr != null ? `${dscr.toFixed(2)}x` : "--",
      tone: dscr == null ? "neutral" : dscr >= 1.30 ? "good" : dscr >= 1.15 ? "warn" : "bad",
    },
    {
      label: "Price / Replacement",
      value: askVsRepl != null ? `${Math.round(askVsRepl)}%` : "--",
      tone: askVsRepl == null ? "neutral" : askVsRepl <= 90 ? "good" : askVsRepl <= 105 ? "warn" : "bad",
    },
    {
      label: "Base IRR",
      value: baseIrr != null ? `${baseIrr.toFixed(1)}%` : "--",
      tone: baseIrr == null ? "neutral" : baseIrr >= 15 ? "good" : baseIrr >= 10 ? "warn" : "bad",
    },
  ];

  const toneColor = (t: string) => t === "good" ? "#4D7C0F" : t === "warn" ? "#D97706" : t === "bad" ? "#DC2626" : "#475569";

  return (
    <div style={{
      background: "#FFFFFF",
      border: `1px solid ${C.ghost}`,
      borderLeft: `4px solid ${v.pill}`,
      borderRadius: C.radius,
      padding: "22px 24px",
      marginBottom: 12,
      boxShadow: "0 2px 10px rgba(15,23,43,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{
          width: 74, height: 74, borderRadius: "50%",
          background: `conic-gradient(${scoreColor} ${(effectiveScore / 100) * 360}deg, ${C.ghost} 0deg)`,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <div style={{
            width: 58, height: 58, borderRadius: "50%", background: "#fff",
            display: "grid", placeItems: "center",
            fontSize: 22, fontWeight: 800, color: scoreColor,
            fontVariantNumeric: "tabular-nums",
          }}>{effectiveScore}</div>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{
              padding: "6px 14px",
              background: v.pillBg,
              color: v.pillText,
              border: `1px solid ${v.pillBorder}`,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.2,
              borderRadius: 999,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}>{v.label}</span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              color: C.secondary,
              textTransform: "uppercase",
            }}>{modeLine}</span>
          </div>
          <div style={{
            marginTop: 10,
            fontSize: 14,
            lineHeight: 1.6,
            color: C.onSurface,
            fontWeight: 500,
          }}>{parsedBrief?.overview || report.executiveSummary}</div>
        </div>
      </div>

      {/* Four-KPI headline strip. Same numbers the tabs render in detail. */}
      <div style={{
        marginTop: 18,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
        background: "#F9FAFB",
        border: `1px solid ${C.ghostBorder}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}>
        {kpis.map(k => (
          <div key={k.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              color: C.secondary,
              textTransform: "uppercase",
            }}>{k.label}</div>
            <div style={{
              fontSize: 20,
              fontWeight: 800,
              color: toneColor(k.tone),
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
            }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Strengths / Concerns from the investment-thesis brief. Two columns
          on wide screens, stacked on narrow. Rendered only when the brief
          provides them. */}
      {parsedBrief && ((parsedBrief.strengths?.length ?? 0) > 0 || (parsedBrief.concerns?.length ?? 0) > 0) && (
        <div style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}>
          {parsedBrief.strengths && parsedBrief.strengths.length > 0 && (
            <div>
              <div style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.9,
                color: "#15803D",
                textTransform: "uppercase",
                marginBottom: 8,
              }}>Key Strengths</div>
              {parsedBrief.strengths.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ color: "#22C55E", fontSize: 14, lineHeight: "20px", flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: "#374151", lineHeight: "20px" }}>{s}</span>
                </div>
              ))}
            </div>
          )}
          {parsedBrief.concerns && parsedBrief.concerns.length > 0 && (
            <div>
              <div style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.9,
                color: "#B45309",
                textTransform: "uppercase",
                marginBottom: 8,
              }}>Primary Concerns</div>
              {parsedBrief.concerns.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ color: "#F59E0B", fontSize: 14, lineHeight: "20px", flexShrink: 0 }}>△</span>
                  <span style={{ fontSize: 13, color: "#374151", lineHeight: "20px" }}>{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
