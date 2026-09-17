import { runQuickScreen, type QuickScreenInput } from "../quick-screen";
import { resolveNoiBasis } from "../value-add-lens";
import { scoreRetailPure } from "@/lib/workspace/scoring-models";

/**
 * End-to-end backtest of the value-add fix, on the deal shape that exposed it:
 * a 20,000 SF retail strip at 50% leased, asked at $1.5M, OM quoting the
 * STABILIZED NOI of $200K.
 *
 * Before the fix:
 *   Quick Screen  read $200K/$1.5M as a 13.3% going-in cap and printed a
 *                 22.5% BEAR case.
 *   Scoring model graded in-place income quality and put the same deal in the
 *                 30s, so the score said pass while the returns said outstanding.
 */

const PRICE = 1_500_000;
const SF = 20_000;
const STABILIZED_NOI = 200_000;

function qsInput(over: Partial<QuickScreenInput> = {}): QuickScreenInput {
  const basis = resolveNoiBasis({
    statedNoi: STABILIZED_NOI,
    purchasePrice: PRICE,
    occupancyPct: 50,
    assetType: "retail",
  });
  return {
    purchasePrice: PRICE,
    unitsOrSf: SF,
    unitType: "sf",
    assetType: "retail",
    noi: basis.inPlaceNoi,
    stabilizedNoi: basis.stabilizedNoi,
    noiBasisNote: basis.reason,
    noiBasisIsAssumed: basis.kind === "assumed_stabilized",
    occupancyPct: 50,
    ltv: 0.65,
    interestRatePct: 6.5,
    amortYears: 25,
    holdYears: 10,
    targetIrrPct: 15,
    ...over,
  };
}

describe("Quick Screen on a stabilized pro forma quoted against a vacant price", () => {
  const report = runQuickScreen(qsInput());

  it("underwrites in-place income, not the OM headline", () => {
    expect(report.snapshot.year1NOI).toBeCloseTo(STABILIZED_NOI * (50 / 92), 0);
  });

  it("reports a going-in cap inside the realm of the possible", () => {
    // Was 13.33% off the pro forma. In-place lands near 7.2%.
    expect(report.snapshot.goingInCapRatePct!).toBeLessThan(9);
    expect(report.snapshot.goingInCapRatePct!).toBeGreaterThan(5);
  });

  it("no longer prints a bear case a value-add buyer would never see", () => {
    const bear = report.scenarios.find(s => s.label === "Bear")!;
    expect(bear.leveredIrrPct!).toBeLessThan(15);
  });

  it("keeps the stabilized case visible as upside rather than deleting it", () => {
    expect(report.stabilization).not.toBeNull();
    expect(report.stabilization!.stabilizedNoi).toBe(STABILIZED_NOI);
    expect(report.stabilization!.inPlaceNoi).toBeLessThan(STABILIZED_NOI);
    expect(report.stabilization!.note).toBeTruthy();
  });

  it("leaves a stabilized deal with no basis card at all", () => {
    const basis = resolveNoiBasis({
      statedNoi: 105_000, purchasePrice: 1_450_000, occupancyPct: 97, assetType: "retail",
    });
    const report2 = runQuickScreen(qsInput({
      occupancyPct: 97,
      noi: basis.inPlaceNoi,
      stabilizedNoi: basis.stabilizedNoi,
      purchasePrice: 1_450_000,
    }));
    expect(report2.stabilization).toBeNull();
    expect(report2.snapshot.year1NOI).toBe(105_000);
  });
});

/** Field map in the shape scoreRetailPure expects: { value, confidence }. */
function f(map: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(map)) out[k] = { value: v, confidence: 0.8 };
  return out;
}

const COMMON = {
  "property_basics.city": "West Bend",
  "property_basics.state": "WI",
  "property_basics.zip": "53095",
  "property_basics.building_sf": SF,
  "property_basics.year_built": 1998,
  "property_basics.land_acres": 1.8,
  "lease_data.lease_type": "NNN",
  "tenant_info.tenant_name": "Various",
};

describe("Retail scoring with the value-add lens", () => {
  it("stops burying a well-bought half-empty deal in the 30s", () => {
    const score = scoreRetailPure(f({
      ...COMMON,
      "pricing_deal_terms.asking_price": PRICE,
      "pricing_deal_terms.price_per_sf": PRICE / SF,   // $75/SF
      "pricing_deal_terms.cap_rate_om": 13.3,
      "expenses.noi_om": STABILIZED_NOI,
      "property_basics.occupancy_pct": 50,
    }));
    const basis = score.categories.find(c => c.name === "Basis / Value-Add Margin");
    expect(basis).toBeDefined();
    expect(basis!.score).toBeGreaterThan(60);
    expect(score.totalScore).toBeGreaterThan(50);
  });

  it("still fails a vacant deal priced as though it were already stabilized", () => {
    const score = scoreRetailPure(f({
      ...COMMON,
      "pricing_deal_terms.asking_price": 2_800_000,
      "pricing_deal_terms.price_per_sf": 2_800_000 / SF,  // $140/SF
      "pricing_deal_terms.cap_rate_om": 7.1,
      "expenses.noi_om": STABILIZED_NOI,
      "property_basics.occupancy_pct": 50,
    }));
    const basis = score.categories.find(c => c.name === "Basis / Value-Add Margin")!;
    expect(basis.score).toBeLessThan(45);
  });

  it("does not touch a stabilized deal", () => {
    const stabilizedFields = f({
      ...COMMON,
      "pricing_deal_terms.asking_price": 1_450_000,
      "pricing_deal_terms.price_per_sf": 1_450_000 / SF,
      "pricing_deal_terms.cap_rate_om": 7.2,
      "expenses.noi_om": 105_000,
      "property_basics.occupancy_pct": 97,
    });
    const score = scoreRetailPure(stabilizedFields);
    expect(score.categories.find(c => c.name === "Basis / Value-Add Margin")).toBeUndefined();
    // Every original category keeps its original weight.
    expect(score.categories.find(c => c.name === "vacancy")!.weight).toBe(8);
    expect(score.categories.find(c => c.name === "cashflow")!.weight).toBe(15);
  });

  it("keeps the score on a 0-100 scale once the lens engages", () => {
    const score = scoreRetailPure(f({
      ...COMMON,
      "pricing_deal_terms.asking_price": PRICE,
      "pricing_deal_terms.price_per_sf": PRICE / SF,
      "expenses.noi_om": STABILIZED_NOI,
      "property_basics.occupancy_pct": 50,
    }));
    const total = score.categories.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(100, 6);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });
});
