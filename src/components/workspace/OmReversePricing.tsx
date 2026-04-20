"use client";

import { useMemo, useState } from "react";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import {
  runOmReversePricing,
  fmtCurrency,
  fmtPct,
  fmtX,
  type OmReversePricingInput,
  type OmReversePricingReport,
  type AssetType,
  type UnitType,
  type AssumptionVerdict,
} from "@/lib/analysis/om-reverse-pricing";
import { useUnderwritingDefaults } from "@/lib/workspace/use-underwriting-defaults";
import type { Verdict } from "@/lib/analysis/quick-screen";

/* ── Design tokens (shared with DealQuickScreen) ────── */
const C = {
  primary: "#84CC16",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  gold: "#C49A3C",
  surfLow: "#F3F4F6",
  surfLowest: "#ffffff",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  radius: 12,
};

/* ── Helpers ──────────────────────────────────────────── */
function gf(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

function mapAssetType(analysisType?: string): AssetType {
  switch (analysisType) {
    case "retail": return "retail";
    case "industrial": return "industrial";
    case "office": return "office";
    case "multifamily": return "multifamily";
    case "land": return "land";
    default: return "other";
  }
}

function verdictStyle(verdict: Verdict) {
  if (verdict === "BUY") return {
    bg: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
    border: "#86EFAC",
    accent: "#065F46",
    label: "BUY",
    pill: "#059669",
  };
  if (verdict === "PASS") return {
    bg: "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)",
    border: "#FCA5A5",
    accent: "#991B1B",
    label: "PASS",
    pill: "#DC2626",
  };
  return {
    bg: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
    border: "#FCD34D",
    accent: "#78350F",
    label: "NEUTRAL",
    pill: "#D97706",
  };
}

function critiqueBadgeStyle(v: AssumptionVerdict) {
  if (v === "UNREALISTIC") return { bg: "#FEE2E2", fg: "#991B1B" };
  if (v === "AGGRESSIVE") return { bg: "#FEF3C7", fg: "#92400E" };
  return { bg: "#D1FAE5", fg: "#065F46" };
}

/* ── Building blocks ──────────────────────────────────── */
function SectionCard({ title, subtitle, children, accent }: {
  title: string; subtitle?: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <div style={{
      background: C.surfLowest,
      border: `1px solid ${C.ghostBorder}`,
      borderRadius: C.radius,
      padding: 20,
      marginBottom: 16,
      boxShadow: "0 1px 3px rgba(15,23,43,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: subtitle ? 4 : 14 }}>
        {accent && (
          <span style={{ width: 4, height: 16, borderRadius: 2, background: accent, display: "inline-block" }} />
        )}
        <h3 style={{
          fontSize: 13, fontWeight: 700, color: C.onSurface,
          textTransform: "uppercase", letterSpacing: 0.6, margin: 0,
        }}>{title}</h3>
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: C.secondary, marginBottom: 14, lineHeight: 1.5 }}>{subtitle}</div>
      )}
      {children}
    </div>
  );
}

