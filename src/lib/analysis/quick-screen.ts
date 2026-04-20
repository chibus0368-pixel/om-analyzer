/**
 * Deal Quick Screen calculator.
 *
 * Port of the deal-quick-screen skill's python reference into pure TS so the
 * Pro Property page can compute a KEEP/KILL verdict client-side without an
 * API round-trip. All inputs optional except purchasePrice + unitsOrSf;
 * anything missing falls back to the skill's conservative defaults.
 *
 * Returns a fully-assembled report object that the DealQuickScreen
 * component renders directly. Every numeric output is either a finite
 * number, null (not computable), or a range tuple, never NaN.
 */

export type DealScale = "institutional" | "small-operator";
export type UnitType = "units" | "sf";
export type AssetType =
  | "multifamily"
  | "retail"
  | "industrial"
  | "office"
  | "medical_office"
  | "mixed_use"
  | "land"
  | "other";

export interface QuickScreenInput {
  // Required
  purchasePrice: number;
  unitsOrSf: number;
  unitType: UnitType;
  assetType?: AssetType;

  // Location context (informational only)
  market?: string;
  submarket?: string;
  city?: string;
  state?: string;

  // Operating
  noi?: number | null;
  occupancyPct?: number | null;
  marketRentPerUnit?: number | null;
  inPlaceRentPerUnit?: number | null;
  opexRatio?: number | null;
  statedCapRatePct?: number | null;
  yearBuilt?: number | null;

  // Debt
  ltv?: number | null;
  interestRatePct?: number | null;
  amortYears?: number | null;
  holdYears?: number | null;

  // Strategy
  dealScale?: DealScale;
  businessPlan?: "core" | "core-plus" | "value-add" | "opportunistic";
  targetIrrPct?: number | null;

  // Capex / reserves
  capexPerUnitPerYear?: number | null;
  replacementCostPerUnit?: number | null;
}

export interface AssumptionEntry {
  variable: string;
  value: string;
  source: "user" | "estimated" | "market_default";
  note?: string;
}

export interface ScenarioReturn {
  label: string;
  rentGrowthPct: number;
  exitCapBps: number; // relative to going-in, positive = cap expansion
  occupancyDeltaPts: number;
  leveredIrrPct: number | null;
  unleveredIrrPct: number | null;
  equityMultiple: number | null;
}

export type Verdict = "KEEP" | "KILL" | "KEEP_WITH_CONDITIONS";

export interface QuickScreenReport {
  verdict: Verdict;
  headline: string;

  // Snapshot
  snapshot: {
    askingPrice: number;
    pricePerUnitOrSf: number;
    unitType: UnitType;
    goingInCapRatePct: number | null;
    year1NOI: number;
    year1CashOnCashPct: number | null;
    dscr: number | null;
    maxLoanAt125Dscr: number;
    impliedLtvAtMaxLoanPct: number | null;
    replacementCostPerUnit: number;
    askVsReplacementCostPct: number | null;
    unleveredIrrRange: [number, number] | null;
    leveredIrrRange: [number, number] | null;
  };

  // Inputs and estimates
  assumptions: AssumptionEntry[];
  scenarios: ScenarioReturn[];

  // Narrative
  waysItWorks: string[];
  waysItDies: string[];
  perUnitCompCheck: string;
  missingInfo: Array<{ item: string; whyItMatters: string; assumptionUsed: string }>;
  nextDiligence: string[];

  // Debug / traceability
  computedAt: string;
  dealScale: DealScale;
}

