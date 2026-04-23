"use client";

import { useMemo, useState } from "react";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import {
  runQuickScreen,
  fmtRange,
  type QuickScreenInput,
  type QuickScreenReport,
  type AssetType,
  type UnitType,
} from "@/lib/analysis/quick-screen";
import { useUnderwritingDefaults } from "@/lib/workspace/use-underwriting-defaults";

/* ── Design tokens (mirror PropertyDetailClient's C object) ─── */
const C = {
  primary: "#4D7C0F",
  primaryText: "#4D7C0F",
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

function fmt$(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val) || val === 0) return "--";
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${Math.round(val).toLocaleString()}`;
  return `$${val.toFixed(0)}`;
}
function fmtPct(val: number | null | undefined, digits = 2): string {
  if (val == null || !Number.isFinite(val)) return "--";
  return `${val.toFixed(digits)}%`;
}
function fmtX(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "--";
  return `${val.toFixed(2)}x`;
}

/* ── Small building blocks ───────────────────────────── */
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
          <span style={{
            width: 4, height: 16, borderRadius: 2,
            background: accent, display: "inline-block",
          }} />
        )}
        <h3 style={{
          fontSize: 13, fontWeight: 700, color: C.onSurface,
          textTransform: "uppercase", letterSpacing: 0.6, margin: 0,
        }}>{title}</h3>
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: C.secondary, marginBottom: 14 }}>{subtitle}</div>
      )}
      {children}
    </div>
  );
}

function MetricRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: `1px solid ${C.ghost}`,
    }}>
      <span style={{ fontSize: 12, color: C.secondary, fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: emphasis ? 15 : 13,
        fontWeight: emphasis ? 700 : 600,
        color: C.onSurface,
        fontVariantNumeric: "tabular-nums",
      }}>{value}</span>
    </div>
  );
}

/* ── Props ────────────────────────────────────────────── */
export interface DealQuickScreenProps {
  property: Property;
  fields: ExtractedField[];
  /** Optional manual overrides to apply on top of parsed fields. */
  overrides?: Partial<QuickScreenInput>;
}

/**
 * Debt + target-return assumptions that come from the workspace-wide
 * standardized baseline (see Settings page). Passed in from the parent
 * so the screen stays pure and testable.
 */
export interface StandardizedBaseline {
  ltvPct: number;
  interestRatePct: number;
  amortYears: number;
  holdYears: number;
  targetLeveredIrrPct: number;
}

/* ── Map property + fields -> calculator input ───────── */
export function buildInput(
  property: Property,
  fields: ExtractedField[],
  baseline: StandardizedBaseline,
  overrides?: Partial<QuickScreenInput>,
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

  // Choose unit basis: SF for commercial, units for multifamily/land
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

  // Debt and target-return assumptions ALWAYS come from the workspace
  // standardized baseline, never from the OM. This is what makes scoring
  // comparable across deals. OM-stated debt terms are displayed as a
  // read-only reference in the Assumptions block at the bottom.
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
    inPlaceRentPerUnit: marketRent, // conservatively assume same unless data says otherwise
    statedCapRatePct: statedCapRate,
    yearBuilt,
    ltv: baseline.ltvPct / 100,
    interestRatePct: baseline.interestRatePct,
    amortYears: baseline.amortYears,
    holdYears: baseline.holdYears,
    targetIrrPct: baseline.targetLeveredIrrPct,
    ...overrides,
  };
}

/**
 * Pull OM-stated debt terms out of the property fields so they can be
 * displayed as read-only reference rows. These values do NOT feed the
 * calculator; they exist only for the user to spot-check the delta
 * against the standardized baseline.
 */
function readOmDebtTerms(fields: ExtractedField[]): {
  ltvPct: number | null;
  interestRatePct: number | null;
  amortYears: number | null;
} {
  const ltv = Number(gf(fields, "debt_assumptions", "ltv"));
  const rate = Number(gf(fields, "debt_assumptions", "interest_rate"));
  const amort = Number(gf(fields, "debt_assumptions", "amortization_years"));
  return {
    ltvPct: Number.isFinite(ltv) && ltv > 0 ? ltv : null,
    interestRatePct: Number.isFinite(rate) && rate > 0 ? rate : null,
    amortYears: Number.isFinite(amort) && amort > 0 ? amort : null,
  };
}

/* ══════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                            */
/* ══════════════════════════════════════════════════════════ */
export default function DealQuickScreen({ property, fields, overrides }: DealQuickScreenProps) {
  const workspaceId = property.workspaceId || null;
  const { defaults } = useUnderwritingDefaults(workspaceId);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const baseline: StandardizedBaseline = useMemo(() => ({
    ltvPct: defaults.ltv,
    interestRatePct: defaults.interestRate,
    amortYears: defaults.amortYears,
    holdYears: defaults.holdYears,
    targetLeveredIrrPct: defaults.targetLeveredIrr,
  }), [defaults]);

  const omDebt = useMemo(() => readOmDebtTerms(fields), [fields]);
  const input = useMemo(
    () => buildInput(property, fields, baseline, overrides),
    [property, fields, baseline, overrides],
  );
  const report: QuickScreenReport | null = useMemo(() => (input ? runQuickScreen(input) : null), [input]);

  if (!input || !report) {
    return (
      <div style={{
        background: C.surfLowest, border: `1px dashed ${C.ghost}`,
        borderRadius: C.radius, padding: 32, textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, marginBottom: 6 }}>
          Quick Screen is waiting on core inputs
        </div>
        <div style={{ fontSize: 12, color: C.secondary, maxWidth: 420, margin: "0 auto", lineHeight: 1.5 }}>
          A Buy / Neutral / Pass read needs at minimum an asking price and unit count (or building SF).
          Upload the OM or fill those fields on the Details tab and this view will run automatically.
        </div>
      </div>
    );
  }

  const s = report.snapshot;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Back-of-napkin returns (3 scenarios) ───────── */}
      <SectionCard title="Back-of-Napkin Returns" subtitle="Ranges, not point estimates. Meant for triage, not underwriting." accent="#7C3AED">
        <div className="qs-scenario-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12,
        }}>
          {report.scenarios.map(sc => {
            // Canonical greens: all "good / bull / positive" uses the brand lime
            // family (#4D7C0F) with a dark-lime text (#4D7C0F) so it reads as
            // one color across tabs, pills, and scenario cards.
            const color = sc.label === "Bull" ? "#4D7C0F" : sc.label === "Base" ? "#2563EB" : "#DC2626";
            const bg = sc.label === "Bull" ? "#F7FEE7" : sc.label === "Base" ? "#EFF6FF" : "#FEF2F2";
            return (
              <div key={sc.label} style={{
                background: bg,
                borderRadius: 10,
                padding: "14px 16px",
                border: `1px solid ${color}20`,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: 0.8, textTransform: "uppercase" }}>
                    {sc.label}
                  </span>
                  <span style={{ fontSize: 10, color: C.secondary }}>
                    {sc.rentGrowthPct > 0 ? "+" : ""}{sc.rentGrowthPct}% rent, {sc.exitCapBps > 0 ? "+" : ""}{sc.exitCapBps}bps exit
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.onSurface, lineHeight: 1.1 }}>
                  {sc.leveredIrrPct != null ? `${sc.leveredIrrPct.toFixed(1)}%` : "--"}
                </div>
                <div style={{ fontSize: 10, color: C.secondary, marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Levered IRR
                </div>
                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: C.secondary }}>Equity multiple</span>
                  <span style={{ fontWeight: 700, color: C.onSurface }}>
                    {sc.equityMultiple != null ? `${sc.equityMultiple.toFixed(2)}x` : "--"}
                  </span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: C.secondary }}>Unlevered IRR</span>
                  <span style={{ fontWeight: 600, color: C.onSurface }}>
                    {sc.unleveredIrrPct != null ? `${sc.unleveredIrrPct.toFixed(1)}%` : "--"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Three ways it works / dies ─────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
      }}
      className="qs-grid-12"
      >
        <SectionCard title="Three Ways This Deal Works" accent="#059669">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: C.onSurface }}>
            {report.waysItWorks.map((t, i) => <li key={i} style={{ marginBottom: 8 }}>{t}</li>)}
          </ul>
        </SectionCard>
        <SectionCard title="Three Ways This Deal Dies" accent="#DC2626">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: C.onSurface }}>
            {report.waysItDies.map((t, i) => <li key={i} style={{ marginBottom: 8 }}>{t}</li>)}
          </ul>
        </SectionCard>
      </div>

      {/* ── Assumptions footer (collapsed by default) ────── */}
      {/*    Shows the standardized baseline the scoring used, plus OM-stated  */}
      {/*    debt terms as reference-only rows so the user can spot-check the  */}
      {/*    delta without those values ever feeding the calculator.           */}
      <div style={{
        background: C.surfLowest,
        border: `1px solid ${C.ghostBorder}`,
        borderRadius: C.radius,
        marginBottom: 16,
        boxShadow: "0 1px 3px rgba(15,23,43,0.04)",
      }}>
        <button
          type="button"
          onClick={() => setAssumptionsOpen(v => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "transparent",
            border: "none",
            padding: "16px 20px",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
          aria-expanded={assumptionsOpen}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 4, height: 16, borderRadius: 2, background: C.secondary, display: "inline-block" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Assumptions
            </span>
            <span style={{ fontSize: 11, color: C.secondary, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
              Standardized baseline used for scoring. OM-stated debt shown for reference only.
            </span>
          </span>
          <span style={{ fontSize: 12, color: C.secondary, fontWeight: 600 }}>
            {assumptionsOpen ? "Hide" : "Show"}
          </span>
        </button>

        {assumptionsOpen && (
          <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${C.ghost}` }}>
            {/* Baseline assumptions used for scoring */}
            <div style={{ marginTop: 14 }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                columnGap: 24,
                marginBottom: 12,
              }}>
                {report.assumptions.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 0", borderBottom: `1px solid ${C.ghost}`, gap: 10,
                  }}>
                    <span style={{ fontSize: 12, color: C.secondary, fontWeight: 500 }}>
                      {a.variable}
                      {a.source === "estimated" && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "#FEF3C7", color: "#92400E", fontWeight: 700, letterSpacing: 0.4 }}>
                          EST
                        </span>
                      )}
                      {a.source === "market_default" && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "#EDE9FE", color: "#5B21B6", fontWeight: 700, letterSpacing: 0.4 }}>
                          MKT
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                      {a.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* OM-stated debt terms: reference only, never fed to the calculator */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.onSurface, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                OM-Stated Debt (reference only)
              </div>
              <div style={{ fontSize: 11, color: C.secondary, marginBottom: 8, lineHeight: 1.5 }}>
                These values appear in the OM but do NOT drive scoring. They exist so you can compare the seller&apos;s assumed financing to the workspace baseline.
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                columnGap: 24,
                background: "#FAFBFC",
                border: `1px dashed ${C.ghost}`,
                borderRadius: 8,
                padding: "6px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.ghost}` }}>
                  <span style={{ fontSize: 12, color: C.secondary }}>OM LTV</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {omDebt.ltvPct != null ? `${omDebt.ltvPct.toFixed(0)}%` : "Not stated"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.ghost}` }}>
                  <span style={{ fontSize: 12, color: C.secondary }}>OM Interest Rate</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {omDebt.interestRatePct != null ? `${omDebt.interestRatePct.toFixed(2)}%` : "Not stated"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0" }}>
                  <span style={{ fontSize: 12, color: C.secondary }}>OM Amortization</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {omDebt.amortYears != null ? `${omDebt.amortYears} yrs` : "Not stated"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0" }}>
                  <span style={{ fontSize: 12, color: C.secondary }}>Stated Cap Rate</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                    {s.goingInCapRatePct != null && input.statedCapRatePct ? `${input.statedCapRatePct.toFixed(2)}%` : "Not stated"}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: C.secondary, lineHeight: 1.5 }}>
              Baseline is set workspace-wide on the{" "}
              <a href="/workspace/settings" style={{ color: C.primaryText, textDecoration: "none", fontWeight: 600 }}>Settings page</a>.
              Scoring stays comparable across deals as long as every property in a workspace uses the same baseline.
            </div>
          </div>
        )}
      </div>

      {/* Responsive overrides */}
      <style>{`
        @media (max-width: 768px) {
          .qs-grid-12 { grid-template-columns: 1fr !important; }
          .qs-scenario-grid { grid-template-columns: 1fr !important; }
          .qs-snapshot-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
