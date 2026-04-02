import { NextRequest, NextResponse } from "next/server";
import { scoreByType, type ScoringResult } from "@/lib/workspace/scoring-models";

/**
 * POST /api/om-analyzer/score-lite
 *
 * Runs the SAME scoring models as Pro workspace against parse-lite output.
 * Converts flat parse-lite fields into the normalized field map expected by scoreByType().
 *
 * For retail, scoring is done inline here (since Pro retail scoring lives in route.ts).
 * For industrial/office/land, delegates to the shared scoring-models.ts library.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { analysisType, data } = body;

    if (!data || !analysisType) {
      return NextResponse.json({ error: "Missing analysisType or data" }, { status: 400 });
    }

    const validTypes = ["retail", "industrial", "office", "land"];
    if (!validTypes.includes(analysisType)) {
      return NextResponse.json({ error: `Invalid analysisType: ${analysisType}` }, { status: 400 });
    }

    // Convert parse-lite flat result into normalized field map for scoring models
    const fields = convertToFieldMap(data, analysisType);

    let result: ScoringResult;

    if (analysisType === "retail") {
      // Retail scoring inline (matches Pro /api/workspace/score logic)
      result = scoreRetail(fields, data);
    } else {
      // Industrial, Office, Land — use shared scoring-models.ts (identical to Pro)
      result = scoreByType(analysisType as any, fields);
    }

    return NextResponse.json({
      totalScore: result.totalScore,
      scoreBand: result.scoreBand,
      recommendation: result.recommendation,
      categories: result.categories,
      analysisType: result.analysisType,
      modelVersion: result.modelVersion,
    });
  } catch (error: any) {
    console.error("[score-lite] Error:", error);
    return NextResponse.json(
      { error: error.message || "Scoring failed" },
      { status: 500 }
    );
  }
}

/**
 * Convert flat parse-lite output into the normalized field map expected by scoring models.
 * Pro stores fields as { value, confidence } objects; we simulate that here.
 */
