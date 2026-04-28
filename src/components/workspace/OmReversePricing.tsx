"use client";

/**
 * OM Reverse Pricing (Pro Analysis tab)
 *
 * Owns ONE concern: "what's the right price?"
 *
 * Sections, in order:
 *   1. Sale Price Scenarios - vertical table at ask +/- 15% with IRR
 *      color-coded pass/fail against the workspace target.
 *   2. Exit Cap x Rent Growth heatmap.
 *
 * Sections intentionally NOT here (live elsewhere, don't duplicate):
 *   - Buy/Neutral/Pass rationale        -> main page DealVerdictBox
 *   - Three Ways Works / Three Ways Dies -> Deal Quick Screen tab
 *   - Rent roll / tenant detail         -> Rent Roll tab
 *   - OM field summary, broker critique, pro forma, replacement cost,
 *     comparable sales, bid strategy    -> removed; keep this tab focused
 */

import { useMemo } from "react";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import {
  runOmReversePricing,
  fmtCurrency,
  fmtPct,
  type OmReversePricingInput,
  type OmReversePricingReport,
  type AssetType,
  type UnitType,
} from "@/lib/analysis/om-reverse-pricing";
import { useUnderwritingDefaults } from "@/lib/workspace/use-underwriting-defaults";

/* ── Design tokens (shared with DealQuickScreen) ────── */
const C = {
  primary: "#4D7C0F",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  surfLow: "#F3F4F6",
  surfLowest: "#ffffff",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  radius: 12,
};

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

export interface OmReversePricingProps {
  property: Property;
  fields: ExtractedField[];
}

