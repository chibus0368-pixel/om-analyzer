"use client";

/**
 * FinancialsSummary (Pro Analysis tab)
 *
 * Owns ONE concern: "what does this deal look like in pro-forma form?"
 *
 * Sections, in order:
 *   1. Year 1 Operating Statement       - PGI / Vacancy / EGI / OpEx / NOI
 *   2. Sources & Uses                   - purchase price, debt, equity
 *   3. 5-Year Cash Flow Projection      - NOI growth, debt service, CoC
 *   4. Returns Snapshot                 - cap rate, DSCR, debt yield, IRR est.
 *
 * Values are pulled from the same `ExtractedField` set the rest of the
 * property page reads (income / expenses / pricing_deal_terms /
 * debt_assumptions / property_basics) and combined with the workspace's
 * UnderwritingDefaults (LTV, rate, amort, growth, hold, exit cap) so the
 * numbers are comparable across deals in the same dealboard.
 */

import { useMemo } from "react";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import { useUnderwritingDefaults } from "@/lib/workspace/use-underwriting-defaults";

/* Design tokens (match other Pro Analysis tabs) */
const C = {
  primary: "#4D7C0F",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  surfLow: "#F3F4F6",
  surfLowest: "#FFFFFF",
  ghost: "rgba(0,0,0,0.06)",
  ghostBorder: "rgba(0,0,0,0.04)",
  radius: 12,
  positive: "#15803D",
  negative: "#B91C1C",
  accent: "#84CC16",
};

/* Helpers */
function gf(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n) || isNaN(n)) return "--";
  const abs = Math.abs(n);
  const formatted = `$${Math.round(abs).toLocaleString()}`;
  if (n < 0) return `(${formatted})`;
  return formatted;
}

function fmtPct(n: number | null | undefined, digits: number = 2): string {
  if (n === null || n === undefined || !isFinite(n) || isNaN(n)) return "--";
  return `${n.toFixed(digits)}%`;
}

function fmtX(n: number | null | undefined, digits: number = 2): string {
  if (n === null || n === undefined || !isFinite(n) || isNaN(n)) return "--";
  return `${n.toFixed(digits)}x`;
}

/* Building blocks */
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

interface ProFormaRowProps {
  label: string;
  value: string;
  bold?: boolean;
  total?: boolean;
  indent?: boolean;
  hint?: string;
  isNegative?: boolean;
}

