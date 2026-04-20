/**
 * OM Reverse Pricing calculator.
 *
 * Deconstructs a broker's offering memorandum, critiques the embedded
 * assumptions, and solves for the maximum purchase price that delivers
 * the workspace's target levered IRR under an adjusted assumption set.
 *
 * Critical rules (mirror the om-reverse-pricing skill):
 *   - Debt and target-return inputs come from the workspace standardized
 *     baseline, NOT the OM. Scoring and bid ranges must be comparable
 *     across deals, and OM-supplied financing terms ruin comparability.
 *   - Default stance is that every broker assumption is optimistic. We
 *     challenge rent growth, expense growth, exit cap, vacancy, and
 *     capex reserves against market / conservative benchmarks.
 *   - Nothing is rubber-stamped. Every adjustment is annotated with
 *     the specific rationale the reviewer used.
 *
 * The calculator is pure TS so the Pro Property page can render the
 * full report client-side without an API round-trip.
 */

import type { Verdict } from "./quick-screen";
import {
  getAssetProfile,
  capexFloorFor,
  replacementCostFor,
  type AssetType as ProfileAssetType,
  type UnitType as ProfileUnitType,
} from "./asset-profiles";

/* ── Input schema ─────────────────────────────────────── */

export type AssetType = ProfileAssetType;
export type UnitType = ProfileUnitType;

export interface OmReversePricingInput {
  // Required identity
  propertyName: string;
  askingPrice: number;
  unitsOrSf: number;
  unitType: UnitType;
  assetType: AssetType;

  // Broker-stated financial snapshot (from OM)
  statedCapRatePct?: number | null;
  t12NOI?: number | null;
  proFormaNOI?: number | null;
  statedYear1NOI?: number | null;

  // Broker-stated forward assumptions (from OM)
  brokerRentGrowthPct?: number | null;
  brokerExpenseGrowthPct?: number | null;
  brokerExitCapPct?: number | null;
  brokerVacancyPct?: number | null;
  brokerCapexPerUnit?: number | null;

  // Property context
  yearBuilt?: number | null;
  occupancyPct?: number | null;
  market?: string;
  submarket?: string;

  // Workspace standardized baseline (drives the adjusted case + max bid solve)
  baseline: {
    ltvPct: number;           // 0-100
    interestRatePct: number;  // 0-100
    amortYears: number;
    holdYears: number;
    exitCapPct: number;       // 0-100; conservative exit cap for "adjusted" case
    vacancyPct: number;       // 0-100
    rentGrowthPct: number;    // 0-100
    expenseGrowthPct: number; // 0-100
    targetLeveredIrrPct: number;
  };

  // Market benchmarks (informational; fall back to reasonable defaults)
  submarketRentCagrPct?: number | null;  // trailing 3-year submarket CAGR
  marketCpiPct?: number | null;          // CPI proxy for expense growth

  // Optional override to stress-test a user-specified bid
  testBidPrice?: number | null;
}

/* ── Output schema ────────────────────────────────────── */

export type AssumptionVerdict = "REASONABLE" | "AGGRESSIVE" | "UNREALISTIC";

export interface AssumptionCritique {
  metric: string;
  brokerValue: string;
  benchmark: string;
  adjustedValue: string;
  verdict: AssumptionVerdict;
  rationale: string;
  dollarImpactAnnualNOI: number | null;
}

export interface PricingScenario {
  label: "Broker's Projections" | "Adjusted Base Case" | "Max Bid for Target IRR";
  purchasePrice: number;
  pricePerUnitOrSf: number;
  goingInCapPct: number | null;
  exitCapPct: number;
  rentGrowthPct: number;
  expenseGrowthPct: number;
  vacancyPct: number;
  leveredIrrPct: number | null;
  unleveredIrrPct: number | null;
  equityMultiple: number | null;
  cashOnCashYr1Pct: number | null;
  dscrYr1: number | null;
  keyNote: string;
}

export interface ProFormaYear {
  year: number;
  grossRevenue: number;
  vacancyLoss: number;
  egi: number;
  opex: number;
  noi: number;
  capex: number;
  debtService: number;
  cashFlow: number;
  dscr: number | null;
}

export interface SensitivityCell {
  purchasePriceDeltaPct: number; // -15, -10, -5, 0, +5 relative to asking
  purchasePrice: number;
  leveredIrrPct: number | null;
  goingInCapPct: number | null;
}

export interface ExitCapRentGrowthCell {
  exitCapPct: number;
  rentGrowthPct: number;
  leveredIrrPct: number | null;
}

export interface OmReversePricingReport {
  propertyName: string;
  verdict: Verdict;
  headline: string;

  // Executive summary
  askingPrice: number;
  recommendedMaxBid: number;
  discountToAskingUsd: number;
  discountToAskingPct: number;
  recommendation: "PURSUE AT ASKING" | "PURSUE AT ADJUSTED PRICE" | "PASS";
  topStrengths: string[];
  topConcerns: string[];

  // OM summary
  omSummary: {
    askingPrice: number;
    pricePerUnitOrSf: number;
    statedCapRatePct: number | null;
    statedNOI: number | null;
    yearBuilt: number | null;
    occupancyPct: number | null;
  };

  // The 5-point critique
  critiques: AssumptionCritique[];

  // Three scenarios
  scenarios: PricingScenario[];

  // Year-by-year adjusted pro forma
  proForma: ProFormaYear[];
  proFormaExit: {
    year: number;
    exitNOI: number;
    exitCapPct: number;
    grossSalePrice: number;
    saleCosts: number;
    loanPayoff: number;
    netProceedsToEquity: number;
  };