/* ── Build input from property + fields ───────────────── */
function buildInput(
  property: Property,
  fields: ExtractedField[],
  baseline: OmReversePricingInput["baseline"],
): OmReversePricingInput | null {
  const askingPrice = Number(gf(fields, "pricing_deal_terms", "asking_price"))
    || (property as any)?.cardAskingPrice
    || 0;

  const assetType: AssetType = mapAssetType((property as any)?.analysisType);

  let unitType: UnitType = "sf";
  let unitsOrSf = 0;
  if (assetType === "multifamily") {
    unitType = "units";
    unitsOrSf = Number(gf(fields, "multifamily_addons", "unit_count"))
      || property.suiteCount || 0;
  } else {
    unitType = "sf";
    unitsOrSf = Number(gf(fields, "property_basics", "building_sf"))
      || property.buildingSf
      || (property as any)?.cardBuildingSf
      || 0;
  }

  if (!askingPrice || !unitsOrSf) return null;

  const t12NOI = Number(gf(fields, "expenses", "noi_t12")) || null;
  const proFormaNOI = Number(gf(fields, "expenses", "noi_pro_forma")) || null;
  const statedYear1NOI = Number(gf(fields, "expenses", "noi_om"))
    || Number(gf(fields, "expenses", "noi_adjusted"))
    || (property as any)?.cardNoi
    || null;

  return {
    propertyName: property.propertyName || property.address1 || "Property",
    askingPrice,
    unitsOrSf,
    unitType,
    assetType,
    statedCapRatePct: Number(gf(fields, "pricing_deal_terms", "cap_rate_om"))
      || (property as any)?.cardCapRate
      || null,
    t12NOI: t12NOI || null,
    proFormaNOI: proFormaNOI || null,
    statedYear1NOI: statedYear1NOI || null,
    brokerRentGrowthPct: Number(gf(fields, "projections", "rent_growth")) || null,
    brokerExpenseGrowthPct: Number(gf(fields, "projections", "expense_growth")) || null,
    brokerExitCapPct: Number(gf(fields, "projections", "exit_cap")) || null,
    brokerVacancyPct: Number(gf(fields, "projections", "vacancy")) || null,
    brokerCapexPerUnit: Number(gf(fields, "projections", "capex_reserve")) || null,
    yearBuilt: Number(gf(fields, "property_basics", "year_built"))
      || property.yearBuilt
      || null,
    occupancyPct: Number(gf(fields, "property_basics", "occupancy_pct"))
      || property.occupancyPct
      || null,
    market: property.market,
    submarket: property.submarket,
    baseline,
  };
}

/* ── Props ────────────────────────────────────────────── */
export interface OmReversePricingProps {
  property: Property;
  fields: ExtractedField[];
}