/** Calculate an annual debt service given loan, annual rate, and amort years. */
function annualDebtService(loan: number, annualRatePct: number, amortYears: number): number {
  if (loan <= 0 || annualRatePct <= 0 || amortYears <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = amortYears * 12;
  const monthly = (loan * r) / (1 - Math.pow(1 + r, -n));
  return monthly * 12;
}

/** Replacement cost / unit heuristics by asset type and deal scale. */
function replacementCostEstimate(asset: AssetType, scale: DealScale, unitType: UnitType): number {
  if (asset === "multifamily") {
    return scale === "small-operator" ? 125_000 : 250_000;
  }
  if (unitType === "sf") {
    // Per-SF values expressed as per-unit so the same "unit cost" math works.
    if (asset === "industrial") return 175;
    if (asset === "office") return 325;
    if (asset === "retail") return 225;
    return 200;
  }
  return scale === "small-operator" ? 120_000 : 225_000;
}

/** Fully resolved input with defaults filled in. No nulls. */
interface ResolvedInputs {
  purchasePrice: number;
  unitsOrSf: number;
  unitType: UnitType;
  assetType: AssetType;
  occupancyPct: number;
  marketRentPerUnit: number;
  inPlaceRentPerUnit: number;
  opexRatio: number;
  statedCapRatePct: number;
  yearBuilt: number;
  ltv: number;
  interestRatePct: number;
  amortYears: number;
  holdYears: number;
  targetIrrPct: number;
  businessPlan: NonNullable<QuickScreenInput["businessPlan"]>;
  dealScale: DealScale;
  capexPerUnitPerYear: number;
  replacementCostPerUnit: number;
  noi: number;
}

/** Resolve input defaults per the skill spec, logging what was assumed. */
function resolveInputs(input: QuickScreenInput): {
  resolved: ResolvedInputs;
  assumptions: AssumptionEntry[];
} {
  const assumptions: AssumptionEntry[] = [];

  const dealScale: DealScale =
    input.dealScale ?? (input.purchasePrice < 5_000_000 ? "small-operator" : "institutional");
  if (!input.dealScale) {
    assumptions.push({
      variable: "Deal scale",
      value: dealScale === "small-operator" ? "Small operator" : "Institutional",
      source: "estimated",
      note: "Inferred from purchase price",
    });
  } else {
    assumptions.push({ variable: "Deal scale", value: dealScale, source: "user" });
  }

  const assetType: AssetType = input.assetType ?? "multifamily";
  assumptions.push({
    variable: "Asset type",
    value: assetType,
    source: input.assetType ? "user" : "estimated",
  });

  const unitType: UnitType = input.unitType;
  const businessPlan = input.businessPlan ?? "core-plus";
  assumptions.push({
    variable: "Business plan",
    value: businessPlan,
    source: input.businessPlan ? "user" : "estimated",
  });

  const occupancyPct = input.occupancyPct ?? 90;
  assumptions.push({
    variable: "Occupancy",
    value: `${occupancyPct.toFixed(1)}%`,
    source: input.occupancyPct != null ? "user" : "estimated",
  });

  const yearBuilt = input.yearBuilt ?? 1990;
  assumptions.push({
    variable: "Year built",
    value: String(yearBuilt),
    source: input.yearBuilt != null ? "user" : "estimated",
  });

  const ltv =
    input.ltv ?? (dealScale === "small-operator" ? 0.75 : 0.65);
  assumptions.push({
    variable: "LTV",
    value: `${(ltv * 100).toFixed(0)}%`,
    source: input.ltv != null ? "user" : "estimated",
  });

  const interestRatePct =
    input.interestRatePct ?? (dealScale === "small-operator" ? 9.0 : 7.0);
  assumptions.push({
    variable: "Interest rate",
    value: `${interestRatePct.toFixed(2)}%`,
    source: input.interestRatePct != null ? "user" : "estimated",
  });

  const amortYears =
    input.amortYears ?? (dealScale === "small-operator" ? 25 : 30);
  assumptions.push({
    variable: "Amortization",
    value: `${amortYears} yrs`,
    source: input.amortYears != null ? "user" : "estimated",
  });

  const holdYears = input.holdYears ?? 5;
  assumptions.push({
    variable: "Hold period",
    value: `${holdYears} yrs`,
    source: input.holdYears != null ? "user" : "estimated",
  });

  const targetIrrPct = input.targetIrrPct ?? 15;
  assumptions.push({
    variable: "Target levered IRR",
    value: `${targetIrrPct.toFixed(1)}%`,
    source: input.targetIrrPct != null ? "user" : "estimated",
  });

  const opexRatio =
    input.opexRatio ?? (assetType === "industrial" ? 0.35 : 0.45);
  assumptions.push({
    variable: "OpEx ratio",
    value: `${(opexRatio * 100).toFixed(0)}% of EGI`,
    source: input.opexRatio != null ? "user" : "estimated",
  });

  const capexPerUnitPerYear =
    input.capexPerUnitPerYear ?? (dealScale === "small-operator" ? 400 : 500);
  assumptions.push({
    variable: "Capex reserve",
    value: `$${capexPerUnitPerYear.toLocaleString()}/${unitType === "units" ? "unit" : "SF"}/yr`,
    source: input.capexPerUnitPerYear != null ? "user" : "estimated",
  });

  const replacementCostPerUnit =
    input.replacementCostPerUnit ??
    replacementCostEstimate(assetType, dealScale, unitType);
  assumptions.push({
    variable: "Replacement cost",
    value: `$${replacementCostPerUnit.toLocaleString()}/${unitType === "units" ? "unit" : "SF"}`,
    source: input.replacementCostPerUnit != null ? "user" : "market_default",
  });

  const marketRentPerUnit = input.marketRentPerUnit ?? 0;
  const inPlaceRentPerUnit = input.inPlaceRentPerUnit ?? 0;
  const statedCapRatePct = input.statedCapRatePct ?? 0;
  const noi = input.noi ?? 0;

  return {
    resolved: {
      purchasePrice: input.purchasePrice,
      unitsOrSf: input.unitsOrSf,
      unitType,
      assetType,
      occupancyPct,
      marketRentPerUnit,
      inPlaceRentPerUnit,
      opexRatio,
      statedCapRatePct,
      yearBuilt,
      ltv,
      interestRatePct,
      amortYears,
      holdYears,
      targetIrrPct,
      businessPlan,
      dealScale,
      capexPerUnitPerYear,
      replacementCostPerUnit,
      noi,
    },
    assumptions,
  };
}

/**
 * Approximate a three-scenario IRR without a full DCF. Uses a simple
 * equation: Year-0 equity out, Year-1..N levered cash flow, terminal
 * proceeds = exit NOI / exit cap - loan balance (assumes IO simplification
 * plus amortization haircut at 60% for ballpark). This is intentionally
 * approximate; the skill explicitly warns against false precision.
 */
function scenarioIRR(params: {
  purchasePrice: number;
  equity: number;
  year1NOI: number;
  annualDS: number;
  goingInCapPct: number;
  rentGrowthPct: number;
  exitCapBps: number;
  holdYears: number;
  loanAmount: number;
  amortYears: number;
}): { levered: number | null; unlevered: number | null; equityMultiple: number | null } {
  const { purchasePrice, equity, year1NOI, annualDS, goingInCapPct, rentGrowthPct, exitCapBps, holdYears, loanAmount, amortYears } = params;
  if (equity <= 0 || purchasePrice <= 0 || year1NOI <= 0) {
    return { levered: null, unlevered: null, equityMultiple: null };
  }

  const exitCapPct = Math.max(0.5, goingInCapPct + exitCapBps / 100);
  // NOI grows at rentGrowthPct. OpEx passes through; skill keeps it simple.
  const flows: number[] = [];
  const unleveredFlows: number[] = [];
  let noi = year1NOI;
  for (let yr = 1; yr <= holdYears; yr++) {
    const levered = noi - annualDS;
    flows.push(levered);
    unleveredFlows.push(noi);
    noi *= 1 + rentGrowthPct / 100;
  }
  // Sale in terminal year: exit NOI / exit cap, net of 2% selling costs,
  // net of loan balance (simple 60% principal remaining haircut to dodge
  // a full amort schedule while still reflecting paydown).
  const exitNOI = noi; // already grown one extra cycle after the last CF year
  const salePrice = exitNOI / (exitCapPct / 100);
  const saleNet = salePrice * 0.98;
  const loanBalanceApprox = loanAmount * Math.max(0, 1 - holdYears / Math.max(amortYears, 1) * 0.6);
  const leveredExit = saleNet - loanBalanceApprox;
  const unleveredExit = saleNet;

  // Replace terminal year CF with CF + exit proceeds
  flows[flows.length - 1] = flows[flows.length - 1] + leveredExit;
  unleveredFlows[unleveredFlows.length - 1] = unleveredFlows[unleveredFlows.length - 1] + unleveredExit;

  const irr = (cashflows: number[], guess = 0.12): number | null => {
    // Newton-Raphson on NPV(r) = 0
    let r = guess;
    for (let i = 0; i < 100; i++) {
      let npv = 0;
      let d = 0;
      for (let t = 0; t < cashflows.length; t++) {
        const cf = cashflows[t];
        const pow = Math.pow(1 + r, t);
        npv += cf / pow;
        if (t > 0) d -= (t * cf) / Math.pow(1 + r, t + 1);
      }
      if (Math.abs(npv) < 1) return r * 100;
      if (Math.abs(d) < 1e-9) return null;
      const next = r - npv / d;
      if (!Number.isFinite(next)) return null;
      if (next < -0.99) {
        r = -0.5;
      } else {
        r = next;
      }
    }
    return null;
  };

  const leveredCashflows = [-equity, ...flows];
  const unleveredCashflows = [-purchasePrice, ...unleveredFlows];
  const levered = irr(leveredCashflows);
  const unlevered = irr(unleveredCashflows);
  const equityMultiple = flows.reduce((s, v) => s + v, 0) / equity;

  const clamp = (n: number | null): number | null => {
    if (n == null || !Number.isFinite(n)) return null;
    // Cap absurd readings.
    if (n < -50) return -50;
    if (n > 60) return 60;
    return n;
  };

  return {
    levered: clamp(levered),
    unlevered: clamp(unlevered),
    equityMultiple: Number.isFinite(equityMultiple) ? equityMultiple + 1 : null,
  };
}

function buildNarrative(args: {
  resolved: ReturnType<typeof resolveInputs>["resolved"];
  year1NOI: number;
  goingInCapPct: number | null;
  dscr: number | null;
  askVsReplacement: number | null;
  scenarios: ScenarioReturn[];
  cashOnCash: number | null;
  pricePerUnitOrSf: number;
}): { worksBullets: string[]; diesBullets: string[]; compCheck: string; diligence: string[] } {
  const { resolved, year1NOI, goingInCapPct, dscr, askVsReplacement, scenarios, cashOnCash, pricePerUnitOrSf } = args;
  const baseLeveredIrr = scenarios.find(s => s.label === "Base")?.leveredIrrPct ?? null;
  const unit = resolved.unitType === "units" ? "unit" : "SF";
  const worksBullets: string[] = [];
  const diesBullets: string[] = [];

  if (goingInCapPct != null && goingInCapPct >= 6.5) {
    worksBullets.push(`Going-in cap ${goingInCapPct.toFixed(2)}% has enough cushion above debt cost to absorb a 75bps cap expansion at exit.`);
  } else if (goingInCapPct != null) {
    worksBullets.push(`Cap compression or rent growth must carry the returns; going-in ${goingInCapPct.toFixed(2)}% is thin versus current debt cost.`);
  }

  if (askVsReplacement != null && askVsReplacement < 85) {
    worksBullets.push(`Ask is ${(100 - askVsReplacement).toFixed(0)}% below replacement cost, which limits new-supply risk in the submarket.`);
  }
  if (resolved.inPlaceRentPerUnit > 0 && resolved.marketRentPerUnit > resolved.inPlaceRentPerUnit) {
    const gap = ((resolved.marketRentPerUnit - resolved.inPlaceRentPerUnit) / resolved.inPlaceRentPerUnit) * 100;
    worksBullets.push(`Loss-to-lease of ${gap.toFixed(0)}% at turnover is a concrete lever, not a cap-compression bet.`);
  }
  if (baseLeveredIrr != null && baseLeveredIrr >= resolved.targetIrrPct) {
    worksBullets.push(`Base case already clears the ${resolved.targetIrrPct}% target, so a bear case doesn't need heroic rescue assumptions.`);
  }
  if (worksBullets.length < 3) {
    worksBullets.push(`Hold period of ${resolved.holdYears} years gives room to burn off capex before the refi/sale window.`);
  }

  if (dscr != null && dscr < 1.2) {
    diesBullets.push(`DSCR ${dscr.toFixed(2)}x is below the 1.25x threshold; one bad quarter and you're tapping reserves.`);
  }
  if (goingInCapPct != null && goingInCapPct < resolved.interestRatePct) {
    diesBullets.push(`Negative leverage: going-in cap ${goingInCapPct.toFixed(2)}% sits below ${resolved.interestRatePct.toFixed(2)}% debt cost. Growth must do all the work.`);
  }
  if (askVsReplacement != null && askVsReplacement > 100) {
    diesBullets.push(`Paying above replacement cost means new supply can undercut you on rent if the submarket attracts development.`);
  }
  if (cashOnCash != null && cashOnCash < 4) {
    diesBullets.push(`Year-1 cash-on-cash ${cashOnCash.toFixed(1)}% leaves no room for CapEx surprises or property-tax reassessment.`);
  }
  if (resolved.yearBuilt < 1985) {
    diesBullets.push(`Vintage ${resolved.yearBuilt} assets carry plumbing, roof, and electrical capex that the stated NOI likely doesn't fully reserve for.`);
  }
  if (diesBullets.length < 3) {
    diesBullets.push(`Exit cap has to hold within 50bps of going-in for the base case to clear; not guaranteed in a higher-for-longer rate regime.`);
  }

  const compCheck = (() => {
    const priceFmt = `$${Math.round(pricePerUnitOrSf).toLocaleString()}/${unit}`;
    if (askVsReplacement == null) {
      return `Asking ${priceFmt}. Pull 3 recent closed comps within a 1-mile radius to validate; the automated estimate doesn't substitute for a broker pull.`;
    }
    if (askVsReplacement < 85) return `Asking ${priceFmt} is ${(100 - askVsReplacement).toFixed(0)}% below estimated replacement cost, an attractive basis if the physical condition supports it.`;
    if (askVsReplacement > 105) return `Asking ${priceFmt} is ${(askVsReplacement - 100).toFixed(0)}% above estimated replacement cost. Seller is pricing in stabilization that hasn't happened yet.`;
    return `Asking ${priceFmt} trades in line with replacement cost. Pull closed submarket comps to confirm the $/${unit} is market, not aspirational.`;
  })();

  const diligence: string[] = [
    "Pull 3 closed comps (last 6 months) within 1 mile to validate $/unit or $/SF",
    "Verify trailing 12 and trailing 3 financials against the OM pro forma",
    "Order a property condition assessment focused on roof, HVAC, and plumbing",
    "Run a Tax Assessor check for reassessment risk at new basis",
    "Request current rent roll with concessions, lease dates, and delinquency",
    "Confirm insurance quote at current carrier rates (not OM estimate)",
    "Walk a sample of units: target 10% and every vacant unit",
    "Check CoStar/market report for submarket absorption and pipeline",
    "Verify utility billing setup and any RUBS / ratio billing income",
    "Environmental Phase I + flood zone check before earnest money goes hard",
  ];

  return { worksBullets, diesBullets, compCheck, diligence };
}

export function runQuickScreen(raw: QuickScreenInput): QuickScreenReport {
  const { resolved, assumptions } = resolveInputs(raw);

  // Build NOI if caller didn't provide one: use market rent @ occupancy - opex.
  let year1NOI = resolved.noi;
  if ((year1NOI ?? 0) <= 0 && resolved.marketRentPerUnit > 0 && resolved.unitsOrSf > 0) {
    const gpr = resolved.marketRentPerUnit * resolved.unitsOrSf * 12;
    const egi = gpr * (resolved.occupancyPct / 100);
    const opex = egi * resolved.opexRatio;
    year1NOI = egi - opex;
    assumptions.push({
      variable: "Year 1 NOI",
      value: `$${Math.round(year1NOI).toLocaleString()}`,
      source: "estimated",
      note: "Built from market rent × occupancy − OpEx",
    });
  } else {
    assumptions.push({
      variable: "Year 1 NOI",
      value: `$${Math.round(year1NOI || 0).toLocaleString()}`,
      source: raw.noi != null ? "user" : "estimated",
    });
  }

  // Snapshot metrics
  const pricePerUnitOrSf = resolved.unitsOrSf > 0 ? resolved.purchasePrice / resolved.unitsOrSf : 0;
  const goingInCapPct = year1NOI > 0 ? (year1NOI / resolved.purchasePrice) * 100 : null;

  const loanAmount = resolved.purchasePrice * resolved.ltv;
  const closingCosts = resolved.purchasePrice * 0.02;
  const equity = resolved.purchasePrice - loanAmount + closingCosts;
  const annualDS = annualDebtService(loanAmount, resolved.interestRatePct, resolved.amortYears);
  const dscr = annualDS > 0 && year1NOI > 0 ? year1NOI / annualDS : null;
  const year1CashFlow = year1NOI - annualDS;
  const cashOnCash = equity > 0 && year1NOI > 0 ? (year1CashFlow / equity) * 100 : null;

  // Max loan supported at 1.25x DSCR
  const annualConstant = annualDS > 0 && loanAmount > 0 ? annualDS / loanAmount : 0;
  const maxLoan125 = year1NOI > 0 && annualConstant > 0 ? year1NOI / 1.25 / annualConstant : 0;
  const impliedLTV = resolved.purchasePrice > 0 ? (maxLoan125 / resolved.purchasePrice) * 100 : null;

  const replacementCostTotal = resolved.replacementCostPerUnit * resolved.unitsOrSf;
  const askVsReplacement =
    replacementCostTotal > 0 ? (resolved.purchasePrice / replacementCostTotal) * 100 : null;

  // Scenarios
  const scenarioInputs: Array<{ label: string; rent: number; exitBps: number; occDelta: number }> = [
    { label: "Bull", rent: 3.5, exitBps: -25, occDelta: +3 },
    { label: "Base", rent: 2.5, exitBps: +25, occDelta: 0 },
    { label: "Bear", rent: 0, exitBps: +75, occDelta: -5 },
  ];

  const scenarios: ScenarioReturn[] = goingInCapPct != null ? scenarioInputs.map(s => {
    const adjustedYear1 = year1NOI * (1 + s.occDelta / 100);
    const scn = scenarioIRR({
      purchasePrice: resolved.purchasePrice,
      equity,
      year1NOI: adjustedYear1,
      annualDS,
      goingInCapPct,
      rentGrowthPct: s.rent,
      exitCapBps: s.exitBps,
      holdYears: resolved.holdYears,
      loanAmount,
      amortYears: resolved.amortYears,
    });
    return {
      label: s.label,
      rentGrowthPct: s.rent,
      exitCapBps: s.exitBps,
      occupancyDeltaPts: s.occDelta,
      leveredIrrPct: scn.levered,
      unleveredIrrPct: scn.unlevered,
      equityMultiple: scn.equityMultiple,
    };
  }) : [];

  const leveredIrrs = scenarios.map(s => s.leveredIrrPct).filter((n): n is number => n != null);
  const unleveredIrrs = scenarios.map(s => s.unleveredIrrPct).filter((n): n is number => n != null);
  const leveredIrrRange: [number, number] | null = leveredIrrs.length === 3 ? [Math.min(...leveredIrrs), Math.max(...leveredIrrs)] : null;
  const unleveredIrrRange: [number, number] | null = unleveredIrrs.length === 3 ? [Math.min(...unleveredIrrs), Math.max(...unleveredIrrs)] : null;

  // Verdict logic per the skill spec
  const baseIrr = scenarios.find(s => s.label === "Base")?.leveredIrrPct ?? null;
  let verdict: Verdict = "KEEP_WITH_CONDITIONS";
  let headline = "";
  const isValueAdd = resolved.businessPlan === "value-add" || resolved.businessPlan === "opportunistic";
  const spread = goingInCapPct != null ? goingInCapPct - resolved.interestRatePct : null;

  // KILL cases
  if (goingInCapPct != null && goingInCapPct < 5.0 && isValueAdd) {
    verdict = "KILL";
    headline = `Going-in cap of ${goingInCapPct.toFixed(2)}% is below the 5% floor for value-add; no margin for execution risk.`;
  } else if (dscr != null && dscr < 1.15) {
    verdict = "KILL";
    headline = `DSCR of ${dscr.toFixed(2)}x at market debt is below 1.15x. Financing will not pencil.`;
  } else if (spread != null && spread < 0 && !isValueAdd) {
    verdict = "KILL";
    headline = `Negative leverage of ${Math.abs(spread).toFixed(2)} pts with no value-add thesis to close the gap.`;
  } else if (goingInCapPct != null && goingInCapPct > 6.0 && dscr != null && dscr > 1.25 && askVsReplacement != null && askVsReplacement < 100 && baseIrr != null && baseIrr >= resolved.targetIrrPct - 2) {
    verdict = "KEEP";
    headline = `Cap ${goingInCapPct.toFixed(2)}%, DSCR ${dscr.toFixed(2)}x, basis below replacement, base IRR ${baseIrr.toFixed(1)}% within 200bps of target. Pursue.`;
  } else {
    verdict = "KEEP_WITH_CONDITIONS";
    const conditions: string[] = [];
    if (dscr != null && dscr < 1.25) conditions.push(`DSCR ${dscr.toFixed(2)}x needs higher rate cap or lower LTV`);
    if (goingInCapPct != null && goingInCapPct < 6.0) conditions.push("Submit below ask to force cap above 6%");
    if (askVsReplacement != null && askVsReplacement > 100) conditions.push("Verify $/unit comps support paying above replacement");
    if (baseIrr != null && baseIrr < resolved.targetIrrPct - 2) conditions.push(`Base IRR ${baseIrr.toFixed(1)}% falls short of ${resolved.targetIrrPct}% target`);
    headline = conditions.length
      ? `Pencils with conditions: ${conditions.join("; ")}.`
      : `Pencils at ask. Get comps and a PCA before hardening earnest money.`;
  }

  const narrative = buildNarrative({
    resolved,
    year1NOI,
    goingInCapPct,
    dscr,
    askVsReplacement,
    scenarios,
    cashOnCash,
    pricePerUnitOrSf,
  });

  const missingInfo: QuickScreenReport["missingInfo"] = [];
  if (raw.noi == null) missingInfo.push({
    item: "Actual trailing 12 NOI",
    whyItMatters: "Stated OM NOI overstates reality 70% of the time",
    assumptionUsed: year1NOI > 0 ? `$${Math.round(year1NOI).toLocaleString()} estimated` : "No NOI computed",
  });
  if (raw.ltv == null) missingInfo.push({
    item: "Confirmed loan quote",
    whyItMatters: "LTV and rate drive cash-on-cash and DSCR directly",
    assumptionUsed: `${(resolved.ltv * 100).toFixed(0)}% LTV @ ${resolved.interestRatePct.toFixed(2)}%`,
  });
  if (raw.occupancyPct == null) missingInfo.push({
    item: "Current rent roll with delinquency",
    whyItMatters: "Physical occupancy is often 5-10 pts below stated economic occupancy",
    assumptionUsed: `${resolved.occupancyPct}% assumed`,
  });
  if (raw.capexPerUnitPerYear == null) missingInfo.push({
    item: "CapEx history / budget from seller",
    whyItMatters: "Deferred maintenance can wipe 2 years of cash flow",
    assumptionUsed: `$${resolved.capexPerUnitPerYear}/${resolved.unitType === "units" ? "unit" : "SF"}/yr reserve`,
  });
  if (raw.replacementCostPerUnit == null) missingInfo.push({
    item: "Validated replacement cost for submarket",
    whyItMatters: "Per-unit supply risk depends on local construction cost + land",
    assumptionUsed: `$${resolved.replacementCostPerUnit.toLocaleString()}/${resolved.unitType === "units" ? "unit" : "SF"} used`,
  });

  return {
    verdict,
    headline,
    snapshot: {
      askingPrice: resolved.purchasePrice,
      pricePerUnitOrSf,
      unitType: resolved.unitType,
      goingInCapRatePct: goingInCapPct,
      year1NOI,
      year1CashOnCashPct: cashOnCash,
      dscr,
      maxLoanAt125Dscr: maxLoan125,
      impliedLtvAtMaxLoanPct: impliedLTV,
      replacementCostPerUnit: resolved.replacementCostPerUnit,
      askVsReplacementCostPct: askVsReplacement,
      unleveredIrrRange,
      leveredIrrRange,
    },
    assumptions,
    scenarios,
    waysItWorks: narrative.worksBullets.slice(0, 3),
    waysItDies: narrative.diesBullets.slice(0, 3),
    perUnitCompCheck: narrative.compCheck,
    missingInfo,
    nextDiligence: narrative.diligence.slice(0, 10),
    computedAt: new Date().toISOString(),
    dealScale: resolved.dealScale,
  };
}

/** Format helper used by the UI. */
export function fmtRange(range: [number, number] | null, suffix = "%"): string {
  if (!range) return "--";
  return `${range[0].toFixed(1)}${suffix} - ${range[1].toFixed(1)}${suffix}`;
}