function convertToFieldMap(data: any, analysisType: string): Record<string, any> {
  const fields: Record<string, any> = {};

  function set(path: string, value: any, confidence = 0.7) {
    if (value !== null && value !== undefined && value !== "" && value !== "--") {
      fields[path] = { value: typeof value === "string" ? parseNumericIfPossible(value) : value, confidence };
    }
  }

  // Property basics
  set("property_basics.gla_sf", data.buildingSf);
  set("property_basics.land_acres", data.landAcres);
  set("property_basics.occupancy_pct", data.occupancyPct);
  set("property_basics.year_built", data.yearBuilt);
  set("property_basics.tenant_count", data.tenantCount);
  set("property_basics.wale_years", data.wale);
  set("property_basics.parking", data.parking);
  set("property_basics.traffic", data.traffic);

  // Pricing
  set("pricing_deal_terms.asking_price", data.askingPrice);
  set("pricing_deal_terms.price_per_sf", data.pricePerSf);
  set("pricing_deal_terms.cap_rate_actual", data.capRateOm);
  set("pricing_deal_terms.cap_rate_asking", data.capRateOm);
  set("pricing_deal_terms.entry_cap_rate", data.capRateAdjusted);
  set("pricing_deal_terms.price_per_acre", data.pricePerAcre);

  // Income
  set("income.base_rent", data.baseRent);
  set("income.nnn_reimbursements", data.nnnReimbursements);
  set("income.effective_gross_income", data.effectiveGrossIncome);
  set("income.potential_gross_income", data.grossScheduledIncome);

  // Expenses
  set("expenses.noi", data.noiOm);
  set("expenses.noi_om", data.noiOm);
  set("expenses.noi_adjusted", data.noiAdjusted);
  set("expenses.total_expenses", data.totalExpenses);

  // Debt
  set("debt_assumptions.dscr", data.dscrOm);
  set("debt_assumptions.dscr_om", data.dscrOm);
  set("debt_assumptions.dscr_adjusted", data.dscrAdjusted);
  set("debt_assumptions.debt_yield", data.debtYield);
  set("debt_assumptions.cash_on_cash", data.cashOnCashOm);

  // Rent roll
  set("rent_roll.avg_rent_psf", data.rentPerSf);
  set("rent_roll.weighted_avg_lease_term", data.wale);

  // Tenant info
  if (data.tenants && data.tenants.length > 0) {
    const primaryTenant = data.tenants[0];
    set("tenant_info.primary_tenant", primaryTenant.name);
    set("tenant_info.tenant_count", data.tenants.length);
  }

  // Asset-type addons
  if (data.addons) {
    const addons = data.addons;
    if (analysisType === "industrial") {
      set("industrial_addons.rent_per_sf", addons.rent_per_sf);
      set("industrial_addons.clear_height", addons.clear_height);
      set("property_basics.ceiling_height", addons.clear_height);
      set("industrial_addons.loading_type", addons.loading_type);
      set("property_basics.dock_high_loading", addons.loading_type === "dock-high" || addons.loading_type === "both");
      set("industrial_addons.loading_count", addons.loading_count);
      set("property_basics.outside_storage_area", addons.yard_space);
      set("industrial_addons.power_amps", addons.power_amps);
      set("industrial_addons.sprinklered", addons.sprinklered);
      set("industrial_addons.rail_served", addons.rail_served);
      set("industrial_addons.lot_acres", addons.lot_acres);
      // Backfill lot_acres if missing from property_basics
      if (!fields["property_basics.land_acres"] && addons.lot_acres) {
        set("property_basics.land_acres", addons.lot_acres);
      }
    }
    if (analysisType === "office") {
      set("office_addons.suite_count", addons.suite_count);
      set("office_addons.medical_flag", addons.medical_flag);
      set("office_addons.building_class", addons.building_class);
      set("office_addons.parking_ratio", addons.parking_ratio);
      set("office_addons.lease_expirations_near_term", addons.lease_expirations_near_term);
      set("property_basics.ti_exposure", addons.ti_lc_signal);
    }
  }

  // Land-specific
  if (analysisType === "land" && data.zoning) {
    set("land_zoning.current_zoning", data.zoning.current_zoning);
    set("land_zoning.entitled", data.zoning.entitled);
    set("land_zoning.entitlement_status", data.zoning.entitlement_status);
    set("land_zoning.permitted_uses", data.zoning.permitted_uses);
    set("land_zoning.density_allowed", data.zoning.density_allowed);
    set("land_zoning.far_allowed", data.zoning.far_allowed);
  }
  if (analysisType === "land" && data.utilities) {
    set("land_utilities.water", data.utilities.water);
    set("land_utilities.sewer", data.utilities.sewer);
    set("land_utilities.electric", data.utilities.electric);
    set("land_utilities.gas", data.utilities.gas);
  }
  if (analysisType === "land" && data.access) {
    set("land_access.highway_proximity", data.access.highway_proximity);
    set("land_access.frontage_description", data.access.frontage_description);
    set("land_access.rail_access", data.access.rail_access);
    set("land_access.road_access", data.access.road_access);
  }
  if (analysisType === "land") {
    set("property_basics.lot_acres", data.landAcres);
  }

  return fields;
}

/**
 * Retail scoring — matches Pro /api/workspace/score/route.ts logic
 */