/* ══════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                            */
/* ══════════════════════════════════════════════════════════ */
export default function OmReversePricing({ property, fields }: OmReversePricingProps) {
  const workspaceId = property.workspaceId || null;
  const { defaults, loaded } = useUnderwritingDefaults(workspaceId);
  const [compsOpen, setCompsOpen] = useState(false);

  const baseline: OmReversePricingInput["baseline"] = useMemo(() => ({
    ltvPct: defaults.ltv,
    interestRatePct: defaults.interestRate,
    amortYears: defaults.amortYears,
    holdYears: defaults.holdYears,
    exitCapPct: defaults.exitCap,
    vacancyPct: defaults.vacancy,
    rentGrowthPct: defaults.rentGrowth,
    expenseGrowthPct: defaults.expenseGrowth,
    targetLeveredIrrPct: defaults.targetLeveredIrr,
  }), [defaults]);

  const input = useMemo(() => buildInput(property, fields, baseline), [property, fields, baseline]);
  const report: OmReversePricingReport | null = useMemo(
    () => (input ? runOmReversePricing(input) : null),
    [input],
  );

  if (!input || !report) {
    return (
      <div style={{
        background: C.surfLowest, border: `1px dashed ${C.ghost}`,
        borderRadius: C.radius, padding: 32, textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🧮</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, marginBottom: 6 }}>
          OM Reverse Pricing needs core inputs
        </div>
        <div style={{ fontSize: 12, color: C.secondary, maxWidth: 440, margin: "0 auto", lineHeight: 1.5 }}>
          To reverse-engineer a bid, we need at minimum an asking price and property size (units or SF).
          Upload the OM or fill those fields on the Details tab and this view will populate.
        </div>
      </div>
    );
  }

  const v = verdictStyle(report.verdict);
  const pillByRec = {
    "PURSUE AT ASKING": { fg: "#065F46", bg: "#D1FAE5" },
    "PURSUE AT ADJUSTED PRICE": { fg: "#78350F", bg: "#FEF3C7" },
    "PASS": { fg: "#991B1B", bg: "#FEE2E2" },
  }[report.recommendation];

  const unitLabel = input.unitType === "units" ? "Unit" : "SF";
  const unitLower = input.unitType === "units" ? "unit" : "SF";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── 1. Pricing Verdict banner ─────────────────── */}
      <div style={{
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: C.radius,
        padding: "24px 26px",
        marginBottom: 16,
        boxShadow: "0 2px 10px rgba(15,23,43,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                padding: "6px 14px",
                background: v.pill,
                color: "#fff",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.2,
                borderRadius: 999,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              }}>{v.label}</span>
              <span style={{
                padding: "4px 10px",
                background: pillByRec.bg,
                color: pillByRec.fg,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.8,
                borderRadius: 4,
                textTransform: "uppercase",
              }}>{report.recommendation}</span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.8,
                color: v.accent,
                textTransform: "uppercase",
                opacity: 0.75,
              }}>
                {loaded ? "Standardized Baseline" : "Loading baseline..."}
              </span>
            </div>
            <div style={{
              marginTop: 10,
              fontSize: 14,
              lineHeight: 1.55,
              color: v.accent,
              fontWeight: 500,
            }}>{report.headline}</div>
          </div>

          {/* Max Bid card */}
          <div style={{
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.9)",
            borderRadius: 10,
            padding: "14px 18px",
            minWidth: 200,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: v.accent, letterSpacing: 0.8, textTransform: "uppercase", opacity: 0.7, marginBottom: 4 }}>
              Recommended Max Bid
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.onSurface, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {fmtCurrency(report.recommendedMaxBid)}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: C.secondary, fontWeight: 600 }}>
              {report.discountToAskingPct >= 0 ? "-" : "+"}{Math.abs(report.discountToAskingPct).toFixed(1)}% vs. ask ({fmtCurrency(Math.abs(report.discountToAskingUsd))})
            </div>
          </div>
        </div>

        {/* Strengths / Concerns row */}
        <div style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
        className="orp-grid-12">
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#065F46", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
              Top Strengths
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55, color: v.accent }}>
              {report.topStrengths.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
            </ol>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#991B1B", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
              Top Concerns
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55, color: v.accent }}>
              {report.topConcerns.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
            </ol>
          </div>
        </div>
      </div>

      {/* ── 2. OM Summary ─────────────────────────────── */}
      <SectionCard title="OM Summary" accent={C.primary}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }} className="orp-metric-grid">
          {[
            ["Asking Price", fmtCurrency(report.omSummary.askingPrice)],
            [`Price / ${unitLabel}`, fmtCurrency(report.omSummary.pricePerUnitOrSf)],
            ["Stated Cap Rate", fmtPct(report.omSummary.statedCapRatePct, 2)],
            ["Stated NOI", fmtCurrency(report.omSummary.statedNOI)],
            ["Year Built", report.omSummary.yearBuilt ? String(report.omSummary.yearBuilt) : "--"],
            ["Occupancy", fmtPct(report.omSummary.occupancyPct, 1)],
          ].map(([label, value]) => (
            <div key={label} style={{
              background: C.surfLow,
              borderRadius: 8,
              padding: "10px 12px",
            }}>
              <div style={{ fontSize: 10, color: C.secondary, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── 3. Three Scenarios ────────────────────────── */}
      <SectionCard
        title="Pricing Scenarios"
        subtitle="Broker's projections at ask, adjusted assumptions at ask, and the price that hits the workspace target IRR."
        accent="#7C3AED"
      >
        <div className="orp-scenarios" style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}>
          {report.scenarios.map((sc, i) => {
            const color = i === 0 ? "#2563EB" : i === 1 ? "#D97706" : "#059669";
            const bg = i === 0 ? "#EFF6FF" : i === 1 ? "#FFFBEB" : "#ECFDF5";
            return (
              <div key={sc.label} style={{
                background: bg,
                borderRadius: 10,
                padding: "14px 16px",
                border: `1px solid ${color}30`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
                  {sc.label}
                </div>
                <div style={{ fontSize: 11, color: C.secondary, marginBottom: 10 }}>{sc.keyNote}</div>

                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.secondary, fontWeight: 600 }}>Price</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {fmtCurrency(sc.purchasePrice)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.secondary, fontWeight: 600 }}>{`$ / ${unitLabel}`}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {fmtCurrency(sc.pricePerUnitOrSf)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.secondary, fontWeight: 600 }}>Going-in Cap</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {fmtPct(sc.goingInCapPct, 2)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.secondary, fontWeight: 600 }}>Exit Cap</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {fmtPct(sc.exitCapPct, 2)}
                  </span>
                </div>
                <div style={{ borderTop: `1px dashed ${C.ghost}`, margin: "8px 0" }} />
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Levered IRR</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                    {fmtPct(sc.leveredIrrPct, 1)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.secondary, fontWeight: 600 }}>Equity Multiple</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {fmtX(sc.equityMultiple)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.secondary, fontWeight: 600 }}>Yr-1 DSCR</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {fmtX(sc.dscrYr1)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: C.secondary, fontWeight: 600 }}>Yr-1 Cash-on-Cash</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {fmtPct(sc.cashOnCashYr1Pct, 1)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── 4. Broker vs. Reality Critique ────────────── */}
      <SectionCard
        title="Broker vs. Reality"
        subtitle="Every broker assumption compared against a market benchmark. Aggressive and unrealistic values are haircut in the Adjusted Base Case."
        accent="#DC2626"
      >
        <div style={{ overflow: "auto", marginLeft: -4, marginRight: -4 }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}` }}>Metric</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}` }}>Broker's OM</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}` }}>Benchmark</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}` }}>Adjusted</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}` }}>Verdict</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}` }}>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {report.critiques.map((c, i) => {
                const bs = critiqueBadgeStyle(c.verdict);
                return (
                  <tr key={i}>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, fontWeight: 700, color: C.onSurface, verticalAlign: "top" }}>{c.metric}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, color: C.onSurface, fontVariantNumeric: "tabular-nums", verticalAlign: "top" }}>{c.brokerValue}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, color: C.secondary, fontVariantNumeric: "tabular-nums", verticalAlign: "top" }}>{c.benchmark}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, color: C.onSurface, fontWeight: 700, fontVariantNumeric: "tabular-nums", verticalAlign: "top" }}>{c.adjustedValue}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, verticalAlign: "top" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: bs.bg,
                        color: bs.fg,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.4,
                      }}>{c.verdict}</span>
                    </td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, color: C.secondary, lineHeight: 1.45, verticalAlign: "top" }}>{c.rationale}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── 5. Price Sensitivity ──────────────────────── */}
      <SectionCard
        title="Price Sensitivity"
        subtitle="Levered IRR at asking, at steps of -5 / -10 / -15%, and at a 5% over-ask stretch."
        accent="#0891B2"
      >
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "left" }}>Price vs. Ask</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Purchase Price</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Going-in Cap</th>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Levered IRR</th>
              </tr>
            </thead>
            <tbody>
              {report.priceSensitivity.map((row, i) => {
                const targetMet = row.leveredIrrPct != null && row.leveredIrrPct >= baseline.targetLeveredIrrPct;
                return (
                  <tr key={i} style={{ background: row.purchasePriceDeltaPct === 0 ? C.surfLow : "transparent" }}>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, fontWeight: 600, color: C.onSurface }}>
                      {row.purchasePriceDeltaPct === 0 ? "Ask"
                        : row.purchasePriceDeltaPct > 0 ? `+${row.purchasePriceDeltaPct}%`
                        : `${row.purchasePriceDeltaPct}%`}
                    </td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(row.purchasePrice)}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(row.goingInCapPct, 2)}</td>
                    <td style={{
                      padding: "8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right",
                      fontVariantNumeric: "tabular-nums", fontWeight: 700,
                      color: targetMet ? "#059669" : row.leveredIrrPct != null && row.leveredIrrPct < baseline.targetLeveredIrrPct - 3 ? "#DC2626" : C.onSurface,
                    }}>{fmtPct(row.leveredIrrPct, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── 6. Exit Cap / Rent Growth Matrix ─────────── */}
      <SectionCard
        title="Exit Cap × Rent Growth"
        subtitle="Levered IRR at asking under a grid of exit cap and rent growth combinations. Anything inside the green band clears the target."
        accent="#7C3AED"
      >
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 360 }}>
            <thead>
              <tr style={{ color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "left" }}>Exit Cap \ Rent</th>
                {report.exitCapRentGrowthMatrix.rentGrowthsPct.map(rg => (
                  <th key={rg} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>
                    {rg.toFixed(1)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.exitCapRentGrowthMatrix.exitCapsPct.map(ec => (
                <tr key={ec}>
                  <td style={{ padding: "8px", borderBottom: `1px solid ${C.ghost}`, fontWeight: 700, color: C.onSurface }}>
                    {ec.toFixed(2)}%
                  </td>
                  {report.exitCapRentGrowthMatrix.rentGrowthsPct.map(rg => {
                    const cell = report.exitCapRentGrowthMatrix.cells.find(c => c.exitCapPct === ec && c.rentGrowthPct === rg);
                    const v = cell?.leveredIrrPct ?? null;
                    const meetsTarget = v != null && v >= baseline.targetLeveredIrrPct;
                    const miss = v != null && v < baseline.targetLeveredIrrPct - 3;
                    const bg = v == null ? "transparent" : meetsTarget ? "#D1FAE5" : miss ? "#FEE2E2" : "#FEF3C7";
                    const fg = v == null ? C.secondary : meetsTarget ? "#065F46" : miss ? "#991B1B" : "#78350F";
                    return (
                      <td key={rg} style={{
                        padding: "8px",
                        borderBottom: `1px solid ${C.ghost}`,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 700,
                        background: bg,
                        color: fg,
                      }}>{fmtPct(v, 1)}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── 7. 10-year Adjusted Pro Forma ─────────────── */}
      <SectionCard
        title="Adjusted Pro Forma"
        subtitle={`${baseline.holdYears}-year cash flow under adjusted assumptions. Terminal year includes sale proceeds net of cost and loan payoff.`}
        accent={C.primary}
      >
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 9 }}>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "left" }}>Yr</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>GPR</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Vacancy</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>EGI</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>OpEx</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>NOI</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>CapEx</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Debt Svc</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Cash Flow</th>
                <th style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>DSCR</th>
              </tr>
            </thead>
            <tbody>
              {report.proForma.map(p => (
                <tr key={p.year}>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, fontWeight: 700 }}>{p.year}</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(p.grossRevenue)}</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", color: "#991B1B", fontVariantNumeric: "tabular-nums" }}>({fmtCurrency(p.vacancyLoss)})</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(p.egi)}</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", color: "#991B1B", fontVariantNumeric: "tabular-nums" }}>({fmtCurrency(p.opex)})</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(p.noi)}</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", color: "#991B1B", fontVariantNumeric: "tabular-nums" }}>({fmtCurrency(p.capex)})</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", color: "#991B1B", fontVariantNumeric: "tabular-nums" }}>({fmtCurrency(p.debtService)})</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", fontWeight: 700, color: p.cashFlow >= 0 ? "#059669" : "#991B1B", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(p.cashFlow)}</td>
                  <td style={{ padding: "6px 6px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtX(p.dscr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Exit waterfall */}
        <div style={{ marginTop: 18, padding: "14px 16px", background: C.surfLow, borderRadius: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.onSurface, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 }}>
            Year {report.proFormaExit.year} Sale Waterfall
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }} className="orp-exit-grid">
            {[
              ["Exit NOI", fmtCurrency(report.proFormaExit.exitNOI)],
              ["Exit Cap", fmtPct(report.proFormaExit.exitCapPct, 2)],
              ["Gross Sale", fmtCurrency(report.proFormaExit.grossSalePrice)],
              ["Sale Costs (2%)", `(${fmtCurrency(report.proFormaExit.saleCosts)})`],
              ["Loan Payoff", `(${fmtCurrency(report.proFormaExit.loanPayoff)})`],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px dashed ${C.ghost}`, marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.onSurface, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Net Proceeds to Equity
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#059669", fontVariantNumeric: "tabular-nums" }}>
              {fmtCurrency(report.proFormaExit.netProceedsToEquity)}
            </span>
          </div>
        </div>
      </SectionCard>

      {/* ── 8. Replacement Cost Anchor ───────────────── */}
      <SectionCard title="Replacement Cost Anchor" accent="#7C3AED">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }} className="orp-metric-grid">
          <div style={{ background: C.surfLow, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: C.secondary, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
              Replacement Cost / {unitLabel}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
              {fmtCurrency(report.replacementCost.perUnitOrSf)}
            </div>
          </div>
          <div style={{ background: C.surfLow, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: C.secondary, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
              Total Replacement Cost
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
              {fmtCurrency(report.replacementCost.totalReplacementCost)}
            </div>
          </div>
          <div style={{ background: C.surfLow, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: C.secondary, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
              Ask as % of Replacement
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
              {fmtPct(report.replacementCost.askingAsPctOfReplacement, 0)}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.secondary, marginTop: 12, marginBottom: 0, lineHeight: 1.55 }}>
          {report.replacementCost.note}
        </p>
      </SectionCard>

      {/* ── 9. Comparable Sales (placeholder w/ CTA) ─── */}
      <div style={{
        background: C.surfLowest,
        border: `1px solid ${C.ghostBorder}`,
        borderRadius: C.radius,
        marginBottom: 16,
        boxShadow: "0 1px 3px rgba(15,23,43,0.04)",
      }}>
        <button
          type="button"
          onClick={() => setCompsOpen(v => !v)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "transparent", border: "none", padding: "16px 20px", cursor: "pointer",
            fontFamily: "inherit", textAlign: "left",
          }}
          aria-expanded={compsOpen}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 4, height: 16, borderRadius: 2, background: "#0891B2", display: "inline-block" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Comparable Sales
            </span>
            <span style={{ fontSize: 11, color: C.secondary, fontWeight: 500 }}>
              Pull closed comps to confirm the $/{unitLower} implied by the max bid.
            </span>
          </span>
          <span style={{ fontSize: 12, color: C.secondary, fontWeight: 600 }}>{compsOpen ? "Hide" : "Show"}</span>
        </button>

        {compsOpen && (
          <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${C.ghost}`, fontSize: 12, color: C.secondary, lineHeight: 1.55 }}>
            <p style={{ marginTop: 14 }}>
              Comp ingestion is pending. Until connected, validate the implied $/{unitLower} of {fmtCurrency(report.recommendedMaxBid / input.unitsOrSf)} at the max bid against 3 to 5 closed comps within a 1-mile radius from the last 6 months. Use CoStar or submarket broker reports to pull verified pricing, adjusted for vintage, condition, and tenant mix.
            </p>
            <p style={{ marginBottom: 0 }}>
              If the broker's asking price implies a per-{unitLower} above the comp set, the burden of proof is on the seller to justify the premium.
            </p>
          </div>
        )}
      </div>

      {/* ── 10. Bid Strategy ──────────────────────────── */}
      <SectionCard title="Bid Strategy" accent={C.primary}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 14 }} className="orp-grid-12">
          <div style={{ background: "#ECFDF5", border: "1px solid #86EFAC30", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#065F46", fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
              Initial Offer
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
              {fmtCurrency(report.bidStrategy.initialOffer)}
            </div>
            <div style={{ fontSize: 11, color: C.secondary, marginTop: 2 }}>
              {fmtPct(((report.askingPrice - report.bidStrategy.initialOffer) / report.askingPrice) * 100, 1)} below ask
            </div>
          </div>
          <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D30", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#78350F", fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
              Walk-Away Price
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
              {fmtCurrency(report.bidStrategy.walkAwayPrice)}
            </div>
            <div style={{ fontSize: 11, color: C.secondary, marginTop: 2 }}>
              {fmtPct(((report.askingPrice - report.bidStrategy.walkAwayPrice) / report.askingPrice) * 100, 1)} below ask
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="orp-grid-12">
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.onSurface, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
              Diligence Priorities
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.6, color: C.onSurface }}>
              {report.bidStrategy.diligencePriorities.map((t, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <input type="checkbox" style={{ marginRight: 8, accentColor: C.primary, cursor: "pointer" }} aria-label={`Mark diligence item ${i + 1} complete`} />
                  {t}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.onSurface, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
              Next Steps
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.6, color: C.onSurface }}>
              {report.bidStrategy.nextSteps.map((t, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{t}</li>
              ))}
            </ol>
          </div>
        </div>
      </SectionCard>

      {/* Responsive overrides */}
      <style>{`
        @media (max-width: 900px) {
          .orp-scenarios { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .orp-grid-12 { grid-template-columns: 1fr !important; }
          .orp-metric-grid { grid-template-columns: 1fr !important; }
          .orp-exit-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
