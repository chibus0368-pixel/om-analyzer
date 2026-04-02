"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, getPropertyExtractedFields } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
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
  hold:          { label: "Hold",          color: "#D97706", bg: "#FFFBEB", barColor: "#FBBF24" },
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
  const bucketLabels = { "85-100": "Strong Buy", "70-84": "Buy", "50-69": "Hold", "30-49": "Pass", "0-29": "Reject" };

  scored.forEach(d => {
    const s = (d.property as any).scoreTotal || 0;
    if (s >= 85) buckets["85-100"]++;
    else if (s >= 70) buckets["70-84"]++;
    else if (s >= 50) buckets["50-69"]++;
    else if (s >= 30) buckets["30-49"]++;
    else buckets["0-29"]++;
  });

  const max = Math.max(...Object.values(buckets), 1);

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
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
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
          </div>
          {/* Recommendation blurb — from Score API, stripped of emojis */}
          {recommendation && (
            <div style={{
              fontSize: 12, color: "#585e70", marginTop: 4, lineHeight: 1.4,
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
            }}>
              {recommendation.replace(/🟢|🟡|🔴/g, "").trim()}
              {totalCount > 1 && score > 0 && (
                <span style={{ color: "#b9172f", fontWeight: 600 }}> · Rank {rank}/{totalCount}</span>
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
        <div style={{
          padding: "0 16px 16px 52px",
          background: "#faf8ff",
          animation: "slideDown 0.2s ease",
        }}>
          <div style={{
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
type SortKey = "score" | "name" | "price" | "cap_rate";
type ViewMode = "leaderboard" | "comparison";

export default function ScoreboardPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const [propertyData, setPropertyData] = useState<PropertyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [view, setView] = useState<ViewMode>("leaderboard");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreProgress, setRescoreProgress] = useState("");

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
        if (res.ok) successCount++;
      } catch { /* continue to next */ }
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

  useEffect(() => {
    if (!user || !activeWorkspace) return;
    setLoading(true);
    getWorkspaceProperties(user.uid, activeWorkspace.id).then(async (props) => {
      if (props.length === 0) { setPropertyData([]); setLoading(false); return; }
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
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, activeWorkspace]);

  const sortedData = useMemo(() => {
    const sorted = [...propertyData];
    switch (sortBy) {
      case "score": sorted.sort((a, b) => ((b.property as any).scoreTotal || 0) - ((a.property as any).scoreTotal || 0)); break;
      case "name": sorted.sort((a, b) => a.property.propertyName.localeCompare(b.property.propertyName)); break;
      case "price": sorted.sort((a, b) => (Number(b.values.get("asking_price")) || 0) - (Number(a.values.get("asking_price")) || 0)); break;
      case "cap_rate": sorted.sort((a, b) => (Number(b.values.get("cap_rate")) || 0) - (Number(a.values.get("cap_rate")) || 0)); break;
    }
    return sorted;
  }, [propertyData, sortBy]);

  const maxScore = useMemo(() => Math.max(...propertyData.map(d => (d.property as any).scoreTotal || 0), 100), [propertyData]);

  const stats = useMemo(() => {
    if (propertyData.length === 0) return null;
    const scores = propertyData.map(d => (d.property as any).scoreTotal || 0).filter(s => s > 0);
    const prices = propertyData.map(d => Number(d.values.get("asking_price")) || 0).filter(p => p > 0);
    const caps = propertyData.map(d => Number(d.values.get("cap_rate")) || 0).filter(c => c > 0);
    return {
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      topScore: scores.length ? Math.max(...scores) : 0,
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

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <style>{`@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#151b2b", fontFamily: "'Playfair Display', Georgia, serif" }}>Deal Scoreboard</h1>
            {activeWorkspace?.analysisType && (
              <span style={{
                display: "inline-flex", padding: "3px 10px", borderRadius: 4,
                background: `${ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType]}15`,
                color: ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType],
                fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
              }}>{ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}</span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#585e70", marginTop: 4, marginBottom: 0 }}>
            {propertyData.length} propert{propertyData.length !== 1 ? "ies" : "y"} ranked by investment score
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: "flex", background: "#F0F2F5", borderRadius: 8, padding: 2 }}>
            {(["leaderboard", "comparison"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                background: view === v ? "#fff" : "transparent",
                boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                color: view === v ? "#151b2b" : "#585e70", fontSize: 11, fontWeight: 600,
                fontFamily: "inherit", textTransform: "capitalize",
              }}>{v === "leaderboard" ? "Leaderboard" : "Comparison"}</button>
            ))}
          </div>

          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} style={{
            padding: "7px 12px", borderRadius: 8, border: "1px solid #E0E4EA", fontSize: 12,
            fontWeight: 600, color: "#585e70", background: "#fff", cursor: "pointer", fontFamily: "inherit",
          }}>
            <option value="score">Sort: Score</option>
            <option value="name">Sort: Name</option>
            <option value="price">Sort: Price</option>
            <option value="cap_rate">Sort: Cap Rate</option>
          </select>

          {propertyData.length > 0 && (
            <>
              <button onClick={() => exportToXlsx(sortedData, activeWorkspace?.name || "")} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                background: "#16A34A", color: "#fff", borderRadius: 8, fontSize: 12,
                fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Export XLS
              </button>
            </>
          )}
        </div>
      </div>


      {/* Empty State */}
      {propertyData.length === 0 ? (
        <div
          onClick={() => router.push("/workspace/upload")}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); router.push("/workspace/upload"); }}
          style={{
            background: "#fff", borderRadius: 6, border: "2px dashed #D8DFE9",
            padding: "48px 20px", textAlign: "center", cursor: "pointer",
            boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
            transition: "all 0.2s",
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "rgba(185, 23, 47, 0.08)",
            display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b9172f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
      ) : view === "leaderboard" ? (
        <>
          {/* Stats row */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
              <StatPill label="Scored" value={stats.scored > 0 ? `${stats.scored}` : "0"} sub={`/${stats.count}`} />
              <StatPill label="Avg Score" value={stats.avgScore > 0 ? `${stats.avgScore}` : "--"}
                color={stats.avgScore >= 70 ? "#059669" : stats.avgScore >= 50 ? "#D97706" : stats.avgScore > 0 ? "#DC2626" : undefined}
                sub="/100"
              />
              <StatPill label="Top Score" value={stats.topScore > 0 ? `${stats.topScore}` : "--"}
                color={stats.topScore >= 70 ? "#059669" : stats.topScore >= 50 ? "#D97706" : stats.topScore > 0 ? "#DC2626" : undefined}
              />
              <StatPill label="Avg Cap" value={stats.avgCap ? `${stats.avgCap}%` : "--"}
                color={stats.avgCap && Number(stats.avgCap) >= 7 ? "#059669" : undefined}
              />
            </div>
          )}

          {/* Distribution chart */}
          {/* Score Distribution removed */}

          {/* Leaderboard */}
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid rgba(227, 190, 189, 0.15)", overflow: "hidden",
          }}>
            {/* Column headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "26px 64px 1fr auto 28px",
              gap: 12,
              padding: "8px 16px",
              background: "#151b2b",
              color: "#585e70",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              <div>#</div>
              <div style={{ textAlign: "center" }}>Score</div>
              <div>Property</div>
              <div style={{ textAlign: "right" }}>Price / Cap</div>
              <div />
            </div>

            {/* Rows */}
            {sortedData.map((pd, i) => (
              <LeaderboardRow
                key={pd.property.id}
                pd={pd}
                rank={i + 1}
                totalCount={sortedData.length}
                maxScore={maxScore}
                expanded={expandedId === pd.property.id}
                onToggle={() => setExpandedId(expandedId === pd.property.id ? null : pd.property.id)}
              />
            ))}
          </div>
        </>
      ) : (
        /* ── Comparison Table View ── */
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid rgba(227, 190, 189, 0.15)",
          overflow: "auto", marginBottom: 32,
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ background: "#151b2b" }}>
                <th style={{
                  padding: "12px 16px", textAlign: "left", color: "#585e70", fontWeight: 600,
                  fontSize: 11, minWidth: 180, position: "sticky", left: 0, background: "#151b2b", zIndex: 2,
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>Metric</th>
                {sortedData.map(pd => {
                  const score = (pd.property as any).scoreTotal || 0;
                  const scoreBand = (pd.property as any).scoreBand || "";
                  const config = BAND_CONFIG[scoreBand] || null;
                  return (
                    <th key={pd.property.id} style={{
                      padding: "10px 14px 12px", textAlign: "center", color: "#fff",
                      fontWeight: 700, fontSize: 12, minWidth: 190, verticalAlign: "bottom",
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        {score > 0 && (
                          <div style={{
                            display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px",
                            borderRadius: 8, background: config ? `${config.color}22` : "transparent",
                          }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: config?.color || "#fff" }}>{score}</span>
                            {config && <span style={{ fontSize: 9, fontWeight: 700, color: config.color, textTransform: "uppercase" }}>{config.label}</span>}
                          </div>
                        )}
                        <Link href={`/workspace/properties/${pd.property.id}`} style={{ color: "#fff", textDecoration: "none", fontSize: 12 }}>
                          {cleanDisplayName(pd.property.propertyName, pd.property.address1, pd.property.city, pd.property.state)}
                        </Link>
                        {pd.property.city && (
                          <div style={{ fontSize: 10, fontWeight: 400, color: "#585e70" }}>
                            {[pd.property.city, pd.property.state].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {METRIC_SECTIONS.map(section => (
                <Fragment key={`s-${section.section}`}>
                  <tr style={{ background: "#F8F9FB" }}>
                    <td colSpan={sortedData.length + 1} style={{
                      padding: "8px 16px", fontWeight: 700, fontSize: 11, color: "#585e70",
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>{section.section}</td>
                  </tr>
                  {section.rows.map(r => (
                    <tr key={r.key} style={{ borderBottom: "1px solid #F4F5F7" }}>
                      <td style={{
                        padding: "9px 16px", fontWeight: 500, color: "#585e70", fontSize: 12,
                        position: "sticky", left: 0, background: "#fff", zIndex: 1,
                      }}>{r.label}</td>
                      {sortedData.map(pd => {
                        const rawVal = pd.values.get(r.key) || "";
                        const val = rawVal ? formatValue(r.key, rawVal) : "--";
                        const isSignal = section.section === "AI Analysis";
                        const n = Number(rawVal);
                        let valueColor = val === "--" ? "#D8DFE9" : isSignal ? "#151b2b" : "#151b2b";
                        let bgColor = "transparent";

                        if (val.includes("🟢")) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.06)"; }
                        else if (val.includes("🟡")) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.06)"; }
                        else if (val.includes("🔴")) { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.06)"; }

                        const threshold = !isNaN(n) && val !== "--" ? getThresholdColor(r.key, n) : null;
                        if (threshold) { valueColor = threshold.color; bgColor = threshold.bg; }

                        return (
                          <td key={pd.property.id} style={{
                            padding: "9px 14px", textAlign: "center",
                            fontWeight: isSignal ? 600 : 500,
                            color: valueColor, background: bgColor, fontSize: 12,
                          }}>{val}</td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
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