  // Price sensitivity (5 rows, asking +/- steps)
  priceSensitivity: SensitivityCell[];

  // 2-D sensitivity: exit cap rows x rent growth cols at adjusted base price
  exitCapRentGrowthMatrix: {
    exitCapsPct: number[];
    rentGrowthsPct: number[];
    cells: ExitCapRentGrowthCell[];
  };

  // Replacement cost anchor
  replacementCost: {
    perUnitOrSf: number;
    totalReplacementCost: number;
    askingAsPctOfReplacement: number | null;
    note: string;
  };

  // Strategy
  bidStrategy: {
    initialOffer: number;
    walkAwayPrice: number;
    diligencePriorities: string[];
    nextSteps: string[];
  };

  // Debug / trace
  computedAt: string;
  adjustedAssumptionsUsed: {
    rentGrowthPct: number;
    expenseGrowthPct: number;
    exitCapPct: number;
    vacancyPct: number;
    capexPerUnit: number;
  };
}

/* ── Helpers ──────────────────────────────────────────── */

function annualDebtService(loan: number, annualRatePct: number, amortYears: number): number {
  if (loan <= 0 || annualRatePct <= 0 || amortYears <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = amortYears * 12;
  const monthly = (loan * r) / (1 - Math.pow(1 + r, -n));
  return monthly * 12;
}

/** Newton-Raphson IRR. Returns percent or null. */
function irr(cashflows: number[], guess = 0.12): number | null {
  let r = guess;
  for (let i = 0; i < 200; i++) {
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
    r = next < -0.99 ? -0.5 : next;
  }
  return null;
}

/**
 * Replacement cost / unit-or-SF heuristics delegate to the shared asset
 * profile so Quick Screen, OM Reverse Pricing, and Settings all agree.
 */
function replacementCostEstimate(asset: AssetType, unitType: UnitType): number {
  // Pass institutional as the default scale here; per-deal scale is already
  // baked into QuickScreen's path, and OM reverse pricing tends to run on
  // institutional inputs (workspace baseline).
  return replacementCostFor(asset, unitType, "institutional");
}

/** Annualized, straight-line pro forma from a starting NOI. */
function buildProForma(params: {
  year1GrossRevenue: number;
  vacancyPct: number;
  opexRatio: number;
  capexPerUnit: number;
  unitsOrSf: number;
  unitType: UnitType;
  rentGrowthPct: number;
  expenseGrowthPct: number;
  holdYears: number;
  annualDebtService: number;
  startYear?: number;
}): ProFormaYear[] {
  const out: ProFormaYear[] = [];
  const base = params.startYear ?? 1;
  let gpr = params.year1GrossRevenue;
  // Year-1 OpEx in dollars; grows independently from revenue so expense
  // growth can lag or lead rent growth in adjusted scenarios.
  const yr1EGI = gpr * (1 - params.vacancyPct / 100);
  let opex = yr1EGI * params.opexRatio;
  for (let y = 0; y < params.holdYears; y++) {
    const yearGPR = gpr;
    const vacancyLoss = yearGPR * (params.vacancyPct / 100);
    const egi = yearGPR - vacancyLoss;
    const yearOpex = opex;
    const noi = egi - yearOpex;
    const capexPerYear = params.capexPerUnit * params.unitsOrSf;
    const ds = params.annualDebtService;
    const cashFlow = noi - ds - capexPerYear;
    const dscr = ds > 0 ? noi / ds : null;
    out.push({
      year: base + y,
      grossRevenue: yearGPR,
      vacancyLoss,
      egi,
      opex: yearOpex,
      noi,
      capex: capexPerYear,
      debtService: ds,
      cashFlow,
      dscr,
    });
    gpr = yearGPR * (1 + params.rentGrowthPct / 100);
    opex = yearOpex * (1 + params.expenseGrowthPct / 100);
  }
  return out;
}

/** Solve for the purchase price that hits a target levered IRR. */
function solveMaxBid(params: {
  targetIrrPct: number;
  year1NOI: number;
  rentGrowthPct: number;
  expenseGrowthPct: number;
  vacancyPct: number;
  opexRatio: number;
  exitCapPct: number;
  holdYears: number;
  ltvPct: number;
  interestRatePct: number;
  amortYears: number;
  unitsOrSf: number;
  capexPerUnit: number;
  unitType: UnitType;
  askingPrice: number;
}): { price: number; irrAchieved: number | null } {
  /**
   * Binary search over a wide purchase-price band. Monotonic because a
   * lower price means a smaller equity check for the same cash flow,
   * which means a higher IRR. Always converges in fewer than 50 iters.
   */
  let lo = params.askingPrice * 0.25;
  let hi = params.askingPrice * 1.25;

  const irrAtPrice = (price: number): number | null => {
    if (price <= 0) return null;
    const loan = price * (params.ltvPct / 100);
    const closing = price * 0.02;
    const equity = price - loan + closing;
    const ds = annualDebtService(loan, params.interestRatePct, params.amortYears);
    const pf = buildProForma({
      year1GrossRevenue: params.year1NOI / (1 - params.vacancyPct / 100) / (1 - params.opexRatio),
      vacancyPct: params.vacancyPct,
      opexRatio: params.opexRatio,
      capexPerUnit: params.capexPerUnit,
      unitsOrSf: params.unitsOrSf,
      unitType: params.unitType,
      rentGrowthPct: params.rentGrowthPct,
      expenseGrowthPct: params.expenseGrowthPct,
      holdYears: params.holdYears,
      annualDebtService: ds,
    });
    if (pf.length === 0) return null;
    const exitNOI = pf[pf.length - 1].noi * (1 + params.rentGrowthPct / 100);
    const sale = exitNOI / (params.exitCapPct / 100);
    const saleNet = sale * 0.98;
    const loanBalance = loan * Math.max(0, 1 - (params.holdYears / Math.max(params.amortYears, 1)) * 0.6);
    const proceeds = saleNet - loanBalance;
    const flows = [-equity, ...pf.map(p => p.cashFlow)];
    flows[flows.length - 1] = flows[flows.length - 1] + proceeds;
    return irr(flows);
  };

  let best = { price: params.askingPrice, irrAchieved: irrAtPrice(params.askingPrice) };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = irrAtPrice(mid);
    if (r == null) { hi = mid; continue; }
    // If IRR > target, price can go up; if IRR < target, price must go down.
    if (r > params.targetIrrPct) {
      best = { price: mid, irrAchieved: r };
      lo = mid;
    } else {
      hi = mid;
    }
    if (Math.abs(hi - lo) < 1000) break;
  }
  return best;
}