function scoreRetail(fields: Record<string, any>, data: any): ScoringResult {
  const WEIGHTS = {
    pricing: 15,
    cashflow: 15,
    upside: 10,
    tenant: 12,
    rollover: 10,
    vacancy: 8,
    location: 10,
    physical: 8,
    redevelopment: 5,
    confidence: 7,
  };

  const categories: Record<string, number> = {};
  const explanations: Record<string, string> = {};

  // Helper
  const val = (path: string) => {
    const f = fields[path];
    return f && typeof f === "object" && "value" in f ? f.value : f;
  };

  // 1. Pricing
  const capRate = val("pricing_deal_terms.cap_rate_actual") || val("pricing_deal_terms.cap_rate_asking");
  const priceSf = val("pricing_deal_terms.price_per_sf");
  let pricingScore = 50;
  if (capRate) {
    if (capRate >= 8) pricingScore += 30;
    else if (capRate >= 7) pricingScore += 15;
    else if (capRate >= 6) pricingScore += 5;
    else if (capRate < 5.5) pricingScore -= 20;
    else pricingScore -= 10;
  }
  if (priceSf) {
    if (priceSf < 120) pricingScore += 10;
    else if (priceSf > 200) pricingScore -= 15;
  }
  categories.pricing = Math.max(0, Math.min(100, pricingScore));
  explanations.pricing = capRate ? `Cap rate ${Number(capRate).toFixed(1)}%, $${Math.round(priceSf || 0)}/SF` : "Limited pricing data";

  // 2. Cashflow
  const noi = val("expenses.noi") || val("expenses.noi_om");
  const dscr = val("debt_assumptions.dscr") || val("debt_assumptions.dscr_om");
  let cashflowScore = 50;
  if (dscr) {
    if (dscr >= 1.35) cashflowScore += 30;
    else if (dscr >= 1.2) cashflowScore += 15;
    else if (dscr < 1.0) cashflowScore -= 30;
    else cashflowScore -= 10;
  }
  categories.cashflow = Math.max(0, Math.min(100, cashflowScore));
  explanations.cashflow = dscr ? `DSCR ${Number(dscr).toFixed(2)}x` : "Limited cashflow data";

  // 3. Upside
  let upsideScore = 50;
  const rentSf = val("rent_roll.avg_rent_psf");
  if (rentSf && rentSf < 15) upsideScore += 15;
  categories.upside = Math.max(0, Math.min(100, upsideScore));
  explanations.upside = "Market rent growth potential assessed";

  // 4. Tenant Quality
  let tenantScore = 50;
  const wale = val("rent_roll.weighted_avg_lease_term") || val("property_basics.wale_years");
  if (wale) {
    if (wale >= 10) tenantScore += 25;
    else if (wale >= 7) tenantScore += 15;
    else if (wale >= 5) tenantScore += 5;
    else if (wale < 3) tenantScore -= 20;
  }
  categories.tenant = Math.max(0, Math.min(100, tenantScore));
  explanations.tenant = wale ? `WALE ${Number(wale).toFixed(1)} years` : "Tenant data limited";

  // 5. Rollover Risk
  let rolloverScore = 60;
  if (wale && wale < 3) rolloverScore -= 25;
  else if (wale && wale >= 7) rolloverScore += 15;
  categories.rollover = Math.max(0, Math.min(100, rolloverScore));
  explanations.rollover = wale ? `Lease rollover in ~${Math.round(wale || 5)} years` : "Rollover data limited";

  // 6. Vacancy
  const occupancy = val("property_basics.occupancy_pct");
  let vacancyScore = 50;
  if (occupancy) {
    if (occupancy >= 95) vacancyScore = 90;
    else if (occupancy >= 90) vacancyScore = 75;
    else if (occupancy >= 80) vacancyScore = 55;
    else vacancyScore = 30;
  }
  categories.vacancy = vacancyScore;
  explanations.vacancy = occupancy ? `${Number(occupancy).toFixed(0)}% occupied` : "Occupancy data limited";

  // 7. Location
  categories.location = 55; // Neutral without deep research
  explanations.location = "Location assessed at market level";

  // 8. Physical
  const yearBuilt = val("property_basics.year_built");
  let physicalScore = 55;
  if (yearBuilt) {
    const age = new Date().getFullYear() - Number(yearBuilt);
    if (age < 10) physicalScore += 20;
    else if (age < 25) physicalScore += 5;
    else if (age > 40) physicalScore -= 15;
  }
  categories.physical = Math.max(0, Math.min(100, physicalScore));
  explanations.physical = yearBuilt ? `Built ${yearBuilt}` : "Building age unknown";

  // 9. Redevelopment
  categories.redevelopment = 50;
  explanations.redevelopment = "Redevelopment potential neutral";

  // 10. Data Confidence
  const totalFields = Object.keys(fields).length;
  const highConfFields = Object.values(fields).filter((f: any) => f?.confidence >= 0.7).length;
  const ratio = totalFields > 0 ? highConfFields / totalFields : 0.5;
  categories.confidence = Math.max(40, Math.min(100, Math.round(ratio * 100)));
  explanations.confidence = `${totalFields} data points extracted`;

  // Weighted total
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    if (categories[key] !== undefined) {
      total += categories[key] * weight;
      weightSum += weight;
    }
  }
  const totalScore = weightSum > 0 ? Math.round(total / weightSum) : 50;
  const scoreBand = getScoreBand(totalScore);

  return {
    totalScore,
    scoreBand,
    recommendation: getRecommendation(scoreBand, totalScore, fields),
    categories: Object.entries(categories).map(([name, score]) => ({
      name,
      weight: WEIGHTS[name as keyof typeof WEIGHTS] || 0,
      score,
      explanation: explanations[name] || "",
    })),
    analysisType: "retail" as any,
    modelVersion: "1.0-lite",
  };
}

