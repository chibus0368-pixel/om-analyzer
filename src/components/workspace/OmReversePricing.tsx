"use client";

/**
 * OM Reverse Pricing (Pro Analysis tab)
 *
 * Owns ONE concern: "what's the right price?"
 *
 * Sections, in order:
 *   1. Slim verdict strip (mirrors the main page Buy / Neutral / Pass).
 *   2. Pricing Scenarios - 3 cards: Broker's projections at ask,
 *      Adjusted base case at ask, Max bid that clears target IRR.
 *   3. Sale Price Scenarios - the old price-sensitivity table redone as
 *      a card grid at ask +/- 15% so pass/fail-vs-target is visible at a
 *      glance. Replaces the dense tabular version.
 *   4. Exit Cap x Rent Growth heatmap.
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
  fmtX,
  type OmReversePricingInput,
  type OmReversePricingReport,
  type AssetType,
  type UnitType,
} from "@/lib/analysis/om-reverse-pricing";
import { useUnderwritingDefaults } from "@/lib/workspace/use-underwriting-defaults";
import DealVerdictBox from "@/components/workspace/DealVerdictBox";

/* ── Design tokens (shared with DealQuickScreen) ────── */
const C = {
  primary: "#84CC16",
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
          To reverse-engineer a bid, we need at minimum an asking price and property size (units or SF).
          Upload the OM or fill those fields on the Details tab and this view will populate.
        </div>
      </div>
    );
  }

  const unitLabel = input.unitType === "units" ? "Unit" : "SF";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Slim verdict strip. Main page owns the full rationale. ── */}
      <DealVerdictBox property={property} fields={fields} variant="slim" />

      {/* ── Pricing Scenarios (Broker / Adjusted / Max Bid) ───────── */}
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

      {/* ── Sale Price Scenarios (replaces the old Price Sensitivity table) ─ */}
      {/*    Same card-grid visual language as the Pricing Scenarios above.  */}
      {/*    Each card answers: "what happens to returns if we buy at this    */}
      {/*    price?" Pass/fail against target IRR is color-coded.             */}
      <SectionCard
        title="Sale Price Scenarios"
        subtitle={`Returns under adjusted assumptions at asking +/- 15%. Green clears the ${baseline.targetLeveredIrrPct.toFixed(0)}% target IRR; red misses by more than 3 points.`}
        accent="#0891B2"
      >
        <div className="orp-price-scenarios" style={{
          display: "grid",
          gridTemplateColumns: `repeat(${report.priceSensitivity.length}, minmax(0, 1fr))`,
          gap: 10,
        }}>
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
            return (
              <div key={row.purchasePriceDeltaPct} style={{
                background: bg,
                borderRadius: 10,
                padding: "12px 14px",
                border: `1px solid ${color}30`,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: 0.8, textTransform: "uppercase" }}>
                    {header}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.8 }}>
                    {verdict}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.onSurface, fontVariantNumeric: "tabular-nums", marginTop: 6 }}>
                  {fmtCurrency(row.purchasePrice)}
                </div>
                <div style={{ fontSize: 10, color: C.secondary, marginBottom: 10 }}>
                  {fmtCurrency(row.purchasePrice / input.unitsOrSf)} / {unitLabel}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: C.secondary, fontWeight: 600 }}>Going-in Cap</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {fmtPct(row.goingInCapPct, 2)}
                  </span>
                </div>
                <div style={{ borderTop: `1px dashed ${C.ghost}`, margin: "6px 0" }} />
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Levered IRR</span>
                  <span style={{ fontSize: 17, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                    {fmtPct(irr, 1)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Exit Cap x Rent Growth heatmap ────────────────────────── */}
      <SectionCard
        title="Exit Cap x Rent Growth"
        subtitle="Levered IRR at asking under a grid of exit cap and rent growth combinations. Green clears the target; red misses by more than 3 points."
        accent="#7C3AED"
      >
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 360 }}>
            <thead>
              <tr style={{ color: C.secondary, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                <th style={{ padding: "6px 8px", borderBottom: `1px solid ${C.ghost}`, textAlign: "left" }}>Exit Cap \ Rent Growth</th>
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

      {/* Responsive overrides */}
      <style>{`
        @media (max-width: 1024px) {
          .orp-price-scenarios { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 900px) {
          .orp-scenarios { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .orp-price-scenarios { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 480px) {
          .orp-price-scenarios { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