/* ── Critique logic ───────────────────────────────────── */

function critiqueRentGrowth(
  broker: number | null,
  marketCagr: number | null,
  fallback: number,
): AssumptionCritique {
  const benchmark = marketCagr ?? 2.5;
  const adjusted = broker != null ? Math.min(broker, benchmark + 0.5) : fallback;
  let verdict: AssumptionVerdict = "REASONABLE";
  let rationale = `Benchmark submarket trailing 3-year CAGR of ${benchmark.toFixed(1)}%.`;
  if (broker != null && broker > benchmark * 1.5) {
    verdict = "UNREALISTIC";
    rationale = `Broker projects ${broker.toFixed(1)}% vs. submarket CAGR of ${benchmark.toFixed(1)}% (> 150% of historical). Haircut to benchmark + 50bps.`;
  } else if (broker != null && broker > benchmark * 1.15) {
    verdict = "AGGRESSIVE";
    rationale = `Broker projects ${broker.toFixed(1)}% vs. submarket CAGR of ${benchmark.toFixed(1)}%. Conservative haircut to ${adjusted.toFixed(1)}%.`;
  } else if (broker == null) {
    rationale = `OM did not state rent growth. Using submarket CAGR of ${benchmark.toFixed(1)}%.`;
  }
  return {
    metric: "Rent Growth (Y/Y)",
    brokerValue: broker != null ? `${broker.toFixed(1)}%` : "Not stated",
    benchmark: `${benchmark.toFixed(1)}% (submarket CAGR)`,
    adjustedValue: `${adjusted.toFixed(1)}%`,
    verdict,
    rationale,
    dollarImpactAnnualNOI: null,
  };
}

function critiqueExpenseGrowth(
  brokerExpense: number | null,
  brokerRent: number | null,
  cpi: number | null,
  fallback: number,
): AssumptionCritique {
  const benchmark = cpi ?? 3.0;
  const adjusted = Math.max(benchmark, (brokerExpense ?? fallback));
  let verdict: AssumptionVerdict = "REASONABLE";
  let rationale = `Benchmark CPI of ${benchmark.toFixed(1)}%.`;
  if (brokerExpense != null && brokerRent != null && brokerRent - brokerExpense > 1.0) {
    verdict = "AGGRESSIVE";
    rationale = `Broker projects rent growth of ${brokerRent.toFixed(1)}% but expense growth of only ${brokerExpense.toFixed(1)}% (margin expansion of ${(brokerRent - brokerExpense).toFixed(1)}pts). No operational basis. Match expense growth to CPI floor ${benchmark.toFixed(1)}%.`;
  } else if (brokerExpense != null && brokerExpense < benchmark - 0.5) {
    verdict = "AGGRESSIVE";
    rationale = `Broker projects ${brokerExpense.toFixed(1)}% expense growth below CPI floor ${benchmark.toFixed(1)}%. Raise to CPI.`;
  } else if (brokerExpense == null) {
    rationale = `OM did not state expense growth. Using CPI floor ${benchmark.toFixed(1)}%.`;
  }
  return {
    metric: "Expense Growth (Y/Y)",
    brokerValue: brokerExpense != null ? `${brokerExpense.toFixed(1)}%` : "Not stated",
    benchmark: `${benchmark.toFixed(1)}% (CPI floor)`,
    adjustedValue: `${adjusted.toFixed(1)}%`,
    verdict,
    rationale,
    dollarImpactAnnualNOI: null,
  };
}

