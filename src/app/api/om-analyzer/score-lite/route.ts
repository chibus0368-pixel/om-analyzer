import { NextRequest, NextResponse } from "next/server";
import { scoreByType, scoreRetailPure, type ScoringResult } from "@/lib/workspace/scoring-models";

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

    // All analysis types now route through shared scoring-models.ts - Pro and Try Me
    // produce identical scores because they share the same pure scoring function.
    const result: ScoringResult = scoreByType(analysisType as any, fields);

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

function parseNumericIfPossible(val: string): number | string {
  if (typeof val !== "string") return val;
  const cleaned = val.replace(/[$,%]/g, "").trim();
  const num = Number(cleaned);
  return !isNaN(num) && cleaned.length > 0 ? num : val;
}