function ProFormaRow({ label, value, bold, total, indent, hint, isNegative }: ProFormaRowProps) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: total ? "10px 12px" : "7px 12px",
      paddingLeft: indent ? 26 : 12,
      borderTop: total ? `2px solid ${C.onSurface}` : `1px solid ${C.ghostBorder}`,
      background: total ? "#F9FAFB" : "transparent",
    }}>
      <span style={{
        fontSize: total ? 13 : 12,
        fontWeight: bold || total ? 700 : 500,
        color: bold || total ? C.onSurface : C.secondary,
        letterSpacing: total ? 0.3 : 0,
        textTransform: total ? "uppercase" : "none",
      }}>
        {label}
        {hint && (
          <span style={{
            marginLeft: 8, fontSize: 10, fontWeight: 500, color: "#9CA3AF", letterSpacing: 0,
          }}>{hint}</span>
        )}
      </span>
      <span style={{
        fontSize: total ? 14 : 12,
        fontWeight: bold || total ? 700 : 500,
        color: isNegative ? C.negative : C.onSurface,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}

/* MAIN COMPONENT */
export interface FinancialsSummaryProps {
  property: Property;
  fields: ExtractedField[];
  wsType: string;
  omPurchasePrice: number | null;
}

export default function FinancialsSummary({
  property, fields, wsType, omPurchasePrice,
}: FinancialsSummaryProps) {
  const workspaceId = property.workspaceId || null;
  const { defaults } = useUnderwritingDefaults(workspaceId);

  /* Pulled inputs */
  const inputs = useMemo(() => {
    const askingPrice = Number(gf(fields, "pricing_deal_terms", "asking_price"))
      || omPurchasePrice
      || 0;
    const buildingSf = Number(gf(fields, "property_basics", "building_sf")) || 0;
    const noiOm = Number(gf(fields, "expenses", "noi_om")) || 0;
    const noiAdj = Number(gf(fields, "expenses", "noi_adjusted")) || 0;
    const baseRent = Number(gf(fields, "income", "base_rent")) || 0;
    const nnnReimb = Number(gf(fields, "income", "nnn_reimbursements")) || 0;
    const otherInc = Number(gf(fields, "income", "other_income")) || 0;
    const camExp = Number(gf(fields, "expenses", "cam_expenses")) || 0;
    const propTax = Number(gf(fields, "expenses", "property_taxes")) || 0;
    const insurance = Number(gf(fields, "expenses", "insurance")) || 0;
    const mgmtFee = Number(gf(fields, "expenses", "management_fee")) || 0;
    const reservesField = Number(gf(fields, "expenses", "reserves")) || 0;
    const otherExp = Number(gf(fields, "expenses", "other_expenses")) || 0;
    const totalExpField = Number(gf(fields, "expenses", "total_expenses")) || 0;

    return {
      askingPrice, buildingSf, noiOm, noiAdj, baseRent, nnnReimb, otherInc,
      camExp, propTax, insurance, mgmtFee, reservesField, otherExp, totalExpField,
    };
  }, [fields, omPurchasePrice]);

  /* Derived Year 1 pro forma */
  const year1 = useMemo(() => {
    const pgi = inputs.baseRent + inputs.nnnReimb + inputs.otherInc;
    const vacancyPct = defaults.vacancy / 100;
    const vacancyLoss = pgi * vacancyPct;
    const egi = pgi - vacancyLoss;

    // Reserves: use OM value if present, otherwise fall back to a $0.25/SF
    // floor so the pro forma reflects a realistic underwrite.
    const reserves = inputs.reservesField > 0
      ? inputs.reservesField
      : (inputs.buildingSf > 0 ? inputs.buildingSf * 0.25 : 0);

    const totalExp = inputs.camExp + inputs.propTax + inputs.insurance
      + inputs.mgmtFee + reserves + inputs.otherExp;
    const noiUw = egi - totalExp;

    return { pgi, vacancyPct, vacancyLoss, egi, reserves, totalExp, noiUw };
  }, [inputs, defaults]);

  /* Capital stack */
  const capStack = useMemo(() => {
    const closingPct = 0.02;
    const ltvPct = defaults.ltv / 100;
    const intRate = defaults.interestRate / 100;
    const amortYrs = defaults.amortYears;

    const price = inputs.askingPrice;
    const closingCosts = price * closingPct;
    const loan = price * ltvPct;
    const equity = price - loan + closingCosts;
    const mRate = intRate / 12;
    const annualDS = loan > 0 && mRate > 0
      ? (loan * mRate) / (1 - Math.pow(1 + mRate, -12 * amortYrs)) * 12
      : 0;

    return { closingPct, ltvPct, intRate, amortYrs, price, closingCosts, loan, equity, annualDS };
  }, [inputs.askingPrice, defaults]);

  /* 5-year cash flow projection */
  const projection = useMemo(() => {
    const rentGr = defaults.rentGrowth / 100;
    const expGr = defaults.expenseGrowth / 100;

    const pgi0 = year1.pgi;
    const opex0 = year1.totalExp;
    const vacPct = year1.vacancyPct;
    const ds = capStack.annualDS;
    const equity = capStack.equity;

    const rows: Array<{
      year: number; egi: number; opex: number; noi: number;
      ds: number; cashFlow: number; coc: number | null;
    }> = [];

    for (let yr = 1; yr <= 5; yr++) {
      const pgiY = pgi0 * Math.pow(1 + rentGr, yr - 1);
      const opexY = opex0 * Math.pow(1 + expGr, yr - 1);
      const egiY = pgiY * (1 - vacPct);
      const noiY = egiY - opexY;
      const cashY = noiY - ds;
      const cocY = equity > 0 ? (cashY / equity) * 100 : null;
      rows.push({ year: yr, egi: egiY, opex: opexY, noi: noiY, ds, cashFlow: cashY, coc: cocY });
    }
    return { rentGr, expGr, rows };
  }, [year1, capStack, defaults]);

  /* Returns snapshot */
  const returns = useMemo(() => {
    const { price, loan, equity, annualDS } = capStack;
    const noi = year1.noiUw;

    const capRate = price > 0 && noi > 0 ? (noi / price) * 100 : null;
    const priceSf = price > 0 && inputs.buildingSf > 0 ? price / inputs.buildingSf : null;
    const dscr = annualDS > 0 && noi > 0 ? noi / annualDS : null;
    const debtYield = loan > 0 && noi > 0 ? (noi / loan) * 100 : null;
    const coc = equity > 0 ? ((noi - annualDS) / equity) * 100 : null;

    // Rough levered IRR: assume sale at year `holdYears` at the workspace's
    // exit cap, less 2.5% selling costs. Cash flows = annual levered CF +
    // sale proceeds in final year.
    const exitCap = defaults.exitCap / 100;
    const holdYrs = defaults.holdYears || 5;
    const rentGr = defaults.rentGrowth / 100;
    const expGr = defaults.expenseGrowth / 100;
    const sellPct = 0.025;

    let irrPct: number | null = null;
    if (equity > 0 && exitCap > 0 && noi > 0 && holdYrs > 0) {
      const flows: number[] = [-equity];
      for (let yr = 1; yr <= holdYrs; yr++) {
        const pgiY = year1.pgi * Math.pow(1 + rentGr, yr - 1);
        const opexY = year1.totalExp * Math.pow(1 + expGr, yr - 1);
        const egiY = pgiY * (1 - year1.vacancyPct);
        const noiY = egiY - opexY;
        let cashY = noiY - annualDS;
        if (yr === holdYrs) {
          const noiNext = noiY * (1 + rentGr);
          const salePrice = noiNext / exitCap;
          const netSale = salePrice * (1 - sellPct);
          const mRate = (defaults.interestRate / 100) / 12;
          const totalMo = defaults.amortYears * 12;
          const paidMo = holdYrs * 12;
          const remainingBal = mRate > 0 && totalMo > paidMo
            ? loan * (Math.pow(1 + mRate, totalMo) - Math.pow(1 + mRate, paidMo))
              / (Math.pow(1 + mRate, totalMo) - 1)
            : Math.max(loan - (loan / Math.max(defaults.amortYears, 1)) * holdYrs, 0);
          cashY += netSale - remainingBal;
        }
        flows.push(cashY);
      }
      // Bisection IRR
      let lo = -0.5, hi = 1.0;
      const npv = (r: number) => flows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i), 0);
      let nLo = npv(lo), nHi = npv(hi);
      if (isFinite(nLo) && isFinite(nHi) && nLo * nHi < 0) {
        for (let i = 0; i < 80; i++) {
          const mid = (lo + hi) / 2;
          const nMid = npv(mid);
          if (Math.abs(nMid) < 1) { lo = mid; break; }
          if (nMid * nLo < 0) { hi = mid; nHi = nMid; }
          else { lo = mid; nLo = nMid; }
        }
        irrPct = ((lo + hi) / 2) * 100;
      }
    }

    return { capRate, priceSf, dscr, debtYield, coc, irrPct };
  }, [capStack, year1, inputs.buildingSf, defaults]);

  /* Empty / land states */
  if (wsType === "land") {
    return (
      <div style={{
        background: C.surfLowest, border: `1px dashed ${C.ghost}`,
        borderRadius: C.radius, padding: 32, textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🏞️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, marginBottom: 6 }}>
          Pro forma does not apply to land deals
        </div>
        <div style={{ fontSize: 12, color: C.secondary, maxWidth: 440, margin: "0 auto", lineHeight: 1.5 }}>
          Land deals don't have an income statement. Use the Quick Screen tab for basis-driven triage and the
          Offer Scenarios tab for residual-land bid math.
        </div>
      </div>
    );
  }

  if (!inputs.askingPrice || (!inputs.baseRent && !inputs.noiOm && !inputs.noiAdj)) {
    return (
      <div style={{
        background: C.surfLowest, border: `1px dashed ${C.ghost}`,
        borderRadius: C.radius, padding: 32, textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, marginBottom: 6 }}>
          Financials need core inputs
        </div>
        <div style={{ fontSize: 12, color: C.secondary, maxWidth: 440, margin: "0 auto", lineHeight: 1.5 }}>
          To build the pro forma we need at minimum a purchase price and either base rent or stated NOI.
          Re-upload a more detailed OM, or click any extracted value on the Summary tab to edit it inline.
        </div>
      </div>
    );
  }

  /* Render */
  return (
    <div>
      {/* 1. Year 1 Operating Statement */}
      <SectionCard
        title="Year 1 Operating Statement"
        subtitle={`Pro forma at workspace baseline (vacancy ${defaults.vacancy.toFixed(1)}%). Reserves default to $0.25/SF when not in OM.`}
        accent={C.accent}
      >
        <div style={{
          background: C.surfLowest,
          border: `1px solid ${C.ghostBorder}`,
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <ProFormaRow label="Base Rent" value={fmtMoney(inputs.baseRent)} indent />
          <ProFormaRow label="NNN Reimbursements" value={fmtMoney(inputs.nnnReimb)} indent />
          <ProFormaRow label="Other Income" value={fmtMoney(inputs.otherInc)} indent />
          <ProFormaRow label="Potential Gross Income" value={fmtMoney(year1.pgi)} bold />
          <ProFormaRow
            label="Less: Vacancy & Credit Loss"
            value={fmtMoney(-year1.vacancyLoss)}
            indent
            hint={`@ ${(defaults.vacancy).toFixed(1)}%`}
            isNegative={year1.vacancyLoss > 0}
          />
          <ProFormaRow label="Effective Gross Income (EGI)" value={fmtMoney(year1.egi)} bold />
          <ProFormaRow label="CAM / Common Area" value={fmtMoney(-inputs.camExp)} indent isNegative={inputs.camExp > 0} />
          <ProFormaRow label="Real Estate Taxes" value={fmtMoney(-inputs.propTax)} indent isNegative={inputs.propTax > 0} />
          <ProFormaRow label="Insurance" value={fmtMoney(-inputs.insurance)} indent isNegative={inputs.insurance > 0} />
          <ProFormaRow label="Management Fee" value={fmtMoney(-inputs.mgmtFee)} indent isNegative={inputs.mgmtFee > 0} />
          <ProFormaRow
            label="Reserves / CapEx"
            value={fmtMoney(-year1.reserves)}
            indent
            hint={inputs.reservesField > 0 ? "From OM" : "$0.25/SF default"}
            isNegative={year1.reserves > 0}
          />
          <ProFormaRow label="Other Expenses" value={fmtMoney(-inputs.otherExp)} indent isNegative={inputs.otherExp > 0} />
          <ProFormaRow label="Total Operating Expenses" value={fmtMoney(-year1.totalExp)} bold isNegative={year1.totalExp > 0} />
          <ProFormaRow label="Net Operating Income" value={fmtMoney(year1.noiUw)} total />
        </div>

        {(inputs.noiOm > 0 || inputs.noiAdj > 0) && (
          <div style={{
            marginTop: 12, padding: "10px 12px",
            background: "#F9FAFB", borderRadius: 8,
            display: "flex", flexWrap: "wrap", gap: 16,
            fontSize: 11, color: C.secondary,
          }}>
            {inputs.noiOm > 0 && (
              <span>
                NOI (OM stated):{" "}
                <strong style={{ color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney(inputs.noiOm)}
                </strong>
              </span>
            )}
            {inputs.noiAdj > 0 && (
              <span>
                NOI (adjusted):{" "}
                <strong style={{ color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney(inputs.noiAdj)}
                </strong>
              </span>
            )}
            <span>
              NOI (underwritten):{" "}
              <strong style={{ color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(year1.noiUw)}
              </strong>
            </span>
          </div>
        )}
      </SectionCard>

      {/* 2. Sources & Uses */}
      <SectionCard
        title="Sources & Uses"
        subtitle={`At ${(defaults.ltv).toFixed(0)}% LTV, ${(defaults.interestRate).toFixed(2)}% rate, ${defaults.amortYears}-yr amort. Closing costs assumed 2.0%.`}
        accent={C.accent}
      >
        <div className="fs-su-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}>
          <div style={{
            border: `1px solid ${C.ghostBorder}`, borderRadius: 8, overflow: "hidden",
          }}>
            <div style={{
              background: "#F9FAFB", padding: "8px 12px",
              fontSize: 10, fontWeight: 700, color: C.secondary,
              textTransform: "uppercase", letterSpacing: 0.6,
            }}>Uses</div>
            <ProFormaRow label="Purchase Price" value={fmtMoney(capStack.price)} indent />
            <ProFormaRow label="Closing Costs (2.0%)" value={fmtMoney(capStack.closingCosts)} indent />
            <ProFormaRow label="Total Uses" value={fmtMoney(capStack.price + capStack.closingCosts)} total />
          </div>

          <div style={{
            border: `1px solid ${C.ghostBorder}`, borderRadius: 8, overflow: "hidden",
          }}>
            <div style={{
              background: "#F9FAFB", padding: "8px 12px",
              fontSize: 10, fontWeight: 700, color: C.secondary,
              textTransform: "uppercase", letterSpacing: 0.6,
            }}>Sources</div>
            <ProFormaRow
              label="Senior Loan"
              value={fmtMoney(capStack.loan)}
              indent
              hint={`${(defaults.ltv).toFixed(0)}% LTV`}
            />
            <ProFormaRow
              label="Equity Required"
              value={fmtMoney(capStack.equity)}
              indent
              hint={`${(100 - defaults.ltv).toFixed(0)}% + closing`}
            />
            <ProFormaRow label="Total Sources" value={fmtMoney(capStack.loan + capStack.equity)} total />
          </div>
        </div>

        <div style={{
          marginTop: 12, padding: "10px 12px",
          background: "#F9FAFB", borderRadius: 8,
          display: "flex", flexWrap: "wrap", gap: 16,
          fontSize: 11, color: C.secondary,
        }}>
          <span>
            Annual Debt Service:{" "}
            <strong style={{ color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(capStack.annualDS)}
            </strong>
          </span>
          <span>
            Monthly P&amp;I:{" "}
            <strong style={{ color: C.onSurface, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(capStack.annualDS / 12)}
            </strong>
          </span>
        </div>

        <style>{`
          @media (max-width: 720px) {
            .fs-su-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </SectionCard>

      {/* 3. 5-Year Cash Flow Projection */}
      <SectionCard
        title="5-Year Cash Flow Projection"
        subtitle={`Rent growth ${(defaults.rentGrowth).toFixed(1)}% / yr, expense growth ${(defaults.expenseGrowth).toFixed(1)}% / yr.`}
        accent={C.accent}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 560,
          }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                <th style={thStyle("left")}>Line</th>
                {projection.rows.map(r => (
                  <th key={r.year} style={thStyle("right")}>Year {r.year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle("left", false)}>EGI</td>
                {projection.rows.map(r => (
                  <td key={r.year} style={tdStyle("right", false)}>{fmtMoney(r.egi)}</td>
                ))}
              </tr>
              <tr>
                <td style={tdStyle("left", false)}>Operating Expenses</td>
                {projection.rows.map(r => (
                  <td key={r.year} style={tdStyle("right", false)}>{fmtMoney(-r.opex)}</td>
                ))}
              </tr>
              <tr style={{ background: "#FAFAFA" }}>
                <td style={tdStyle("left", true)}>NOI</td>
                {projection.rows.map(r => (
                  <td key={r.year} style={tdStyle("right", true)}>{fmtMoney(r.noi)}</td>
                ))}
              </tr>
              <tr>
                <td style={tdStyle("left", false)}>Debt Service</td>
                {projection.rows.map(r => (
                  <td key={r.year} style={tdStyle("right", false)}>{fmtMoney(-r.ds)}</td>
                ))}
              </tr>
              <tr style={{ background: "#F0FDF4", borderTop: `2px solid ${C.onSurface}` }}>
                <td style={{ ...tdStyle("left", true), color: C.positive }}>Levered Cash Flow</td>
                {projection.rows.map(r => (
                  <td
                    key={r.year}
                    style={{
                      ...tdStyle("right", true),
                      color: r.cashFlow >= 0 ? C.positive : C.negative,
                    }}
                  >
                    {fmtMoney(r.cashFlow)}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={tdStyle("left", false)}>Cash-on-Cash</td>
                {projection.rows.map(r => (
                  <td
                    key={r.year}
                    style={{
                      ...tdStyle("right", false),
                      color: r.coc !== null && r.coc < 0 ? C.negative : C.onSurface,
                    }}
                  >
                    {fmtPct(r.coc)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 4. Returns Snapshot */}
      <SectionCard
        title="Returns Snapshot"
        subtitle={`Levered IRR estimate assumes a ${defaults.holdYears}-yr hold and a ${(defaults.exitCap).toFixed(2)}% exit cap with 2.5% selling costs.`}
        accent={C.accent}
      >
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}>
          <ReturnTile label="Cap Rate" value={fmtPct(returns.capRate)} sub="NOI / Price" />
          <ReturnTile label="Price / SF" value={returns.priceSf !== null ? `$${returns.priceSf.toFixed(0)}` : "--"} sub="Price / GLA" />
          <ReturnTile
            label="DSCR"
            value={fmtX(returns.dscr)}
            sub="NOI / Debt Service"
            emphasis={returns.dscr !== null ? (returns.dscr < 1.25 ? "warn" : "ok") : undefined}
          />
          <ReturnTile label="Debt Yield" value={fmtPct(returns.debtYield)} sub="NOI / Loan" />
          <ReturnTile label="Year-1 CoC" value={fmtPct(returns.coc)} sub="Levered CF / Equity" />
          <ReturnTile
            label={`Levered IRR (${defaults.holdYears}-yr)`}
            value={fmtPct(returns.irrPct, 1)}
            sub="With sale at exit cap"
            emphasis={returns.irrPct !== null
              ? (returns.irrPct >= defaults.targetLeveredIrr ? "ok" : "warn")
              : undefined}
          />
        </div>

        <div style={{
          marginTop: 14, fontSize: 11, color: C.secondary, lineHeight: 1.5,
        }}>
          Pro forma values use workspace underwriting defaults. To change them, edit defaults in
          Workspace Settings or override individual fields on the Summary tab.
        </div>
      </SectionCard>
    </div>
  );
}

/* Style helpers */
function thStyle(align: "left" | "right"): React.CSSProperties {
  return {
    padding: "8px 12px",
    textAlign: align,
    fontSize: 10,
    fontWeight: 700,
    color: C.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `1px solid ${C.ghostBorder}`,
    whiteSpace: "nowrap",
  };
}

function tdStyle(align: "left" | "right", bold: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    textAlign: align,
    fontSize: 12,
    fontWeight: bold ? 700 : 500,
    color: C.onSurface,
    fontVariantNumeric: "tabular-nums",
    borderBottom: `1px solid ${C.ghostBorder}`,
  };
}

function ReturnTile({ label, value, sub, emphasis }: {
  label: string; value: string; sub: string; emphasis?: "ok" | "warn";
}) {
  const accentColor =
    emphasis === "ok" ? C.positive
      : emphasis === "warn" ? "#B45309"
        : C.onSurface;
  const accentBg =
    emphasis === "ok" ? "#F0FDF4"
      : emphasis === "warn" ? "#FEF3C7"
        : C.surfLowest;
  return (
    <div style={{
      background: accentBg,
      border: `1px solid ${C.ghostBorder}`,
      borderRadius: 8,
      padding: "12px 14px",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: C.secondary,
        textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 20, fontWeight: 700, color: accentColor,
        fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
      }}>{value}</div>
      <div style={{ fontSize: 10, color: C.secondary, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