function critiqueExitCap(
  brokerExit: number | null,
  goingInCap: number | null,
  baselineExit: number,
): AssumptionCritique {
  const adjusted = Math.max(baselineExit, goingInCap ?? baselineExit);
  let verdict: AssumptionVerdict = "REASONABLE";
  let rationale = `In a higher-for-longer rate regime, exit cap should not compress below going-in of ${goingInCap != null ? goingInCap.toFixed(2) + "%" : "n/a"}. Standardized exit of ${baselineExit.toFixed(2)}% applied.`;
  if (brokerExit != null && goingInCap != null && brokerExit < goingInCap - 0.05) {
    verdict = "UNREALISTIC";
    rationale = `Broker models cap compression (${brokerExit.toFixed(2)}% exit vs. ${goingInCap.toFixed(2)}% entry). No stated value-add plan justifies this. Force exit cap to max(going-in, baseline).`;
  } else if (brokerExit != null && brokerExit < baselineExit - 0.25) {
    verdict = "AGGRESSIVE";
    rationale = `Broker exit cap ${brokerExit.toFixed(2)}% is tighter than the workspace baseline of ${baselineExit.toFixed(2)}%. Use baseline for comparability.`;
  } else if (brokerExit == null) {
    rationale = `OM did not state exit cap. Use workspace baseline of ${baselineExit.toFixed(2)}%.`;
  }
  return {
    metric: "Exit Cap Rate",
    brokerValue: brokerExit != null ? `${brokerExit.toFixed(2)}%` : "Not stated",
    benchmark: `>= max(going-in, ${baselineExit.toFixed(2)}%)`,
    adjustedValue: `${adjusted.toFixed(2)}%`,
    verdict,
    rationale,
    dollarImpactAnnualNOI: null,
  };
}

function critiqueVacancy(
  brokerVac: number | null,
  assetType: AssetType,
  baselineVac: number,
): AssumptionCritique {
  const profile = getAssetProfile(assetType);
  const floor = profile.vacancyFloorPct;
  const adjusted = Math.max(baselineVac, floor, brokerVac ?? 0);
  let verdict: AssumptionVerdict = "REASONABLE";
  let rationale = `${floor.toFixed(0)}% economic vacancy floor applied for ${profile.label.toLowerCase()} (class-specific).`;
  if (brokerVac != null && brokerVac < floor - 0.5) {
    verdict = "UNREALISTIC";
    rationale = `Broker uses ${brokerVac.toFixed(1)}% economic vacancy, below the ${floor.toFixed(0)}% floor for ${profile.label.toLowerCase()}. Credit loss plus downtime is rarely below this even in tight markets.`;
  } else if (brokerVac != null && brokerVac < floor) {
    verdict = "AGGRESSIVE";
    rationale = `Broker uses ${brokerVac.toFixed(1)}% vacancy; raise to the ${floor.toFixed(0)}% ${profile.label.toLowerCase()} floor to cover credit loss plus turnover downtime.`;
  } else if (brokerVac == null) {
    rationale = `OM did not state vacancy. Applying ${floor.toFixed(0)}% ${profile.label.toLowerCase()} floor.`;
  }
  return {
    metric: "Economic Vacancy",
    brokerValue: brokerVac != null ? `${brokerVac.toFixed(1)}%` : "Not stated",
    benchmark: `>= ${floor.toFixed(0)}% (${profile.label.toLowerCase()})`,
    adjustedValue: `${adjusted.toFixed(1)}%`,
    verdict,
    rationale,
    dollarImpactAnnualNOI: null,
  };
}

function critiqueCapex(
  brokerCapex: number | null,
  yearBuilt: number | null,
  unitType: UnitType,
  assetType: AssetType,
): AssumptionCritique {
  const age = yearBuilt ? new Date().getFullYear() - yearBuilt : 35;
  const isSf = unitType === "sf";
  const unitLabel = isSf ? "SF" : "unit";
  const profile = getAssetProfile(assetType);
  // Floors now come from the asset profile, which specializes per asset type
  // and vintage (new vs > 20 yrs). Retail, office, industrial, medical get
  // per-SF floors; multifamily gets per-unit floors.
  const floor = capexFloorFor(assetType, unitType, yearBuilt);
  const adjusted = Math.max(floor, brokerCapex ?? 0);
  const fmt = (v: number) =>
    isSf ? `$${v.toFixed(2)}` : `$${Math.round(v).toLocaleString()}`;
  const unrealisticDelta = isSf ? Math.max(floor * 0.5, 0.05) : 100;
  let verdict: AssumptionVerdict = "REASONABLE";
  let rationale = `${profile.label} age ${age} yrs: ${fmt(floor)}/${unitLabel}/yr reserve floor. ${profile.capexRationale}`;
  if (brokerCapex != null && brokerCapex < floor - unrealisticDelta) {
    verdict = "UNREALISTIC";
    rationale = `Broker reserves only ${fmt(brokerCapex)}/${unitLabel}/yr for a ${age}-year-old ${profile.label.toLowerCase()} asset. Deferred maintenance will surface within hold. Floor at ${fmt(floor)}. ${profile.capexRationale}`;
  } else if (brokerCapex != null && brokerCapex < floor) {
    verdict = "AGGRESSIVE";
    rationale = `Broker reserves ${fmt(brokerCapex)}/${unitLabel}/yr vs. ${fmt(floor)} industry floor for ${profile.label.toLowerCase()} at ${age}-year vintage.`;
  } else if (brokerCapex == null) {
    rationale = `OM did not state capex reserve. Applying ${fmt(floor)}/${unitLabel}/yr floor for ${profile.label.toLowerCase()} ${age}-year vintage. ${profile.capexRationale}`;
  }
  return {
    metric: "CapEx Reserve",
    brokerValue: brokerCapex != null ? `${fmt(brokerCapex)}/${unitLabel}/yr` : "Not stated",
    benchmark: `>= ${fmt(floor)}/${unitLabel}/yr (${profile.label.toLowerCase()})`,
    adjustedValue: `${fmt(adjusted)}/${unitLabel}/yr`,
    verdict,
    rationale,
    dollarImpactAnnualNOI: null,
  };
}

/* ── Main engine ──────────────────────────────────────── */

