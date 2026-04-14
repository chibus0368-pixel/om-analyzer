"use client";

import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, getPropertyExtractedFields } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { AnalysisTypeIcon } from "@/lib/workspace/AnalysisTypeIcon";
import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Field mapping & formatting (unchanged) ──
const FIELD_MAP: Record<string, string[]> = {
  address: ["property_basics.address", "property_basics.city"],
  asset_type: ["property_basics.asset_type"],
  year_built: ["property_basics.year_built"],
  building_sf: ["property_basics.building_sf"],
  units: ["property_basics.tenant_count", "rent_roll.num_tenants"],
  occupancy: ["property_basics.occupancy_pct"],
  lease_type: ["property_basics.wale_years"],
  asking_price: ["pricing_deal_terms.asking_price"],
  price_sf: ["pricing_deal_terms.price_per_sf"],
  in_place_rent: ["income.base_rent", "income.gross_scheduled_income"],
  noi: ["expenses.noi_om", "expenses.noi", "expenses.noi_adjusted"],
  adjusted_noi: ["expenses.noi_adjusted"],
  cap_rate: ["pricing_deal_terms.cap_rate_om", "pricing_deal_terms.cap_rate_adjusted"],
  debt_service: ["debt_assumptions.annual_debt_service"],
  dscr: ["debt_assumptions.dscr_om", "debt_assumptions.dscr", "debt_assumptions.dscr_adjusted"],
  dscr_adjusted: ["debt_assumptions.dscr_adjusted"],
  debt_yield: ["debt_assumptions.debt_yield"],
  coc: ["returns.cash_on_cash_om", "returns.cash_on_cash", "returns.cash_on_cash_adjusted"],
  breakeven: ["returns.breakeven_occupancy"],
  anchor: ["rent_roll.anchor_tenant"],
  shadow_anchor: ["property_basics.shadow_anchor"],
  at_risk_gla: ["rent_roll.at_risk_gla"],
  lease_term: ["property_basics.wale_years", "rent_roll.weighted_avg_lease_term"],
  rent_psf: ["income.rent_per_sf", "rent_roll.avg_rent_psf"],
  median_hh_income: ["property_basics.median_hh_income"],
  traffic: ["property_basics.traffic"],
  ai_summary: ["signals.overall_signal", "signals.overall"],
  ai_recommendation: ["signals.recommendation"],
};

const METRIC_SECTIONS = [
  { section: "Property Info", rows: [
    { key: "address", label: "Address" }, { key: "asset_type", label: "Asset Type" },
    { key: "year_built", label: "Year Built" }, { key: "building_sf", label: "GLA (SF)" },
    { key: "units", label: "# Units / Tenants" }, { key: "occupancy", label: "Occupancy" },
    { key: "lease_type", label: "Lease Type" },
  ]},
  { section: "Pricing & Returns", rows: [
    { key: "asking_price", label: "Asking Price" }, { key: "price_sf", label: "Price / SF" },
    { key: "in_place_rent", label: "In-Place Rent" }, { key: "noi", label: "In-Place NOI" },
    { key: "adjusted_noi", label: "Adjusted NOI" }, { key: "cap_rate", label: "Entry Cap" },
  ]},
  { section: "Debt & Coverage", rows: [
    { key: "debt_service", label: "Debt Service" }, { key: "dscr", label: "DSCR" },
    { key: "dscr_adjusted", label: "DSCR (adj)" }, { key: "debt_yield", label: "Debt Yield" },
    { key: "coc", label: "Cash-on-Cash" }, { key: "breakeven", label: "Breakeven Occ." },
  ]},
  { section: "Tenant & Risk", rows: [
    { key: "anchor", label: "Anchor Tenant" }, { key: "lease_term", label: "WALE" },
    { key: "rent_psf", label: "Avg Rent / SF" }, { key: "traffic", label: "Traffic" },
  ]},
  { section: "AI Analysis", rows: [
    { key: "ai_summary", label: "Deal Summary" }, { key: "ai_recommendation", label: "AI Recommendation" },
  ]},
];

const FORMAT_MAP: Record<string, "dollar" | "percent" | "sf" | "ratio" | "text" | "number"> = {
  asking_price: "dollar", price_sf: "dollar", in_place_rent: "dollar", noi: "dollar",
  adjusted_noi: "dollar", debt_service: "dollar",
  cap_rate: "percent", breakeven: "percent", occupancy: "percent",
  coc: "percent", debt_yield: "percent",
  dscr: "ratio", dscr_adjusted: "ratio",
  building_sf: "sf", units: "number", year_built: "text",
};

function formatValue(key: string, raw: string): string {
  if (!raw) return "";
  const n = Number(raw);
  const fmt = FORMAT_MAP[key];
  if (isNaN(n) || fmt === "text" || !fmt) return raw;
  switch (fmt) {
    case "dollar":
      if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
      if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
      return `$${n.toFixed(2)}`;
    case "percent": return `${n.toFixed(1)}%`;
    case "ratio": return `${n.toFixed(2)}x`;
    case "sf": return `${Math.round(n).toLocaleString()} SF`;
    case "number": return Math.round(n).toLocaleString();
    default: return raw;
  }
}

function getFieldValue(fields: ExtractedField[], keys: string[]): string {
  for (const key of keys) {
    const [group, name] = key.split(".");
    const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
    if (f) {
      const val = f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
      if (val !== null && val !== undefined && val !== "") return String(val);
    }
  }
  return "";
}

interface PropertyData {
  property: Property;
  values: Map<string, string>;
}

// ── Band config ──
const BAND_CONFIG: Record<string, { label: string; color: string; bg: string; barColor: string }> = {
  strong_buy:    { label: "Strong Buy",    color: "#059669", bg: "#ECFDF5", barColor: "#10B981" },
  buy:           { label: "Buy",           color: "#0A7E5A", bg: "#ECFDF5", barColor: "#34D399" },
  hold:          { label: "Neutral",       color: "#D97706", bg: "#FFFBEB", barColor: "#FBBF24" },
  pass:          { label: "Pass",          color: "#DC2626", bg: "#FEF2F2", barColor: "#F87171" },
  strong_reject: { label: "Strong Reject", color: "#991B1B", bg: "#FEF2F2", barColor: "#EF4444" },
};

function getThresholdColor(key: string, n: number): { color: string; bg: string } | null {
  if (isNaN(n)) return null;
  const g = { color: "#059669", bg: "rgba(16,185,129,0.08)" };
  const y = { color: "#D97706", bg: "rgba(217,119,6,0.06)" };
  const r = { color: "#DC2626", bg: "rgba(220,38,38,0.06)" };
  if (key === "cap_rate") return n >= 8 ? g : n >= 7 ? y : r;
  if (key === "dscr" || key === "dscr_adjusted") return n >= 1.35 ? g : n >= 1.2 ? y : r;
  if (key === "occupancy") return n >= 90 ? g : n >= 80 ? y : r;
  if (key === "coc") return n >= 8 ? g : n >= 6 ? y : r;
  if (key === "debt_yield") return n >= 10 ? g : n >= 8 ? y : r;
  if (key === "breakeven") return n <= 75 ? g : n <= 85 ? y : r;
  return null;
}