function getScoreBand(score: number): string {
  if (score >= 85) return "strong_buy";
  if (score >= 70) return "buy";
  if (score >= 50) return "hold";
  if (score >= 30) return "pass";
  return "strong_reject";
}

function getRecommendation(band: string, score: number, fields: Record<string, any>): string {
  const val = (path: string) => {
    const f = fields[path];
    return f && typeof f === "object" && "value" in f ? f.value : f;
  };
  const capRate = val("pricing_deal_terms.cap_rate_actual") || val("pricing_deal_terms.cap_rate_asking");
  const occupancy = val("property_basics.occupancy_pct");
  const dscr = val("debt_assumptions.dscr") || val("debt_assumptions.dscr_om");

  const strengths: string[] = [];
  const concerns: string[] = [];

  if (capRate) {
    if (capRate >= 8) strengths.push(`strong ${Number(capRate).toFixed(1)}% cap rate`);
    else if (capRate >= 7) strengths.push(`solid ${Number(capRate).toFixed(1)}% cap rate`);
    else if (capRate < 6) concerns.push(`thin ${Number(capRate).toFixed(1)}% cap rate`);
  }
  if (occupancy) {
    if (occupancy >= 95) strengths.push(`${Number(occupancy).toFixed(0)}% occupied`);
    else if (occupancy < 80) concerns.push(`${Number(occupancy).toFixed(0)}% occupancy`);
  }
  if (dscr) {
    if (dscr >= 1.35) strengths.push(`${Number(dscr).toFixed(2)}x DSCR`);
    else if (dscr < 1.2) concerns.push(`tight ${Number(dscr).toFixed(2)}x DSCR`);
  }

  const bandLabel: Record<string, string> = { strong_buy: "Strong Buy", buy: "Buy", hold: "Neutral", pass: "Pass", strong_reject: "Strong Reject" };
  const label = bandLabel[band] || band;

  let rec = `${label} — Score ${score}/100.`;
  if (strengths.length) rec += ` Strengths: ${strengths.join(", ")}.`;
  if (concerns.length) rec += ` Concerns: ${concerns.join(", ")}.`;
  return rec;
}

function parseNumericIfPossible(val: string): number | string {
  if (typeof val !== "string") return val;
  const cleaned = val.replace(/[$,%]/g, "").trim();
  const num = Number(cleaned);
  return !isNaN(num) && cleaned.length > 0 ? num : val;
}