export function runOmReversePricing(input: OmReversePricingInput): OmReversePricingReport {
  const {
    askingPrice, unitsOrSf, unitType, assetType, baseline,
  } = input;

  const year1NOI = input.t12NOI
    ?? input.proFormaNOI
    ?? input.statedYear1NOI
    ?? (input.statedCapRatePct ? askingPrice * (input.statedCapRatePct / 100) : 0);

  const goingInCapPct = year1NOI > 0 && askingPrice > 0 ? (year1NOI / askingPrice) * 100 : null;

  // OpEx ratio fallback sourced from the asset profile. Retail and industrial
  // NNN assets run dramatically leaner than office/multifamily gross leases,
  // so a single flat default would misstate NOI by 20+ points for the extremes.
  const profile = getAssetProfile(assetType);
  const opexRatio = profile.opexRatioDefault;

  // Build the critique for the 5 embedded broker assumptions.
  const critiques: AssumptionCritique[] = [
    critiqueRentGrowth(input.brokerRentGrowthPct ?? null, input.submarketRentCagrPct ?? null, baseline.rentGrowthPct),
    critiqueExpenseGrowth(input.brokerExpenseGrowthPct ?? null, input.brokerRentGrowthPct ?? null, input.marketCpiPct ?? null, baseline.expenseGrowthPct),
    critiqueExitCap(input.brokerExitCapPct ?? null, goingInCapPct, baseline.exitCapPct),
    critiqueVacancy(input.brokerVacancyPct ?? null, assetType, baseline.vacancyPct),
    critiqueCapex(input.brokerCapexPerUnit ?? null, input.yearBuilt ?? null, unitType, assetType),
  ];

  // Resolve adjusted values from the critiques (they live in `adjustedValue`
  // as a formatted string; we re-derive numbers here so downstream math is
  // unambiguous). Fall back to baseline if parsing fails.
  const parseNum = (s: string) => {
    // Strip commas before matching so "$1,200/unit/yr" parses as 1200 not 1.
    const m = s.replace(/,/g, "").match(/-?[0-9]+(?:\.[0-9]+)?/);
    return m ? Number(m[0]) : null;
  };
  // CapEx fallback uses the profile's vintage-aware floor so retail, office,
  // medical, etc. each get their own default rather than a flat $0.25/SF.
  const capexFallback = capexFloorFor(assetType, unitType, input.yearBuilt ?? null);
  const adjusted = {
    rentGrowthPct: parseNum(critiques[0].adjustedValue) ?? baseline.rentGrowthPct,
    expenseGrowthPct: parseNum(critiques[1].adjustedValue) ?? baseline.expenseGrowthPct,
    exitCapPct: parseNum(critiques[2].adjustedValue) ?? baseline.exitCapPct,
    vacancyPct: parseNum(critiques[3].adjustedValue) ?? baseline.vacancyPct,
    capexPerUnit: parseNum(critiques[4].adjustedValue) ?? capexFallback,
  };

  // Broker scenario: keep the broker's stated values where given.
  const brokerAssumptions = {
    rentGrowthPct: input.brokerRentGrowthPct ?? baseline.rentGrowthPct,
    expenseGrowthPct: input.brokerExpenseGrowthPct ?? baseline.expenseGrowthPct,
    exitCapPct: input.brokerExitCapPct ?? Math.max(goingInCapPct ?? 0, baseline.exitCapPct),
    vacancyPct: input.brokerVacancyPct ?? baseline.vacancyPct,
    capexPerUnit: input.brokerCapexPerUnit ?? adjusted.capexPerUnit,
  };

  /* Run one scenario at a given purchase price and assumption set. */
  const runScenario = (
    price: number,
    a: { rentGrowthPct: number; expenseGrowthPct: number; exitCapPct: number; vacancyPct: number; capexPerUnit: number },
    noiOverride: number | null,
  ): {
    leveredIrrPct: number | null;
    unleveredIrrPct: number | null;
    equityMultiple: number | null;
    cashOnCashYr1Pct: number | null;
    dscrYr1: number | null;
    proForma: ProFormaYear[];
    exitNOI: number;
    salePrice: number;
    saleNet: number;
    loanBalance: number;
    netProceeds: number;
    equity: number;
    loan: number;
    goingInCapPct: number | null;
  } => {
    const loan = price * (baseline.ltvPct / 100);
    const closing = price * 0.02;
    const equity = price - loan + closing;
    const ds = annualDebtService(loan, baseline.interestRatePct, baseline.amortYears);

    // Year-1 NOI: use override (e.g. broker's stated) when we have one,
    // otherwise reconstruct from asking price + going-in cap.
    const y1NOI = (noiOverride != null && noiOverride > 0)
      ? noiOverride
      : (goingInCapPct != null ? price * (goingInCapPct / 100) : 0);

    // Rebuild implied GPR so the pro forma's vacancy logic has somewhere
    // to start. GPR = NOI / ((1 - vac) * (1 - opex)).
    const egiImpl = y1NOI / (1 - opexRatio);
    const gprImpl = egiImpl / (1 - a.vacancyPct / 100);

    const proForma = buildProForma({
      year1GrossRevenue: gprImpl,
      vacancyPct: a.vacancyPct,
      opexRatio,
      capexPerUnit: a.capexPerUnit,
      unitsOrSf,
      unitType,
      rentGrowthPct: a.rentGrowthPct,
      expenseGrowthPct: a.expenseGrowthPct,
      holdYears: baseline.holdYears,
      annualDebtService: ds,
    });

    const exitNOI = proForma.length > 0
      ? proForma[proForma.length - 1].noi * (1 + a.rentGrowthPct / 100)
      : 0;
    const salePrice = a.exitCapPct > 0 ? exitNOI / (a.exitCapPct / 100) : 0;
    const saleNet = salePrice * 0.98;
    const loanBalance = loan * Math.max(0, 1 - (baseline.holdYears / Math.max(baseline.amortYears, 1)) * 0.6);
    const netProceeds = saleNet - loanBalance;

    const leveredFlows = [-equity, ...proForma.map(p => p.cashFlow)];
    if (leveredFlows.length > 1) leveredFlows[leveredFlows.length - 1] += netProceeds;
    const unleveredFlows = [-price, ...proForma.map(p => p.noi - p.capex)];
    if (unleveredFlows.length > 1) unleveredFlows[unleveredFlows.length - 1] += saleNet;

    const lev = irr(leveredFlows);
    const unl = irr(unleveredFlows);
    const totalCF = proForma.reduce((s, p) => s + p.cashFlow, 0);
    const equityMultiple = equity > 0 ? (totalCF + netProceeds) / equity : null;
    const cashOnCashYr1Pct = equity > 0 && proForma[0] ? (proForma[0].cashFlow / equity) * 100 : null;
    const dscrYr1 = proForma[0]?.dscr ?? null;

    return {
      leveredIrrPct: lev,
      unleveredIrrPct: unl,
      equityMultiple,
      cashOnCashYr1Pct,
      dscrYr1,
      proForma,
      exitNOI,
      salePrice,
      saleNet,
      loanBalance,
      netProceeds,
      equity,
      loan,
      goingInCapPct: y1NOI > 0 && price > 0 ? (y1NOI / price) * 100 : null,
    };
  };

  // Scenario 1: broker's projections (at asking, broker's numbers)
  const s1 = runScenario(askingPrice, brokerAssumptions, year1NOI);
  // Scenario 2: adjusted base case (at asking, adjusted numbers)
  const s2 = runScenario(askingPrice, adjusted, year1NOI);

  // Scenario 3: solve for max bid under adjusted assumptions
  const solve = solveMaxBid({
    targetIrrPct: baseline.targetLeveredIrrPct,
    year1NOI,
    rentGrowthPct: adjusted.rentGrowthPct,
    expenseGrowthPct: adjusted.expenseGrowthPct,
    vacancyPct: adjusted.vacancyPct,
    opexRatio,
    exitCapPct: adjusted.exitCapPct,
    holdYears: baseline.holdYears,
    ltvPct: baseline.ltvPct,
    interestRatePct: baseline.interestRatePct,
    amortYears: baseline.amortYears,
    unitsOrSf,
    capexPerUnit: adjusted.capexPerUnit,
    unitType,
    askingPrice,
  });
  const maxBid = solve.price;
  const s3 = runScenario(maxBid, adjusted, year1NOI);

  const scenarios: PricingScenario[] = [
    {
      label: "Broker's Projections",
      purchasePrice: askingPrice,
      pricePerUnitOrSf: askingPrice / unitsOrSf,
      goingInCapPct: s1.goingInCapPct,
      exitCapPct: brokerAssumptions.exitCapPct,
      rentGrowthPct: brokerAssumptions.rentGrowthPct,
      expenseGrowthPct: brokerAssumptions.expenseGrowthPct,
      vacancyPct: brokerAssumptions.vacancyPct,
      leveredIrrPct: s1.leveredIrrPct,
      unleveredIrrPct: s1.unleveredIrrPct,
      equityMultiple: s1.equityMultiple,
      cashOnCashYr1Pct: s1.cashOnCashYr1Pct,
      dscrYr1: s1.dscrYr1,
      keyNote: "What the OM is advertising.",
    },
    {
      label: "Adjusted Base Case",
      purchasePrice: askingPrice,
      pricePerUnitOrSf: askingPrice / unitsOrSf,
      goingInCapPct: s2.goingInCapPct,
      exitCapPct: adjusted.exitCapPct,
      rentGrowthPct: adjusted.rentGrowthPct,
      expenseGrowthPct: adjusted.expenseGrowthPct,
      vacancyPct: adjusted.vacancyPct,
      leveredIrrPct: s2.leveredIrrPct,
      unleveredIrrPct: s2.unleveredIrrPct,
      equityMultiple: s2.equityMultiple,
      cashOnCashYr1Pct: s2.cashOnCashYr1Pct,
      dscrYr1: s2.dscrYr1,
      keyNote: "Same price, conservative assumptions.",
    },
    {
      label: "Max Bid for Target IRR",
      purchasePrice: maxBid,
      pricePerUnitOrSf: maxBid / unitsOrSf,
      goingInCapPct: s3.goingInCapPct,
      exitCapPct: adjusted.exitCapPct,
      rentGrowthPct: adjusted.rentGrowthPct,
      expenseGrowthPct: adjusted.expenseGrowthPct,
      vacancyPct: adjusted.vacancyPct,
      leveredIrrPct: s3.leveredIrrPct,
      unleveredIrrPct: s3.unleveredIrrPct,
      equityMultiple: s3.equityMultiple,
      cashOnCashYr1Pct: s3.cashOnCashYr1Pct,
      dscrYr1: s3.dscrYr1,
      keyNote: `Price that hits ${baseline.targetLeveredIrrPct}% target.`,
    },
  ];

  // Price sensitivity: IRR at asking +/- 5 steps, using adjusted assumptions.
  const sensitivitySteps = [-15, -10, -5, 0, 5];
  const priceSensitivity: SensitivityCell[] = sensitivitySteps.map(pct => {
    const price = askingPrice * (1 + pct / 100);
    const s = runScenario(price, adjusted, year1NOI);
    return {
      purchasePriceDeltaPct: pct,
      purchasePrice: price,
      leveredIrrPct: s.leveredIrrPct,
      goingInCapPct: s.goingInCapPct,
    };
  });

  // Exit cap x Rent growth matrix at adjusted base price.
  const exitCapsPct = [
    Number((adjusted.exitCapPct - 0.5).toFixed(2)),
    Number((adjusted.exitCapPct - 0.25).toFixed(2)),
    Number(adjusted.exitCapPct.toFixed(2)),
    Number((adjusted.exitCapPct + 0.25).toFixed(2)),
    Number((adjusted.exitCapPct + 0.5).toFixed(2)),
  ];
  const rentGrowthsPct = [
    Number((adjusted.rentGrowthPct - 1).toFixed(2)),
    Number(adjusted.rentGrowthPct.toFixed(2)),
    Number((adjusted.rentGrowthPct + 1).toFixed(2)),
  ];
  const matrixCells: ExitCapRentGrowthCell[] = [];
  for (const ec of exitCapsPct) {
    for (const rg of rentGrowthsPct) {
      const s = runScenario(askingPrice, { ...adjusted, exitCapPct: ec, rentGrowthPct: rg }, year1NOI);
      matrixCells.push({ exitCapPct: ec, rentGrowthPct: rg, leveredIrrPct: s.leveredIrrPct });
    }
  }

  // Replacement cost anchor
  const replPerUnit = replacementCostEstimate(assetType, unitType);
  const totalRepl = replPerUnit * unitsOrSf;
  const askingAsPctOfRepl = totalRepl > 0 ? (askingPrice / totalRepl) * 100 : null;
  const replNote = askingAsPctOfRepl == null
    ? "Replacement cost estimate unavailable for this asset class."
    : askingAsPctOfRepl < 85
      ? `Ask is ${(100 - askingAsPctOfRepl).toFixed(0)}% below replacement cost. Attractive basis anchor.`
      : askingAsPctOfRepl > 110
        ? `Ask is ${(askingAsPctOfRepl - 100).toFixed(0)}% above replacement cost. Seller pricing in stabilization not yet realized.`
        : `Ask trades in line with replacement cost (${askingAsPctOfRepl.toFixed(0)}%).`;

  /* ── Verdict + recommendation ─────────────────────── */

  const discountUsd = askingPrice - maxBid;
  const discountPct = askingPrice > 0 ? (discountUsd / askingPrice) * 100 : 0;

  let recommendation: OmReversePricingReport["recommendation"];
  let verdict: Verdict;
  let headline: string;
  if (s1.leveredIrrPct != null && s1.leveredIrrPct >= baseline.targetLeveredIrrPct && s2.leveredIrrPct != null && s2.leveredIrrPct >= baseline.targetLeveredIrrPct - 1) {
    recommendation = "PURSUE AT ASKING";
    verdict = "BUY";
    headline = `Broker and adjusted cases both clear the ${baseline.targetLeveredIrrPct}% target. Pencil supports ask.`;
  } else if (solve.irrAchieved != null && solve.irrAchieved >= baseline.targetLeveredIrrPct && discountPct > 0 && discountPct < 25) {
    recommendation = "PURSUE AT ADJUSTED PRICE";
    verdict = "NEUTRAL";
    headline = `Adjusted case misses target at ask. Bid at ${fmtCurrency(maxBid)} (${discountPct.toFixed(1)}% off) to hit ${baseline.targetLeveredIrrPct}%.`;
  } else if (solve.irrAchieved == null || discountPct >= 25) {
    recommendation = "PASS";
    verdict = "PASS";
    headline = `Adjusted case requires a ${discountPct.toFixed(0)}% discount to pencil. Seller unlikely to engage. Not worth the DD spend.`;
  } else {
    recommendation = "PURSUE AT ADJUSTED PRICE";
    verdict = "NEUTRAL";
    headline = `Workable at a meaningful discount to ask. Start at ${fmtCurrency(maxBid * 0.95)}, walk-away at ${fmtCurrency(maxBid)}.`;
  }

  // Top 3 strengths / concerns drawn from critique verdicts + metrics.
  const topStrengths: string[] = [];
  const topConcerns: string[] = [];
  if (goingInCapPct != null && goingInCapPct >= baseline.interestRatePct + 0.75) {
    topStrengths.push(`Positive leverage at ${goingInCapPct.toFixed(2)}% going-in vs. ${baseline.interestRatePct.toFixed(2)}% debt cost.`);
  }
  if (s2.dscrYr1 != null && s2.dscrYr1 >= profile.dscrTarget) {
    topStrengths.push(`DSCR holds at ${s2.dscrYr1.toFixed(2)}x even under adjusted assumptions (above the ${profile.dscrTarget.toFixed(2)}x ${profile.label.toLowerCase()} target).`);
  }
  if (askingAsPctOfRepl != null && askingAsPctOfRepl < 90) {
    topStrengths.push(`Basis at ${askingAsPctOfRepl.toFixed(0)}% of replacement cost limits new-supply risk.`);
  }
  if (s2.leveredIrrPct != null && s2.leveredIrrPct >= baseline.targetLeveredIrrPct) {
    topStrengths.push(`Adjusted base IRR ${s2.leveredIrrPct.toFixed(1)}% still clears the ${baseline.targetLeveredIrrPct}% target.`);
  }
  // Always carry at least one asset-class strength so the reader sees what
  // is structurally appealing about the asset type, not just deal math.
  if (topStrengths.length < 3 && profile.assetStrengths.length > 0) {
    topStrengths.push(`${profile.label}: ${profile.assetStrengths[0]}`);
  }
  while (topStrengths.length < 3) {
    topStrengths.push("Sponsor still has room to negotiate on earnest money, timeline, and contingencies.");
    break;
  }

  critiques.forEach(c => {
    if (c.verdict === "UNREALISTIC" && topConcerns.length < 3) {
      topConcerns.push(`${c.metric}: ${c.rationale}`);
    }
  });
  critiques.forEach(c => {
    if (c.verdict === "AGGRESSIVE" && topConcerns.length < 3) {
      topConcerns.push(`${c.metric}: ${c.rationale}`);
    }
  });
  if (topConcerns.length < 3 && s2.dscrYr1 != null && s2.dscrYr1 < profile.dscrTarget) {
    topConcerns.push(`DSCR drops to ${s2.dscrYr1.toFixed(2)}x under adjusted assumptions, below the ${profile.dscrTarget.toFixed(2)}x ${profile.label.toLowerCase()} target.`);
  }
  if (topConcerns.length < 3 && askingAsPctOfRepl != null && askingAsPctOfRepl > 105) {
    topConcerns.push(`Ask is ${(askingAsPctOfRepl - 100).toFixed(0)}% above replacement cost.`);
  }
  // Always surface at least one asset-class-specific kill vector so retail
  // rollover / office TI / industrial tenant credit etc. don't get lost.
  if (topConcerns.length < 3 && profile.assetRisks.length > 0) {
    topConcerns.push(`${profile.label} class risk: ${profile.assetRisks[0]}`);
  }
  if (topConcerns.length < 3 && profile.assetRisks.length > 1) {
    topConcerns.push(`${profile.label} class risk: ${profile.assetRisks[1]}`);
  }
  while (topConcerns.length < 3) {
    topConcerns.push("Broker's stated projections lack a stated operational basis.");
    break;
  }

  // Bid strategy
  const initialOffer = Math.max(0, maxBid * 0.95);
  const walkAway = maxBid;
  const diligencePriorities = [
    "Order Phase I + property condition assessment before earnest money goes hard.",
    "Pull T-12 and T-3 financials with bank statements; reconcile to OM NOI.",
    "Request current rent roll with concessions, delinquency, and lease end dates.",
    "Reassessment scenario: confirm millage rate at adjusted basis.",
    "Insurance quote at current carrier pricing, not OM estimate.",
    "Pull 5 closed comps in submarket within last 6 months.",
  ];
  const nextSteps = [
    `Submit initial offer at ${fmtCurrency(initialOffer)} with 30-day DD and refundable EM.`,
    `Walk-away at ${fmtCurrency(walkAway)} if seller pushes beyond adjusted max bid.`,
    `Re-underwrite at broker's price only if seller can produce data disproving the adjusted rent growth assumption.`,
  ];

  /* ── Assemble report ──────────────────────────────── */

  return {
    propertyName: input.propertyName,
    verdict,
    headline,
    askingPrice,
    recommendedMaxBid: maxBid,
    discountToAskingUsd: discountUsd,
    discountToAskingPct: discountPct,
    recommendation,
    topStrengths: topStrengths.slice(0, 3),
    topConcerns: topConcerns.slice(0, 3),
    omSummary: {
      askingPrice,
      pricePerUnitOrSf: unitsOrSf > 0 ? askingPrice / unitsOrSf : 0,
      statedCapRatePct: input.statedCapRatePct ?? null,
      statedNOI: year1NOI > 0 ? year1NOI : null,
      yearBuilt: input.yearBuilt ?? null,
      occupancyPct: input.occupancyPct ?? null,
    },
    critiques,
    scenarios,
    proForma: s2.proForma,
    proFormaExit: {
      year: baseline.holdYears,
      exitNOI: s2.exitNOI,
      exitCapPct: adjusted.exitCapPct,
      grossSalePrice: s2.salePrice,
      saleCosts: s2.salePrice * 0.02,
      loanPayoff: s2.loanBalance,
      netProceedsToEquity: s2.netProceeds,
    },
    priceSensitivity,
    exitCapRentGrowthMatrix: {
      exitCapsPct,
      rentGrowthsPct,
      cells: matrixCells,
    },
    replacementCost: {
      perUnitOrSf: replPerUnit,
      totalReplacementCost: totalRepl,
      askingAsPctOfReplacement: askingAsPctOfRepl,
      note: replNote,
    },
    bidStrategy: {
      initialOffer,
      walkAwayPrice: walkAway,
      diligencePriorities,
      nextSteps,
    },
    computedAt: new Date().toISOString(),
    adjustedAssumptionsUsed: adjusted,
  };
}

/* ── Format helpers used by the UI ────────────────── */

export function fmtCurrency(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val) || val === 0) return "--";
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${Math.round(val).toLocaleString()}`;
  return `$${val.toFixed(0)}`;
}

export function fmtPct(val: number | null | undefined, digits = 1): string {
  if (val == null || !Number.isFinite(val)) return "--";
  return `${val.toFixed(digits)}%`;
}

export function fmtX(val: number | null | undefined, digits = 2): string {
  if (val == null || !Number.isFinite(val)) return "--";
  return `${val.toFixed(digits)}x`;
}