// ══════════════════════════════════════════════════════════════
// SCORE DISTRIBUTION MINI-CHART
// ══════════════════════════════════════════════════════════════
function ScoreDistribution({ data }: { data: PropertyData[] }) {
  const scored = data.filter(d => ((d.property as any).scoreTotal || 0) > 0);
  if (scored.length < 2) return null;

  // Bucket into bands
  const buckets = { "85-100": 0, "70-84": 0, "50-69": 0, "30-49": 0, "0-29": 0 };
  const bucketColors = { "85-100": "#10B981", "70-84": "#34D399", "50-69": "#FBBF24", "30-49": "#F87171", "0-29": "#EF4444" };
  const bucketLabels = { "85-100": "Strong Buy", "70-84": "Buy", "50-69": "Neutral", "30-49": "Pass", "0-29": "Reject" };

  scored.forEach(d => {
    const s = (d.property as any).scoreTotal || 0;
    if (s >= 85) buckets["85-100"]++;
    else if (s >= 70) buckets["70-84"]++;
    else if (s >= 50) buckets["50-69"]++;
    else if (s >= 30) buckets["30-49"]++;
    else buckets["0-29"]++;
  });

  const max = Object.values(buckets).reduce((a, b) => (a > b ? a : b), 1);

  return (
    <div style={{
      background: "#fff", borderRadius: 6, border: "1px solid rgba(227, 190, 189, 0.15)",
      padding: "16px 20px", marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#585e70", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
        Score Distribution
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 48 }}>
        {(Object.keys(buckets) as (keyof typeof buckets)[]).map(key => (
          <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: buckets[key] > 0 ? "#151b2b" : "#D8DFE9" }}>
              {buckets[key] > 0 ? buckets[key] : ""}
            </div>
            <div style={{
              width: "100%", borderRadius: 4, minHeight: 4,
              height: `${(buckets[key] / max) * 36}px`,
              background: buckets[key] > 0 ? bucketColors[key] : "#F0F2F5",
              transition: "height 0.3s ease",
            }} />
            <div style={{ fontSize: 9, color: "#585e70", fontWeight: 600, whiteSpace: "nowrap" }}>
              {bucketLabels[key]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// LEADERBOARD ROW
// ══════════════════════════════════════════════════════════════
function LeaderboardRow({ pd, rank, totalCount, maxScore, expanded, onToggle }: {
  pd: PropertyData; rank: number; totalCount: number; maxScore: number; expanded: boolean; onToggle: () => void;
}) {
  const score = (pd.property as any).scoreTotal || 0;
  const scoreBand = (pd.property as any).scoreBand || "";
  const config = BAND_CONFIG[scoreBand] || BAND_CONFIG.hold;
  const location = [pd.property.city, pd.property.state].filter(Boolean).join(", ");

  const askingPrice = pd.values.get("asking_price");
  const capRate = pd.values.get("cap_rate");
  const noi = pd.values.get("noi");
  const occupancy = pd.values.get("occupancy");
  const sf = pd.values.get("building_sf");
  const dscr = pd.values.get("dscr");
  // Use Score API recommendation (property-specific) as primary, AI summary as fallback
  const recommendation = (pd.property as any).recommendation || pd.values.get("ai_summary") || pd.values.get("ai_recommendation") || "";

  // SVG score ring
  const ringSize = 52;
  const strokeWidth = 4;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score > 0 ? Math.min(score / 100, 1) : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <div style={{ borderBottom: "1px solid #F0F2F5" }}>
      {/* Main row */}
      <div
        onClick={onToggle}
        className="sb-leaderboard-row"
        style={{
          display: "grid",
          gridTemplateColumns: "26px 64px 1fr auto 28px",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          cursor: "pointer",
          background: expanded ? "#faf8ff" : "#fff",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "#faf8ff"; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "#fff"; }}
      >
        {/* Rank */}
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: rank <= 3 ? "#151b2b" : "#F0F2F5",
          color: rank <= 3 ? "#C49A3C" : "#585e70",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, flexShrink: 0,
        }}>
          {rank}
        </div>

        {/* Score Ring */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          <div style={{ position: "relative", width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} style={{ transform: "rotate(-90deg)" }}>
              {/* Background circle */}
              <circle cx={ringSize / 2} cy={ringSize / 2} r={radius}
                fill="none" stroke="#F0F2F5" strokeWidth={strokeWidth} />
              {/* Score arc */}
              {score > 0 && (
                <circle cx={ringSize / 2} cy={ringSize / 2} r={radius}
                  fill="none" stroke={config.barColor} strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              )}
            </svg>
            {/* Score number centered */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column",
            }}>
              <div style={{
                fontSize: 18, fontWeight: 900, lineHeight: 1,
                color: score > 0 ? config.color : "#D8DFE9",
              }}>
                {score > 0 ? score : "--"}
              </div>
            </div>
          </div>
          {/* Band label under ring */}
          {score > 0 && (
            <div style={{
              fontSize: 9, fontWeight: 800, color: config.color,
              textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2,
              whiteSpace: "nowrap",
            }}>
              {config.label}
            </div>
          )}
        </div>

        {/* Name + Location + inline metrics */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Link href={`/workspace/properties/${pd.property.id}`}
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 14, fontWeight: 700, color: "#151b2b", textDecoration: "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {cleanDisplayName(pd.property.propertyName, pd.property.address1, pd.property.city, pd.property.state)}
            </Link>
          </div>
          {location && (
            <div style={{ fontSize: 12, color: "#585e70", marginBottom: 6 }}>{location}</div>
          )}
          {/* Inline key metrics */}
          <div className="sb-inline-metrics" style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
            {askingPrice && (
              <InlineMetric label="Price" value={formatValue("asking_price", askingPrice)} />
            )}
            {capRate && (
              <InlineMetric label="Cap" value={formatValue("cap_rate", capRate)}
                thColor={getThresholdColor("cap_rate", Number(capRate))?.color} />
            )}
            {noi && (
              <InlineMetric label="NOI" value={formatValue("noi", noi)} />
            )}
            {occupancy && (
              <InlineMetric label="Occ" value={formatValue("occupancy", occupancy)}
                thColor={getThresholdColor("occupancy", Number(occupancy))?.color} />
            )}
            {dscr && (
              <InlineMetric label="DSCR" value={formatValue("dscr", dscr)}
                thColor={getThresholdColor("dscr", Number(dscr))?.color} />
            )}
            {(() => {
              const vaVal = (pd.property as any).valueAddScore;
              if (vaVal === undefined || vaVal === null) return null;
              const va = Number(vaVal);
              const vaEmoji = va >= 7 ? "📈" : va >= 4 ? "📊" : "〰️";
              return <InlineMetric label="Value-Add" value={`${vaEmoji} ${va}/10`}
                thColor={va >= 7 ? "#059669" : va >= 4 ? "#D97706" : "#6B7280"} />;
            })()}
          </div>
          {/* Recommendation blurb - from Score API, stripped of emojis */}
          {recommendation && (
            <div style={{
              fontSize: 12, color: "#585e70", marginTop: 4, lineHeight: 1.4,
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
            }}>
              {recommendation.replace(/🟢|🟡|🔴/g, "").trim()}
              {totalCount > 1 && score > 0 && (
                <span style={{ color: "#84CC16", fontWeight: 600 }}> · Rank {rank}/{totalCount}</span>
              )}
            </div>
          )}
        </div>

        {/* Mini sparkline bar (compact) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          {askingPrice && (
            <div style={{ fontSize: 15, fontWeight: 800, color: "#151b2b", whiteSpace: "nowrap" }}>
              {formatValue("asking_price", askingPrice)}
            </div>
          )}
          {capRate && (
            <div style={{
              fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              color: getThresholdColor("cap_rate", Number(capRate))?.color || "#585e70",
            }}>
              {formatValue("cap_rate", capRate)} cap
            </div>
          )}
        </div>

        {/* Expand chevron */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#585e70" strokeWidth="2" strokeLinecap="round"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="sb-expanded-detail" style={{
          padding: "0 16px 16px 52px",
          background: "#faf8ff",
          animation: "slideDown 0.2s ease",
        }}>
          <div className="sb-metric-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "10px 20px",
            padding: "12px 16px",
            background: "#fff",
            borderRadius: 10,
            border: "1px solid rgba(227, 190, 189, 0.15)",
          }}>
            <MetricCell label="Cap Rate" value={capRate} fmtKey="cap_rate" />
            <MetricCell label="NOI" value={noi} fmtKey="noi" />
            <MetricCell label="Occupancy" value={occupancy} fmtKey="occupancy" />
            <MetricCell label="Price/SF" value={pd.values.get("price_sf")} fmtKey="price_sf" />
            <MetricCell label="DSCR" value={dscr} fmtKey="dscr" />
            <MetricCell label="Cash-on-Cash" value={pd.values.get("coc")} fmtKey="coc" />
            <MetricCell label="Size" value={sf} fmtKey="building_sf" />
            <MetricCell label="Debt Yield" value={pd.values.get("debt_yield")} fmtKey="debt_yield" />
            <MetricCell label="Breakeven" value={pd.values.get("breakeven")} fmtKey="breakeven" />
            <MetricCell label="WALE" value={pd.values.get("lease_term")} fmtKey="lease_term" />
            <MetricCell label="Year Built" value={pd.values.get("year_built")} fmtKey="year_built" />
            <MetricCell label="Traffic" value={pd.values.get("traffic")} fmtKey="traffic" />
          </div>

          {/* AI Analysis row */}
          {(pd.values.get("ai_summary") || pd.values.get("ai_recommendation")) && (
            <div style={{
              marginTop: 8, padding: "10px 16px", background: "#fff",
              borderRadius: 10, border: "1px solid rgba(227, 190, 189, 0.15)",
            }}>
              {pd.values.get("ai_summary") && (
                <div style={{ marginBottom: pd.values.get("ai_recommendation") ? 8 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#585e70", textTransform: "uppercase", marginBottom: 2 }}>Deal Summary</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#151b2b", lineHeight: 1.5 }}>
                    {(pd.values.get("ai_summary") || "").replace(/🟢|🟡|🔴/g, "").trim()}
                  </div>
                </div>
              )}
              {pd.values.get("ai_recommendation") && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#585e70", textTransform: "uppercase", marginBottom: 2 }}>AI Recommendation</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#151b2b", lineHeight: 1.5 }}>
                    {(pd.values.get("ai_recommendation") || "").replace(/🟢|🟡|🔴/g, "").trim()}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <Link href={`/workspace/properties/${pd.property.id}`} style={{
              fontSize: 12, fontWeight: 600, color: "#C49A3C", textDecoration: "none",
            }}>
              View Full Details →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function InlineMetric({ label, value, thColor }: { label: string; value: string; thColor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "#585e70", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: thColor || "#151b2b" }}>{value}</span>
    </div>
  );
}

function MetricCell({ label, value, fmtKey }: { label: string; value?: string; fmtKey: string }) {
  const formatted = value ? formatValue(fmtKey, value) : "--";
  const n = Number(value);
  const threshold = value && !isNaN(n) ? getThresholdColor(fmtKey, n) : null;

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#585e70", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 1 }}>
        {label}
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700,
        color: formatted === "--" ? "#D8DFE9" : threshold?.color || "#151b2b",
      }}>
        {formatted}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// EXCEL EXPORT (kept compact)
// ══════════════════════════════════════════════════════════════
const XL = {
  navy: "FF0B1120", gold: "FFC49A3C", white: "FFFFFFFF", offWhite: "FFF6F8FB",
  lightGray: "FFEDF0F5", midGray: "FF8899B0", darkText: "FF253352",
  inputBlue: "FF0000FF", formulaBlack: "FF000000",
  greenBg: "FFE6F9F0", greenText: "FF059669",
  yellowBg: "FFFEF3C7", yellowText: "FFD97706",
  redBg: "FFFEE2E2", redText: "FFDC2626",
};
const INPUT_KEYS = new Set(["asking_price", "noi", "adjusted_noi", "in_place_rent", "occupancy", "debt_service", "building_sf"]);
const NUMERIC_KEYS = new Set(Object.keys(FORMAT_MAP));
const XL_FMT: Record<string, string> = { dollar: '$#,##0;($#,##0);"-"', percent: '0.00%', ratio: '0.00"x"', sf: '#,##0" SF"', number: '#,##0' };

function colLetter(idx: number): string {
  let s = "", n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

async function exportToXlsx(propertyData: PropertyData[], workspaceName: string) {
  try {
    const excelMod = await import("exceljs");
    const ExcelJS = excelMod.default || excelMod;
    const fileSaverMod = await import("file-saver");
    const saveAs = fileSaverMod.saveAs || fileSaverMod.default?.saveAs;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Deal Signals";
    const ws = wb.addWorksheet("Deal Scoreboard", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
    const propCount = propertyData.length;

    ws.mergeCells(1, 1, 1, 1 + propCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `${workspaceName || "Deal"} Scoreboard`;
    titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: XL.white } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.navy } };
    titleCell.alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(1).height = 32;

    ws.getCell(2, 1).value = "Metric";
    ws.getCell(2, 1).font = { name: "Arial", size: 10, bold: true, color: { argb: XL.white } };
    ws.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.navy } };
    ws.getColumn(1).width = 24;

    propertyData.forEach((pd, i) => {
      const col = i + 2;
      const cell = ws.getCell(2, col);
      cell.value = pd.property.propertyName;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: XL.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.navy } };
      cell.alignment = { horizontal: "center", wrapText: true };
      ws.getColumn(col).width = 22;
    });

    const cellRef: Record<string, Record<number, string>> = {};
    let row = 3;

    for (const section of METRIC_SECTIONS) {
      ws.mergeCells(row, 1, row, 1 + propCount);
      const secCell = ws.getCell(row, 1);
      secCell.value = section.section;
      secCell.font = { name: "Arial", size: 10, bold: true, color: { argb: XL.darkText } };
      secCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.offWhite } };
      row++;

      for (const metric of section.rows) {
        const labelCell = ws.getCell(row, 1);
        labelCell.value = metric.label;
        labelCell.font = { name: "Arial", size: 10, color: { argb: XL.midGray } };
        cellRef[metric.key] = {};

        propertyData.forEach((pd, i) => {
          const col = i + 2;
          const cell = ws.getCell(row, col);
          const raw = pd.values.get(metric.key) || "";
          cellRef[metric.key][i] = `${colLetter(col - 1)}${row}`;
          const isInput = INPUT_KEYS.has(metric.key);
          const fmt = FORMAT_MAP[metric.key];
          const num = Number(raw);

          if (raw && !isNaN(num) && NUMERIC_KEYS.has(metric.key)) {
            cell.value = fmt === "percent" ? num / 100 : num;
            if (fmt && XL_FMT[fmt]) cell.numFmt = XL_FMT[fmt];
          } else { cell.value = raw || ""; }

          cell.font = { name: "Arial", size: 10, color: { argb: isInput ? XL.inputBlue : XL.formulaBlack }, bold: isInput };
          cell.alignment = { horizontal: "center" };
          if (isInput && raw) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFDE7" } };

          if (!isNaN(num) && raw) {
            let bg = "", fg = "";
            if (metric.key === "cap_rate") { if (num >= 8) { bg = XL.greenBg; fg = XL.greenText; } else if (num >= 7) { bg = XL.yellowBg; fg = XL.yellowText; } else { bg = XL.redBg; fg = XL.redText; } }
            else if (metric.key === "dscr" || metric.key === "dscr_adjusted") { if (num >= 1.35) { bg = XL.greenBg; fg = XL.greenText; } else if (num >= 1.2) { bg = XL.yellowBg; fg = XL.yellowText; } else { bg = XL.redBg; fg = XL.redText; } }
            else if (metric.key === "occupancy") { if (num >= 90) { bg = XL.greenBg; fg = XL.greenText; } else if (num >= 80) { bg = XL.yellowBg; fg = XL.yellowText; } else { bg = XL.redBg; fg = XL.redText; } }
            if (bg) { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } }; cell.font = { ...cell.font, color: { argb: fg } }; }
          }
          cell.border = { bottom: { style: "hair", color: { argb: XL.lightGray } } };
        });
        labelCell.border = { bottom: { style: "hair", color: { argb: XL.lightGray } } };
        row++;
      }
    }

    // Formula rows
    row++;
    ws.mergeCells(row, 1, row, 1 + propCount);
    ws.getCell(row, 1).value = "Scenario Formulas";
    ws.getCell(row, 1).font = { name: "Arial", size: 10, bold: true, color: { argb: XL.gold } };
    ws.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.navy } };
    row++;

    const formulas = [
      { label: "Calc. Cap Rate", num: "noi", den: "asking_price", fmt: "0.00%" },
      { label: "Calc. Price/SF", num: "asking_price", den: "building_sf", fmt: "$#,##0.00" },
      { label: "Calc. DSCR", num: "noi", den: "debt_service", fmt: '0.00"x"' },
    ];
    for (const f of formulas) {
      ws.getCell(row, 1).value = f.label;
      ws.getCell(row, 1).font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
      propertyData.forEach((_, i) => {
        const col = i + 2, cell = ws.getCell(row, col);
        const nRef = cellRef[f.num]?.[i], dRef = cellRef[f.den]?.[i];
        if (nRef && dRef) {
          cell.value = { formula: `IF(OR(${dRef}=0,${dRef}=""),"",${nRef}/${dRef})` };
          cell.numFmt = f.fmt;
          cell.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
          cell.alignment = { horizontal: "center" };
        }
      });
      row++;
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `${workspaceName || "scoreboard"}-deals.xlsx`);
  } catch (err: any) {
    console.error("[Scoreboard] XLS export failed:", err);
    alert(`Export failed: ${err?.message || "Unknown error"}.`);
  }
}


// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
type SortKey = "score" | "name" | "price" | "cap_rate" | "noi" | "gla" | "value_add" | "signal" | "lens";
type SortDir = "asc" | "desc";
type ViewMode = "leaderboard" | "comparison";

export default function ScoreboardPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const [propertyData, setPropertyData] = useState<PropertyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<ViewMode>("comparison");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreProgress, setRescoreProgress] = useState("");
  const [filterAssetType, setFilterAssetType] = useState<string | null>(null);
  const [filterScoreRange, setFilterScoreRange] = useState<string | null>(null);
  const [showAssetTypeDropdown, setShowAssetTypeDropdown] = useState(false);
  const [showScoreRangeDropdown, setShowScoreRangeDropdown] = useState(false);
  const assetTypeRef = useRef<HTMLDivElement>(null);
  const scoreRangeRef = useRef<HTMLDivElement>(null);

  // Click-outside for filter dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (assetTypeRef.current && !assetTypeRef.current.contains(e.target as Node)) setShowAssetTypeDropdown(false);
      if (scoreRangeRef.current && !scoreRangeRef.current.contains(e.target as Node)) setShowScoreRangeDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortBy(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  // Re-score properties that are missing scores
  const rescoreAll = async () => {
    if (!user || !activeWorkspace || rescoring) return;
    setRescoring(true);
    const unscored = propertyData.filter(d => !((d.property as any).scoreTotal > 0));
    const targets = unscored.length > 0 ? unscored : propertyData; // if all have scores, re-score all
    let successCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const pd = targets[i];
      setRescoreProgress(`Scoring ${i + 1}/${targets.length}: ${pd.property.propertyName}`);
      try {
        const res = await fetch("/api/workspace/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId: pd.property.id,
            userId: user.uid,
            projectId: activeWorkspace.id,
            analysisType: activeWorkspace.analysisType || "retail",
          }),
        });
        if (res.ok) {
          successCount++;
        } else {
          const errText = await res.text().catch(() => "");
          console.warn(`[Scoreboard] Score failed for ${pd.property.propertyName}:`, res.status, errText);
        }
      } catch (err) {
        console.warn(`[Scoreboard] Score request error for ${pd.property.propertyName}:`, err);
      }
    }
    setRescoreProgress(`Done! ${successCount}/${targets.length} scored successfully.`);
    // Reload data
    try {
      const props = await getWorkspaceProperties(user.uid, activeWorkspace.id);
      const data: PropertyData[] = await Promise.all(
        props.map(async (prop) => {
          const values = new Map<string, string>();
          try {
            const propFields = await getPropertyExtractedFields(prop.id);
            for (const [metricKey, fieldKeys] of Object.entries(FIELD_MAP)) {
              const val = getFieldValue(propFields, fieldKeys);
              if (val) values.set(metricKey, val);
            }
          } catch { /* no fields */ }
          if (!values.has("address")) {
            const addr = [prop.address1, prop.city, prop.state].filter(Boolean).join(", ");
            if (addr) values.set("address", addr);
          }
          if (!values.has("building_sf") && prop.buildingSf) values.set("building_sf", String(prop.buildingSf));
          if (!values.has("occupancy") && prop.occupancyPct) values.set("occupancy", String(prop.occupancyPct));
          return { property: prop, values };
        })
      );
      setPropertyData(data);
    } catch { /* ignore */ }
    setRescoring(false);
    setTimeout(() => setRescoreProgress(""), 4000);
  };

  // Load properties with card-level metrics (Phase 1), then enrich in background (Phase 2).
  // Phase 2 is guarded by a stale flag so duplicate fires are cancelled.
  const enrichRunId = useRef(0);
  useEffect(() => {
    if (!user || !activeWorkspace) return;
    const runId = ++enrichRunId.current;
    setLoading(true);
    getWorkspaceProperties(user.uid, activeWorkspace.id).then(async (props) => {
      if (runId !== enrichRunId.current) return; // stale - newer run superseded us
      if (props.length === 0) { setPropertyData([]); setLoading(false); return; }
      // Phase 1: Build initial data from property-level fields (instant, no extra queries)
      const data: PropertyData[] = props.map((prop) => {
        const values = new Map<string, string>();
        const addr = [prop.address1, prop.city, prop.state].filter(Boolean).join(", ");
        if (addr) values.set("address", addr);
        if ((prop as any).cardAskingPrice) values.set("asking_price", String((prop as any).cardAskingPrice));
        if ((prop as any).cardCapRate) values.set("cap_rate", String((prop as any).cardCapRate));
        if ((prop as any).cardNoi) values.set("noi", String((prop as any).cardNoi));
        if ((prop as any).cardBuildingSf || prop.buildingSf) values.set("building_sf", String((prop as any).cardBuildingSf || prop.buildingSf));
        if (prop.occupancyPct) values.set("occupancy", String(prop.occupancyPct));
        if ((prop as any).analysisType) values.set("asset_type", String((prop as any).analysisType));
        return { property: prop, values };
      });
      setPropertyData(data);
      setLoading(false);

      // Phase 2: Skip automatic background enrichment on load.
      // Card-level metrics (Phase 1) cover the scoreboard table.
      // Full extracted fields are fetched on-demand (e.g. rescoreAll, CSV export)
      // to avoid 14+ individual API calls that add 5-10s of latency.
    }).catch(() => { if (runId === enrichRunId.current) setLoading(false); });
    // Use stable primitives - object refs change every render and cause infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeWorkspace?.id]);

  // Get unique asset types for filter
  const assetTypes = useMemo(() => {
    const types = new Set<string>();
    propertyData.forEach(pd => {
      const at = pd.values.get("asset_type") || (pd.property as any).analysisType || "";
      if (at) types.add(at);
    });
    return Array.from(types).sort();
  }, [propertyData]);

  const SCORE_RANGES = [
    { label: "Strong Buy (85-100)", min: 85, max: 100 },
    { label: "Buy (70-84)", min: 70, max: 84 },
    { label: "Neutral (50-69)", min: 50, max: 69 },
    { label: "Pass (30-49)", min: 30, max: 49 },
    { label: "Reject (0-29)", min: 0, max: 29 },
  ];

  const sortedData = useMemo(() => {
    let filtered = [...propertyData];

    // Apply asset type filter
    if (filterAssetType) {
      filtered = filtered.filter(pd => {
        const at = (pd.values.get("asset_type") || (pd.property as any).analysisType || "").toLowerCase();
        return at === filterAssetType.toLowerCase();
      });
    }

    // Apply score range filter
    if (filterScoreRange) {
      const range = SCORE_RANGES.find(r => r.label === filterScoreRange);
      if (range) {
        filtered = filtered.filter(pd => {
          const s = (pd.property as any).scoreTotal || 0;
          return s >= range.min && s <= range.max;
        });
      }
    }

    // Sort
    const dir = sortDir === "desc" ? -1 : 1;
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "score": cmp = ((a.property as any).scoreTotal || 0) - ((b.property as any).scoreTotal || 0); break;
        case "name": cmp = (a.property.propertyName || "").localeCompare(b.property.propertyName || ""); break;
        case "price": cmp = (Number(a.values.get("asking_price")) || 0) - (Number(b.values.get("asking_price")) || 0); break;
        case "cap_rate": cmp = (Number(a.values.get("cap_rate")) || 0) - (Number(b.values.get("cap_rate")) || 0); break;
        case "noi": cmp = (Number(a.values.get("noi")) || 0) - (Number(b.values.get("noi")) || 0); break;
        case "gla": cmp = (Number(a.values.get("building_sf")) || 0) - (Number(b.values.get("building_sf")) || 0); break;
        case "value_add": cmp = ((a.property as any).valueAddScore || 0) - ((b.property as any).valueAddScore || 0); break;
        case "lens": {
          const la = String((a.property as any).analysisType || activeWorkspace?.analysisType || "retail");
          const lb = String((b.property as any).analysisType || activeWorkspace?.analysisType || "retail");
          cmp = la.localeCompare(lb);
          break;
        }
        case "signal": {
          const sa = (a.property as any).scoreTotal || 0;
          const sb = (b.property as any).scoreTotal || 0;
          cmp = sa - sb;
          break;
        }
      }
      return cmp * dir;
    });
    return filtered;
  }, [propertyData, sortBy, sortDir, filterAssetType, filterScoreRange]);

  const maxScore = useMemo(() => {
    // Avoid spread on very large arrays (call-stack risk) and guard empty case.
    let m = 100;
    for (const d of propertyData) {
      const s = (d.property as any).scoreTotal || 0;
      if (s > m) m = s;
    }
    return m;
  }, [propertyData]);

  const stats = useMemo(() => {
    if (propertyData.length === 0) return null;
    const scores = propertyData.map(d => (d.property as any).scoreTotal || 0).filter(s => s > 0);
    const prices = propertyData.map(d => Number(d.values.get("asking_price")) || 0).filter(p => p > 0);
    const caps = propertyData.map(d => Number(d.values.get("cap_rate")) || 0).filter(c => c > 0);
    return {
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      topScore: scores.length ? scores.reduce((a, b) => (a > b ? a : b), 0) : 0,
      totalValue: prices.reduce((a, b) => a + b, 0),
      avgCap: caps.length ? (caps.reduce((a, b) => a + b, 0) / caps.length).toFixed(2) : null,
      count: propertyData.length,
      scored: scores.length,
    };
  }, [propertyData]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: "3px solid rgba(227, 190, 189, 0.15)", borderTopColor: "#C49A3C",
          borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <div style={{ fontSize: 14, color: "#585e70" }}>Loading scoreboard...</div>
      </div>
    );
  }

  // Get signal/recommendation for a property
  const getSignal = (pd: PropertyData) => {
    const recommendation = (pd.property as any).recommendation || pd.values.get("ai_summary") || "";
    if (!recommendation) return { label: "No Data", color: "#9CA3AF", bg: "#F3F4F6" };

    const rec = recommendation.toLowerCase();
    if (rec.includes("strong buy") || rec.includes("strong_buy")) {
      return { label: "Strong Buy", color: "#059669", bg: "rgba(5,150,105,0.1)" };
    }
    if (rec.includes("buy")) {
      return { label: "Buy", color: "#059669", bg: "rgba(5,150,105,0.1)" };
    }
    if (rec.includes("neutral") || rec.includes("hold")) {
      return { label: "Neutral", color: "#D97706", bg: "rgba(217,119,6,0.1)" };
    }
    if (rec.includes("pass") || rec.includes("reject")) {
      return { label: "Pass", color: "#DC2626", bg: "rgba(220,38,38,0.1)" };
    }
    return { label: "Neutral", color: "#9CA3AF", bg: "#F3F4F6" };
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

        /* ─── Tablet & Mobile Responsive Rules (≤768px) ─── */
        @media (max-width: 768px) {
          .sb-heading-area {
            margin-bottom: 16px !important;
            padding: 0 4px !important;
          }
          .sb-title {
            font-size: 22px !important;
            letter-spacing: -0.3px !important;
          }
          .sb-subtitle {
            font-size: 12px !important;
            display: none !important;
          }
          .sb-header-controls {
            flex-direction: column !important;
            gap: 12px !important;
            align-items: flex-start !important;
          }
          .sb-view-toggle {
            width: 100% !important;
          }
          .sb-view-toggle button {
            flex: 1 !important;
          }
          .sb-leaderboard-row {
            grid-template-columns: 24px 48px 1fr 24px !important;
            gap: 8px !important;
            padding: 12px 12px !important;
          }
          .sb-leaderboard-row > div:nth-child(2) {
            min-width: 48px !important;
          }
          .sb-leaderboard-row > div:nth-child(4) {
            display: none !important;
          }
          .sb-expanded-detail {
            padding: 0 12px 12px 36px !important;
          }
          .sb-inline-metrics {
            gap: 0 12px !important;
          }
          .sb-metric-grid {
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)) !important;
            gap: 8px 12px !important;
            padding: 10px 12px !important;
          }
          .sb-table-container {
            overflow-x: hidden !important;
            margin-bottom: 16px !important;
          }
          .sb-comparison-table {
            font-size: 12px !important;
          }
          .sb-comparison-table th {
            padding: 12px 8px !important;
            font-size: 9px !important;
          }
          .sb-comparison-table td {
            padding: 12px 8px !important;
            font-size: 12px !important;
          }
          /* Hide GLA (6th), Value-Add (7th), Signal (8th) on tablet */
          .sb-comparison-table thead tr th:nth-child(n+6),
          .sb-comparison-table tbody tr td:nth-child(n+6) {
            display: none !important;
          }
          /* Tighten property thumbnail */
          .sb-comparison-table td:first-child { padding: 10px 8px !important; }
          .sb-comparison-table td:first-child img,
          .sb-comparison-table td:first-child div:first-child { width: 36px !important; height: 36px !important; }
        }

        /* ─── Mobile Responsive Rules (≤480px) ─── */
        @media (max-width: 480px) {
          .sb-heading-area {
            margin-bottom: 16px !important;
          }
          .sb-title {
            font-size: 20px !important;
            letter-spacing: -0.2px !important;
          }
          .sb-view-toggle {
            width: 100% !important;
            padding: 1px !important;
          }
          .sb-view-toggle button {
            padding: 5px 10px !important;
            font-size: 10px !important;
            flex: 1 !important;
          }
          .sb-leaderboard-row {
            grid-template-columns: 20px 1fr 20px !important;
            gap: 6px !important;
            padding: 10px 10px !important;
          }
          .sb-leaderboard-row > div:nth-child(2) {
            display: none !important;
          }
          .sb-leaderboard-row > div:nth-child(4) {
            display: none !important;
          }
          .sb-leaderboard-row > div:nth-child(5) {
            width: 20px !important;
          }
          .sb-expanded-detail {
            padding: 0 10px 10px 30px !important;
          }
          .sb-inline-metrics {
            flex-direction: column !important;
            gap: 0 !important;
          }
          .sb-metric-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 6px 8px !important;
            padding: 8px 10px !important;
          }
          .sb-table-container {
            border-radius: 6px !important;
            margin-bottom: 12px !important;
          }
          /* Hide Price (3rd), Cap (4th), NOI (5th) too - show only Property + Score */
          .sb-comparison-table thead tr th:nth-child(n+3),
          .sb-comparison-table tbody tr td:nth-child(n+3) {
            display: none !important;
          }
          .sb-comparison-table th {
            padding: 10px 8px !important;
            font-size: 8px !important;
            letter-spacing: 0.5px !important;
          }
          .sb-comparison-table td {
            padding: 10px 8px !important;
            font-size: 11px !important;
          }
          /* Smaller score ring on mobile table */
          .sb-comparison-table td:nth-child(2) svg { width: 44px !important; height: 44px !important; }
        }
      `}</style>

      {/* HEADING AREA */}
      <div className="sb-heading-area" style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 4 }}>
          <h1 className="sb-title" style={{ fontSize: 30, fontWeight: 700, margin: 0, color: "#111827", letterSpacing: -0.5 }}>
            Portfolio Scoreboard
          </h1>
        </div>
        <div className="sb-header-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className="sb-subtitle" style={{ fontSize: 14, fontWeight: 500, color: "#9CA3AF", margin: 0 }}>
            Comparative analysis and algorithmic rankings for all dealboard assets.
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* View Toggle */}
            <div className="sb-view-toggle" style={{
              display: "inline-flex", background: "#F3F4F6", borderRadius: 8, padding: 2,
            }}>
              <button
                onClick={() => setView("leaderboard")}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "none",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  textTransform: "uppercase", letterSpacing: 0.5,
                  background: view === "leaderboard" ? "#fff" : "transparent",
                  color: view === "leaderboard" ? "#111827" : "#9CA3AF",
                  boxShadow: view === "leaderboard" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                Leaderboard
              </button>
              <button
                onClick={() => setView("comparison")}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "none",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  textTransform: "uppercase", letterSpacing: 0.5,
                  background: view === "comparison" ? "#fff" : "transparent",
                  color: view === "comparison" ? "#111827" : "#9CA3AF",
                  boxShadow: view === "comparison" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                Table
              </button>
            </div>

            <button onClick={() => exportToXlsx(sortedData, activeWorkspace?.name || "")} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", background: "#fff", border: "1px solid rgba(0,0,0,0.05)",
              borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
              textTransform: "uppercase", letterSpacing: 0.8, color: "#6B7280", fontFamily: "inherit",
            }} disabled={propertyData.length === 0}>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Processing properties info */}
      {propertyData.filter(d => {
        const ps = (d.property as any).processingStatus;
        return ps && ps !== "complete" && ps !== "error";
      }).length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
          background: "rgba(37,99,235,0.06)",
          border: "1px solid rgba(37,99,235,0.15)",
          borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600,
          color: "#2563EB",
        }}>
          <div style={{
            width: 14, height: 14, border: "2px solid rgba(37,99,235,0.3)", borderTopColor: "#2563EB",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          {propertyData.filter(d => {
            const ps = (d.property as any).processingStatus;
            return ps && ps !== "complete" && ps !== "error";
          }).length} properties are being analyzed...
        </div>
      )}

      {/* Filters removed per user request */}


      {/* Empty State */}
      {propertyData.length === 0 ? (
        <div
          onClick={() => router.push("/workspace/upload")}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); router.push("/workspace/upload"); }}
          style={{
            background: "#fff", borderRadius: 12, border: "2px dashed #D8DFE9",
            padding: "48px 20px", textAlign: "center", cursor: "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            transition: "all 0.2s",
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "rgba(132, 204, 22, 0.08)",
            display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#151b2b", margin: "0 0 6px", fontFamily: "'Inter', sans-serif" }}>
            Drop your OM or flyer here
          </p>
          <p style={{ fontSize: 13, color: "#585e70", margin: "0 0 16px" }}>
            PDF, Excel, or CSV accepted (Max 50MB)
          </p>
          <button onClick={e => { e.stopPropagation(); router.push("/workspace/upload"); }} style={{
            padding: "12px 32px", background: "#151b2b", color: "#fff", border: "none",
            borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
          }}>
            Select File from Local
          </button>
        </div>
      ) : (
        <>
          {/* Unscored deals info banner */}
          {propertyData.filter(d => {
            const ps = (d.property as any).processingStatus;
            return !((d.property as any).scoreTotal > 0) && (!ps || ps === "complete" || ps === "error");
          }).length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 20px", background: "rgba(217,119,6,0.06)",
              border: "1px solid rgba(217,119,6,0.15)", borderRadius: 10, marginBottom: 16,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E", flex: 1 }}>
                {rescoring ? rescoreProgress : (<>
                  {propertyData.filter(d => {
                    const ps = (d.property as any).processingStatus;
                    return !((d.property as any).scoreTotal > 0) && (!ps || ps === "complete" || ps === "error");
                  }).length} of {propertyData.length} properties need scoring.
                </>)}
              </span>
              <button
                onClick={() => rescoreAll()}
                disabled={rescoring}
                style={{
                  padding: "7px 18px", background: rescoring ? "#D97706" : "#92400E", color: "#fff",
                  border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: rescoring ? "default" : "pointer",
                  fontFamily: "inherit", whiteSpace: "nowrap", opacity: rescoring ? 0.7 : 1,
                }}
              >
                {rescoring ? "Scoring..." : "Score Now"}
              </button>
            </div>
          )}

          {/* LEADERBOARD VIEW */}
          {view === "leaderboard" && (
            <div style={{ marginBottom: 24 }}>
              <ScoreDistribution data={sortedData} />
              {sortedData.map((pd, idx) => (
                <LeaderboardRow
                  key={pd.property.id}
                  pd={pd}
                  rank={idx + 1}
                  totalCount={sortedData.length}
                  maxScore={sortedData.reduce((mx, d) => Math.max(mx, (d.property as any).scoreTotal || 0), 1)}
                  expanded={expandedId === pd.property.id}
                  onToggle={() => setExpandedId(expandedId === pd.property.id ? null : pd.property.id)}
                />
              ))}
            </div>
          )}

          {/* TABLE VIEW */}
          {view === "comparison" && (
          <div className="sb-table-container" style={{
            background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)", overflow: "hidden", marginBottom: 24,
          }}>
            <table className="sb-comparison-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  {([
                    { key: "name" as SortKey, label: "Property", align: "left" as const },
                    { key: "lens" as SortKey, label: "Lens", align: "center" as const },
                    { key: "score" as SortKey, label: "Deal Score", align: "center" as const },
                    { key: "price" as SortKey, label: "Price", align: "right" as const },
                    { key: "cap_rate" as SortKey, label: "Cap Rate", align: "right" as const },
                    { key: "noi" as SortKey, label: "NOI", align: "right" as const },
                    { key: "gla" as SortKey, label: "GLA", align: "right" as const },
                    { key: "value_add" as SortKey, label: "Value-Add", align: "center" as const },
                    { key: "signal" as SortKey, label: "Signal", align: "center" as const },
                  ]).map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        padding: "16px 24px", textAlign: col.align,
                        color: sortBy === col.key ? "#111827" : "#9CA3AF",
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2,
                        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                        transition: "color 0.15s",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {col.label}
                        {sortBy === col.key && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((pd, idx) => {
                  const score = (pd.property as any).scoreTotal || 0;
                  const scoreBand = (pd.property as any).scoreBand || "";
                  const bandConfig = BAND_CONFIG[scoreBand] || BAND_CONFIG.hold;

                  const price = pd.values.get("asking_price");
                  const capRate = pd.values.get("cap_rate");
                  const noi = pd.values.get("noi");
                  const gla = pd.values.get("building_sf");
                  const signal = getSignal(pd);

                  // SVG score ring
                  const ringSize = 60;
                  const strokeWidth = 3;
                  const radius = (ringSize - strokeWidth) / 2;
                  const circumference = 2 * Math.PI * radius;
                  const progress = score > 0 ? Math.min(score / 100, 1) : 0;
                  const dashOffset = circumference * (1 - progress);

                  const propertyName = cleanDisplayName(pd.property.propertyName, pd.property.address1, pd.property.city, pd.property.state);
                  const cityState = [pd.property.city, pd.property.state].filter(Boolean).join(", ");
                  const heroUrl = (pd.property as any).heroImageUrl;
                  const procStatus = (pd.property as any).processingStatus || "";
                  const isProcessing = procStatus && procStatus !== "complete";

                  return (
                    <tr key={pd.property.id} style={{
                      borderBottom: "1px solid rgba(0,0,0,0.05)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FAFAFA"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                    >
                      {/* Property Name + Thumbnail + City + Status */}
                      <td style={{
                        padding: "12px 24px", color: "#111827", fontSize: 14, fontWeight: 700,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {/* Thumbnail */}
                          <div style={{
                            width: 48, height: 48, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                            background: "#F3F4F6", border: "1px solid rgba(0,0,0,0.05)",
                          }}>
                            {heroUrl ? (
                              <img src={heroUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
                                </svg>
                              </div>
                            )}
                          </div>
                          {/* Name + location + status */}
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/workspace/properties/${pd.property.id}`} style={{
                              textDecoration: "none", color: "#111827", cursor: "pointer",
                              display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {propertyName}
                            </Link>
                            {cityState && (
                              <div style={{
                                fontSize: 12, color: "#9CA3AF", marginTop: 2, fontWeight: 400,
                              }}>
                                {cityState}
                              </div>
                            )}
                            {isProcessing && (
                              <div style={{
                                display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
                                fontSize: 10, fontWeight: 600, color: "#2563EB",
                                background: "rgba(37,99,235,0.06)", padding: "2px 8px", borderRadius: 4,
                              }}>
                                <div style={{
                                  width: 8, height: 8, borderRadius: "50%",
                                  border: "1.5px solid rgba(37,99,235,0.3)", borderTopColor: "#2563EB",
                                  animation: "spin 0.8s linear infinite",
                                }} />
                                {procStatus === "parsing" ? "Parsing" :
                                 procStatus === "generating" ? "Generating" :
                                 procStatus === "scoring" ? "Scoring" : "Processing"}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Lens (scoring model) chip */}
                      {(() => {
                        const lensType = ((pd.property as any).analysisType as string) || activeWorkspace?.analysisType || "retail";
                        const lensColor = ANALYSIS_TYPE_COLORS[lensType as keyof typeof ANALYSIS_TYPE_COLORS] || "#6B7280";
                        const lensLabel = ANALYSIS_TYPE_LABELS[lensType as keyof typeof ANALYSIS_TYPE_LABELS] || "Retail";
                        return (
                          <td style={{ padding: "16px 16px", textAlign: "center" }}>
                            <span
                              title={`Scored with ${lensLabel} model`}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "4px 10px", borderRadius: 999,
                                background: `${lensColor}14`, color: lensColor,
                                border: `1px solid ${lensColor}33`,
                                fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
                                whiteSpace: "nowrap",
                              }}>
                              <AnalysisTypeIcon type={lensType} size={12} color={lensColor} />
                              <span>{lensLabel}</span>
                            </span>
                          </td>
                        );
                      })()}

                      {/* Deal Score with circular badge */}
                      <td style={{
                        padding: "16px 24px", textAlign: "center",
                      }}>
                        <div style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        }}>
                          <div style={{ position: "relative", width: ringSize, height: ringSize }}>
                            <svg width={ringSize} height={ringSize} style={{ transform: "rotate(-90deg)" }}>
                              <circle cx={ringSize / 2} cy={ringSize / 2} r={radius}
                                fill="none" stroke="#E5E7EB" strokeWidth={strokeWidth} />
                              {score > 0 && (
                                <circle cx={ringSize / 2} cy={ringSize / 2} r={radius}
                                  fill="none" stroke={bandConfig.barColor} strokeWidth={strokeWidth}
                                  strokeLinecap="round"
                                  strokeDasharray={circumference}
                                  strokeDashoffset={dashOffset}
                                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                                />
                              )}
                            </svg>
                            <div style={{
                              position: "absolute", inset: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 18, fontWeight: 900, color: score > 0 ? bandConfig.color : "#D1D5DB",
                            }}>
                              {score > 0 ? score : "--"}
                            </div>
                          </div>
                          {score > 0 && (
                            <div style={{
                              fontSize: 10, fontWeight: 700, color: bandConfig.color,
                              textTransform: "uppercase", letterSpacing: 0.5,
                              whiteSpace: "nowrap",
                            }}>
                              {bandConfig.label}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Price */}
                      <td style={{
                        padding: "16px 24px", textAlign: "right", fontSize: 14,
                        fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums",
                      }}>
                        {price ? formatValue("asking_price", price) : "--"}
                      </td>

                      {/* Cap Rate */}
                      <td style={{
                        padding: "16px 24px", textAlign: "right", fontSize: 14,
                        fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums",
                      }}>
                        {capRate ? formatValue("cap_rate", capRate) : "--"}
                      </td>

                      {/* NOI */}
                      <td style={{
                        padding: "16px 24px", textAlign: "right", fontSize: 14,
                        fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums",
                      }}>
                        {noi ? formatValue("noi", noi) : "--"}
                      </td>

                      {/* GLA */}
                      <td style={{
                        padding: "16px 24px", textAlign: "right", fontSize: 14,
                        fontWeight: 500, color: "#4B5563", fontVariantNumeric: "tabular-nums",
                      }}>
                        {gla ? formatValue("building_sf", gla) : "--"}
                      </td>

                      {/* Value-Add Score */}
                      <td style={{ padding: "16px 24px", textAlign: "center" }}>
                        {(() => {
                          const vaScoreVal = (pd.property as any).valueAddScore;
                          if (vaScoreVal === undefined || vaScoreVal === null) return <span style={{ color: "#D1D5DB" }}>--</span>;
                          const va = Number(vaScoreVal);
                          const vaColor = va >= 7 ? "#059669" : va >= 4 ? "#D97706" : "#6B7280";
                          const vaBg = va >= 7 ? "rgba(5,150,105,0.08)" : va >= 4 ? "rgba(217,119,6,0.08)" : "rgba(107,114,128,0.06)";
                          const vaLabel = va >= 7 ? "📈" : va >= 4 ? "📊" : "〰️";
                          return (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "4px 10px", borderRadius: 6,
                              background: vaBg, color: vaColor,
                              fontSize: 13, fontWeight: 700,
                            }}>
                              {vaLabel} {va}/10
                            </span>
                          );
                        })()}
                      </td>

                      {/* Signal Pill Badge */}
                      <td style={{
                        padding: "16px 24px", textAlign: "center",
                      }}>
                        <div style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          padding: "6px 12px", borderRadius: 6,
                          background: signal.bg, color: signal.color,
                          fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                        }}>
                          {signal.label}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* FOOTER NOTE */}
          <div style={{
            textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 24,
          }}>
            Scores are calculated based on market comps, tenant credit, and lease structure.
          </div>
        </>
      )}
    </div>
  );
}

function StatPill({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10, border: "1px solid rgba(227, 190, 189, 0.15)",
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#585e70", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || "#151b2b", letterSpacing: -0.3 }}>
        {value}{sub && <span style={{ fontSize: 11, fontWeight: 600, color: "#585e70" }}>{sub}</span>}
      </div>
    </div>
  );
}