/* ══════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                            */
/* ══════════════════════════════════════════════════════════ */
export default function OmReversePricing({ property, fields }: OmReversePricingProps) {
  const workspaceId = property.workspaceId || null;
  const { defaults } = useUnderwritingDefaults(workspaceId);

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
          To reverse-engineer a bid, we need at minimum an asking price and property size (units or SF for buildings; acres for land).
          Re-upload a more detailed OM, or click any extracted value on the Summary tab to edit it inline.
        </div>
      </div>
    );
  }

  const unitLabel = input.unitType === "units" ? "Unit" : "SF";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Scoped mobile styles. The Sale Price Scenarios table carried
          six columns with minWidth:480 which forced a horizontal
          scroll on a 375px iPhone. On phones we drop Levered IRR and
          Verdict (the verdict is implied by the color-tinted IRR cell
          on desktop; on a small screen we lean on the Going-in Cap
          as the single "is this priced right?" signal) and relax the
          minWidth so the remaining four columns fit the viewport. */}
      <style>{`
        @media (max-width: 768px) {
          .orp-col-irr,
          .orp-col-verdict,
          .orp-col-ppsf { display: none !important; }
          .orp-price-scenarios { min-width: 0 !important; font-size: 11px !important; }
          .orp-price-scenarios th,
          .orp-price-scenarios td { padding: 7px 5px !important; }
          /* Rent growth heatmap: smaller font + tighter cells */
          .orp-heatmap { min-width: 0 !important; font-size: 11px !important; }
          .orp-heatmap th,
          .orp-heatmap td { padding: 6px 4px !important; font-size: 10px !important; }
          .orp-heatmap th { font-size: 8px !important; letter-spacing: 0 !important; }
        }
      `}</style>
      {/* ── Sale Price Scenarios (vertical table) ─────────────────── */}
      {/*    One row per price scenario. Pass/fail against target IRR   */}
      {/*    is color-coded on the IRR cell.                            */}
      <SectionCard
        title="Sale Price Scenarios"
        subtitle={`Returns under adjusted assumptions at asking +/- 15%. Green clears the ${baseline.targetLeveredIrrPct.toFixed(0)}% target IRR; red misses by more than 3 points.`}
        accent="#0891B2"
      >
        <div style={{ overflowX: "auto", overflowY: "visible" }}>
          <table className="orp-price-scenarios" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                <th style={{ padding: "8px 10px", borderBottom: `1px solid ${C.ghost}`, textAlign: "left" }}>Scenario</th>
                <th style={{ padding: "8px 10px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Purchase Price</th>
                <th className="orp-col-ppsf" style={{ padding: "8px 10px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Price / {unitLabel}</th>
                <th style={{ padding: "8px 10px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Going-in Cap</th>
                <th className="orp-col-irr" style={{ padding: "8px 10px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Levered IRR</th>
                <th className="orp-col-verdict" style={{ padding: "8px 10px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {report.priceSensitivity.map(row => {
                const target = baseline.targetLeveredIrrPct;
                const irr = row.leveredIrrPct;
                const clears = irr != null && irr >= target;
                const misses = irr != null && irr < target - 3;
                const color = clears ? "#059669" : misses ? "#DC2626" : "#D97706";
                const bg = clears ? "#ECFDF5" : misses ? "#FEF2F2" : "#FFFBEB";
                const header =
                  row.purchasePriceDeltaPct === 0 ? "At Ask"
                  : row.purchasePriceDeltaPct > 0 ? `+${row.purchasePriceDeltaPct}%`
                  : `${row.purchasePriceDeltaPct}%`;
                const verdict = clears ? "Clears Target" : misses ? "Misses Badly" : "Below Target";
                const isAtAsk = row.purchasePriceDeltaPct === 0;
                const BORDER_GREY = "#9CA3AF";
                const baseBorder = `1px solid ${C.ghost}`;
                const topBorder = isAtAsk ? `1.5px solid ${BORDER_GREY}` : "none";
                const bottomBorder = isAtAsk ? `1.5px solid ${BORDER_GREY}` : baseBorder;
                const leftBorder = isAtAsk ? `1.5px solid ${BORDER_GREY}` : "none";
                const rightBorder = isAtAsk ? `1.5px solid ${BORDER_GREY}` : "none";
                const rowTint = "transparent";
                return (
                  <tr key={row.purchasePriceDeltaPct}>
                    <td style={{ padding: "10px", borderTop: topBorder, borderBottom: bottomBorder, borderLeft: leftBorder, background: rowTint, fontWeight: 800, color, letterSpacing: 0.4, textTransform: "uppercase", fontSize: 11 }}>
                      {header}
                    </td>
                    <td style={{ padding: "10px", borderTop: topBorder, borderBottom: bottomBorder, background: rowTint, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: C.onSurface }}>
                      {fmtCurrency(row.purchasePrice)}
                    </td>
                    <td className="orp-col-ppsf" style={{ padding: "10px", borderTop: topBorder, borderBottom: bottomBorder, background: rowTint, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.secondary }}>
                      {fmtCurrency(row.purchasePrice / input.unitsOrSf)}
                    </td>
                    <td style={{ padding: "10px", borderTop: topBorder, borderBottom: bottomBorder, background: rowTint, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: C.onSurface }}>
                      {fmtPct(row.goingInCapPct, 2)}
                    </td>
                    <td className="orp-col-irr" style={{ padding: "10px", borderTop: topBorder, borderBottom: bottomBorder, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800, color, background: bg }}>
                      {fmtPct(irr, 1)}
                    </td>
                    <td className="orp-col-verdict" style={{ padding: "10px", borderTop: topBorder, borderBottom: bottomBorder, borderRight: rightBorder, background: rowTint, textAlign: "right", fontSize: 10, fontWeight: 700, color, letterSpacing: 0.4, textTransform: "uppercase" }}>
                      {verdict}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Return Sensitivity: Exit Cap x Rent Growth heatmap ────── */}
      <SectionCard
        title="Return Sensitivity: Exit Pricing & Rent Growth"
        subtitle={`How your levered IRR holds up when the market exit cap shifts (rows) or rents grow slower than hoped (columns). Green clears the ${baseline.targetLeveredIrrPct.toFixed(0)}% target; amber is below target; red misses by more than 3 points. Hover any cell for a plain-English read.`}
        accent="#7C3AED"
      >
        <div style={{ overflowX: "auto", overflowY: "visible" }}>
          <table className="orp-heatmap" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              {/* Axis banner: tells you what columns vs rows represent */}
              <tr>
                <th style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${C.ghost}`,
                  background: C.surfLow,
                  textAlign: "left",
                  fontSize: 9, fontWeight: 800, color: C.secondary,
                  textTransform: "uppercase", letterSpacing: 0.6,
                }}>
                  Exit Cap <span style={{ opacity: 0.5 }}>↓</span>
                </th>
                <th colSpan={report.exitCapRentGrowthMatrix.rentGrowthsPct.length} style={{
                  padding: "8px 10px",
                  borderBottom: `1px solid ${C.ghost}`,
                  background: C.surfLow,
                  textAlign: "center",
                  fontSize: 9, fontWeight: 800, color: C.secondary,
                  textTransform: "uppercase", letterSpacing: 0.6,
                }}>
                  Annual Rent Growth <span style={{ opacity: 0.5 }}>→</span>
                </th>
              </tr>
              {/* Value header row with unit-annotated labels */}
              <tr style={{ color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                <th style={{ padding: "6px 10px", borderBottom: `1px solid ${C.ghost}`, textAlign: "left" }}>
                  Cap Rate at Sale
                </th>
                {report.exitCapRentGrowthMatrix.rentGrowthsPct.map(rg => (
                  <th key={rg} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "right" }}>
                    {rg.toFixed(1)}% / yr
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.exitCapRentGrowthMatrix.exitCapsPct.map(ec => (
                <tr key={ec}>
                  <td
                    title={`Assumes the property sells at a ${ec.toFixed(2)}% exit cap rate. Higher exit caps = lower sale price.`}
                    style={{
                      padding: "8px 10px",
                      borderBottom: `1px solid ${C.ghost}`,
                      fontWeight: 700,
                      color: C.onSurface,
                      cursor: "help",
                    }}
                  >
                    {ec.toFixed(2)}%
                  </td>
                  {report.exitCapRentGrowthMatrix.rentGrowthsPct.map(rg => {
                    const cell = report.exitCapRentGrowthMatrix.cells.find(c => c.exitCapPct === ec && c.rentGrowthPct === rg);
                    const v = cell?.leveredIrrPct ?? null;
                    const target = baseline.targetLeveredIrrPct;
                    const meetsTarget = v != null && v >= target;
                    const miss = v != null && v < target - 3;
                    const bg = v == null ? "transparent" : meetsTarget ? "#D1FAE5" : miss ? "#FEE2E2" : "#FEF3C7";
                    const fg = v == null ? C.secondary : meetsTarget ? "#065F46" : miss ? "#991B1B" : "#78350F";

                    // Build a plain-English tooltip
                    const verdictText =
                      v == null ? "IRR could not be calculated for this combo."
                      : meetsTarget ? `Clears your ${target.toFixed(0)}% target by ${(v - target).toFixed(1)} pts.`
                      : miss ? `Misses your ${target.toFixed(0)}% target by ${(target - v).toFixed(1)} pts. Meaningful return risk.`
                      : `Short of your ${target.toFixed(0)}% target by ${(target - v).toFixed(1)} pts.`;
                    const tip = v == null
                      ? `Sell at a ${ec.toFixed(2)}% exit cap with ${rg.toFixed(1)}% annual rent growth. ${verdictText}`
                      : `If you sell at a ${ec.toFixed(2)}% exit cap and rents grow ${rg.toFixed(1)}% per year, levered IRR is ${v.toFixed(1)}%. ${verdictText}`;

                    return (
                      <td
                        key={rg}
                        title={tip}
                        style={{
                          padding: "8px",
                          borderBottom: `1px solid ${C.ghost}`,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 700,
                          background: bg,
                          color: fg,
                          cursor: v == null ? "default" : "help",
                        }}
                      >
                        {fmtPct(v, 1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Inline legend */}
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 14,
            marginTop: 10, paddingTop: 10,
            borderTop: `1px dashed ${C.ghost}`,
            fontSize: 11, color: C.secondary,
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#D1FAE5", border: "1px solid #065F4633" }} />
              Clears target
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#FEF3C7", border: "1px solid #78350F33" }} />
              Below target (within 3 pts)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#FEE2E2", border: "1px solid #991B1B33" }} />
              Misses by more than 3 pts
            </span>
          </div>
        </div>
      </SectionCard>

    </div>
  );
}
