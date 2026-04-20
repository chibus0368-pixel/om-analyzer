/**
 * Asset-class profiles.
 *
 * Both Quick Screen and OM Reverse Pricing consume this module so that
 * cap bands, vacancy floors, OpEx ratios, CapEx reserves, rent-growth
 * benchmarks, replacement cost anchors, and risk narrative all specialize
 * per asset type. Without this the analysis leans multifamily-flavored
 * and produces misleading verdicts on retail, industrial, office, etc.
 *
 * Numbers reflect a 2026 rate environment (SOFR ~4.5%, 10-yr UST ~4.25%).
 * Refresh annually.
 */

export type AssetType =
  | "multifamily"
  | "retail"
  | "industrial"
  | "office"
  | "medical_office"
  | "mixed_use"
  | "land"
  | "other";

export type UnitType = "units" | "sf";

export interface AssetProfile {
  key: AssetType;
  label: string;
  unitTypeHint: UnitType;

  /* Cap-rate band: "reasonable" going-in cap range for this asset class in
   * the current rate environment. Used for benchmark text and for deciding
   * whether a going-in cap is cushioned, thin, or compressed. */
  capBandLowPct: number;
  capBandHighPct: number;
  capBandDesc: string;

  /* Underwriting floors */
  vacancyFloorPct: number;
  dscrTarget: number;
  dscrPassFloor: number;

  /* OpEx ratio (as % of EGI) for fallback when OM doesn't disclose. */
  opexRatioDefault: number;
  opexRatioNote: string;

  /* CapEx reserve floors. Per-unit floors apply when unitType == "units"
   * (apartments); per-SF floors apply when unitType == "sf". "Old" = > 20
   * years since year built. */
  capexFloorPerUnit: number;
  capexFloorPerUnitOld: number;
  capexFloorPerSf: number;
  capexFloorPerSfOld: number;
  capexRationale: string;

  /* Rent-growth benchmarks used in scenario generation and critique. */
  rentGrowthBull: number;
  rentGrowthBase: number;
  rentGrowthBear: number;
  rentGrowthNote: string;

  /* Replacement cost anchors. Per-unit for multifamily (split by scale);
   * per-SF for SF-based assets. */
  replacementCostPerUnitSmall?: number;
  replacementCostPerUnitInst?: number;
  replacementCostPerSf?: number;

  /* Price quote convention for the UI. */
  priceUnitLabel: string;  // "unit" or "SF"
  pricePerUnitMin?: number;  // flag "below basis" threshold in prose
  pricePerUnitMax?: number;  // flag "premium" threshold in prose

  /* Narrative templates. These are static strengths/risks that apply to
   * the asset class regardless of the specific deal. Deal-specific works
   * and dies bullets are generated on top of these. */
  assetStrengths: string[];
  assetRisks: string[];
}

const MULTIFAMILY: AssetProfile = {
  key: "multifamily",
  label: "Multifamily",
  unitTypeHint: "units",
  capBandLowPct: 5.5,
  capBandHighPct: 7.0,
  capBandDesc: "multifamily sunbelt 2026 band 5.5%-7.0%",
  vacancyFloorPct: 5,
  dscrTarget: 1.25,
  dscrPassFloor: 1.15,
  opexRatioDefault: 0.45,
  opexRatioNote: "45% of EGI typical for garden/midrise apartments including tax + insurance",
  capexFloorPerUnit: 300,
  capexFloorPerUnitOld: 500,
  capexFloorPerSf: 0.25,
  capexFloorPerSfOld: 0.4,
  capexRationale: "$300/unit/yr new vintage, $500+/unit/yr past 20 years (plumbing, roof, HVAC, unit turns)",
  rentGrowthBull: 3.5,
  rentGrowthBase: 2.5,
  rentGrowthBear: 0.0,
  rentGrowthNote: "2026 CBRE sunbelt multifamily outlook 2.5%-3.0%",
  replacementCostPerUnitSmall: 125_000,
  replacementCostPerUnitInst: 250_000,
  priceUnitLabel: "unit",
  assetStrengths: [
    "Unit-level demand is fragmented; no single tenant rollover event kills the deal",
    "Annual lease turnover creates a continuous lever to mark rents to market",
  ],
  assetRisks: [
    "Insurance and property tax reassessment can swing NOI 10-15% in year two",
    "Submarket supply pipeline (permits + deliveries next 24 months) is the top supply risk",
    "Deferred plumbing, roof, and electrical carry on vintage pre-1990 product the OM rarely fully reserves for",
  ],
};

const RETAIL: AssetProfile = {
  key: "retail",
  label: "Retail",
  unitTypeHint: "sf",
  capBandLowPct: 6.5,
  capBandHighPct: 8.0,
  capBandDesc: "retail strip / unanchored 2026 band 6.5%-8.0% (STNL credit trades tighter)",
  vacancyFloorPct: 8,
  dscrTarget: 1.30,
  dscrPassFloor: 1.20,
  opexRatioDefault: 0.22,
  opexRatioNote: "NNN retail: landlord carries structural + CAM shortfalls; assume 18%-25% EGI drag",
  capexFloorPerUnit: 0,
  capexFloorPerUnitOld: 0,
  capexFloorPerSf: 0.2,
  capexFloorPerSfOld: 0.35,
  capexRationale: "$0.20-$0.35/SF/yr structural reserve; TI/LC for rollover is separate and runs $15-$40/SF per new lease",
  rentGrowthBull: 3.0,
  rentGrowthBase: 2.0,
  rentGrowthBear: 0.5,
  rentGrowthNote: "Necessity / service retail 1.5%-2.5%; bumps in-lease typically 2% annual or 10% per 5-yr option",
  replacementCostPerSf: 225,
  priceUnitLabel: "SF",
  pricePerUnitMin: 150,
  pricePerUnitMax: 450,
  assetStrengths: [
    "NNN lease structure shifts tax, insurance, and CAM volatility to tenant, stabilizing NOI",
    "Credit tenant roster with long remaining term drives bond-like cash flow through exit",
  ],
  assetRisks: [
    "Anchor or large-format tenant loss triggers co-tenancy clauses and cascades occupancy",
    "E-commerce substitution risk on non-necessity categories (soft goods, electronics, home furnishing)",
    "TI / LC reserves for rollover frequently understated; budget $15-$40/SF per new lease executed",
    "Credit quality of in-place rent roll: rent-to-sales ratio above 8-10% flags tenant health risk",
  ],
};

const INDUSTRIAL: AssetProfile = {
  key: "industrial",
  label: "Industrial",
  unitTypeHint: "sf",
  capBandLowPct: 5.5,
  capBandHighPct: 7.0,
  capBandDesc: "industrial class-A logistics 2026 band 5.5%-6.5%; class-B/flex 6.5%-7.5%",
  vacancyFloorPct: 6,
  dscrTarget: 1.25,
  dscrPassFloor: 1.15,
  opexRatioDefault: 0.12,
  opexRatioNote: "NNN industrial: 8%-15% EGI drag for landlord structural + vacancy carry",
  capexFloorPerUnit: 0,
  capexFloorPerUnitOld: 0,
  capexFloorPerSf: 0.15,
  capexFloorPerSfOld: 0.30,
  capexRationale: "$0.15-$0.30/SF/yr for roof, dock seals, sprinkler; clear-height or power upgrades are separate capital events",
  rentGrowthBull: 4.5,
  rentGrowthBase: 3.0,
  rentGrowthBear: 1.0,
  rentGrowthNote: "2026 logistics rent growth 2.5%-4% core sunbelt; tertiary markets softer",
  replacementCostPerSf: 175,
  priceUnitLabel: "SF",
  pricePerUnitMin: 80,
  pricePerUnitMax: 300,
  assetStrengths: [
    "Low opex load (NNN) means rent growth drops almost dollar-for-dollar to NOI",
    "Functional specs (clear height, column spacing, dock ratio) either work for modern logistics tenants or they don't — easy to diligence",
  ],
  assetRisks: [
    "Single-tenant rollover in a last-mile-only submarket creates binary outcomes on exit",
    "Clear height below 28' and column spacing tighter than 50'x50' increasingly functionally obsolete",
    "Submarket absorption softening past 12 months flags tenant-demand risk, especially for spec / class-B product",
    "Credit tenancy: unrated or small operators carry real default risk on long-dated leases",
  ],
};

const OFFICE: AssetProfile = {
  key: "office",
  label: "Office",
  unitTypeHint: "sf",
  capBandLowPct: 7.5,
  capBandHighPct: 10.0,
  capBandDesc: "office class-A 2026 band 7.5%-9%; class-B often unpriced or distressed",
  vacancyFloorPct: 15,
  dscrTarget: 1.40,
  dscrPassFloor: 1.25,
  opexRatioDefault: 0.45,
  opexRatioNote: "Full-service / gross leases: 40%-50% EGI drag; modified gross a bit leaner",
  capexFloorPerUnit: 0,
  capexFloorPerUnitOld: 0,
  capexFloorPerSf: 0.75,
  capexFloorPerSfOld: 1.25,
  capexRationale: "$0.75-$1.25/SF/yr structural + common area; TI/LC on every rollover runs $60-$150/SF for class-A",
  rentGrowthBull: 2.0,
  rentGrowthBase: 1.0,
  rentGrowthBear: -1.0,
  rentGrowthNote: "2026 office face rents flat-to-negative outside trophy; concession load still elevated",
  replacementCostPerSf: 325,
  priceUnitLabel: "SF",
  pricePerUnitMin: 100,
  pricePerUnitMax: 500,
  assetStrengths: [
    "Distressed basis can underwrite to outsized yields if operator has credible lease-up execution",
    "Trophy / amenitized assets still command flight-to-quality leasing in most metros",
  ],
  assetRisks: [
    "Re-leasing cost is the deal: TI + free rent + LC on rollover routinely burns 2-3 years of NOI per new lease",
    "Work-from-home and sublease supply still suppress market rents and elongate downtime",
    "Energy-transition capex (HVAC electrification, window upgrades) under new city/state mandates",
    "Capital-starvation spiral: lenders pulling back forces refi gaps that crystallize loss before stabilization",
  ],
};

const MEDICAL_OFFICE: AssetProfile = {
  key: "medical_office",
  label: "Medical Office",
  unitTypeHint: "sf",
  capBandLowPct: 6.5,
  capBandHighPct: 7.75,
  capBandDesc: "medical office 2026 band 6.5%-7.75% (on-campus trades tighter than off-campus)",
  vacancyFloorPct: 8,
  dscrTarget: 1.30,
  dscrPassFloor: 1.20,
  opexRatioDefault: 0.40,
  opexRatioNote: "Modified gross typical for MOB: 35%-45% EGI drag depending on submeter structure",
  capexFloorPerUnit: 0,
  capexFloorPerUnitOld: 0,
  capexFloorPerSf: 0.75,
  capexFloorPerSfOld: 1.50,
  capexRationale: "$0.75-$1.50/SF/yr structural; practice-specific TI on rollover runs $75-$200/SF (spec cabinetry, plumbing, imaging)",
  rentGrowthBull: 3.0,
  rentGrowthBase: 2.5,
  rentGrowthBear: 1.0,
  rentGrowthNote: "Escalators typically 2.5%-3% fixed; demand tracks aging demographics, not GDP cycle",
  replacementCostPerSf: 375,
  priceUnitLabel: "SF",
  pricePerUnitMin: 200,
  pricePerUnitMax: 600,
  assetStrengths: [
    "Sticky tenancy: physicians rarely relocate practices due to patient routing and buildout sunk cost",
    "Demand tracks aging demographics which are a multi-decade secular tailwind",
  ],
  assetRisks: [
    "Health-system consolidation can trigger portfolio-wide lease renegotiation or exit",
    "Spec TI costs on rollover routinely $100-$200/SF and frequently underwritten at half that",
    "Parking ratio and zoning compliance gates what practices can operate in the building",
    "Single health-system concentration above 40% is effectively a single-tenant credit bet",
  ],
};

const MIXED_USE: AssetProfile = {
  key: "mixed_use",
  label: "Mixed Use",
  unitTypeHint: "sf",
  capBandLowPct: 6.0,
  capBandHighPct: 7.5,
  capBandDesc: "mixed-use 2026 band 6.0%-7.5%; blended to weighted component mix",
  vacancyFloorPct: 8,
  dscrTarget: 1.30,
  dscrPassFloor: 1.20,
  opexRatioDefault: 0.40,
  opexRatioNote: "40% EGI typical; depends on residential / retail / office mix and lease structures",
  capexFloorPerUnit: 400,
  capexFloorPerUnitOld: 600,
  capexFloorPerSf: 0.45,
  capexFloorPerSfOld: 0.75,
  capexRationale: "Blended structural + component-specific capex; ground-floor retail TI carved separately",
  rentGrowthBull: 3.0,
  rentGrowthBase: 2.0,
  rentGrowthBear: 0.5,
  rentGrowthNote: "Blended to component weights; residential drives most of the inflation link",
  replacementCostPerSf: 275,
  priceUnitLabel: "SF",
  assetStrengths: [
    "Revenue diversification across residential and commercial smooths cycle-specific softness",
    "Urban mixed-use assets capture live-work-play demand in transit-adjacent submarkets",
  ],
  assetRisks: [
    "Ground-floor retail vacancy drags the whole asset's leasing perception and appraised value",
    "Shared systems (elevators, HVAC) allocate capex complexity across tenant types",
    "Condo-style ownership structures introduce governance and special-assessment risk",
  ],
};

const LAND: AssetProfile = {
  key: "land",
  label: "Land",
  unitTypeHint: "sf",
  capBandLowPct: 0,
  capBandHighPct: 0,
  capBandDesc: "N/A (residual land valuation, not cap-rate driven)",
  vacancyFloorPct: 0,
  dscrTarget: 1.0,
  dscrPassFloor: 0.0,
  opexRatioDefault: 0.0,
  opexRatioNote: "Land carry: taxes + insurance + debt service only",
  capexFloorPerUnit: 0,
  capexFloorPerUnitOld: 0,
  capexFloorPerSf: 0,
  capexFloorPerSfOld: 0,
  capexRationale: "Land: no ongoing capex; entitlement + horizontal improvements treated as capital project not reserve",
  rentGrowthBull: 0,
  rentGrowthBase: 0,
  rentGrowthBear: 0,
  rentGrowthNote: "N/A for pre-development land",
  priceUnitLabel: "SF",
  assetStrengths: [
    "Optionality on highest-and-best use if entitlement upside exists",
  ],
  assetRisks: [
    "Negative carry through entitlement and development timeline",
    "Zoning, entitlement, and horizontal improvement costs typically understated in broker pro formas",
    "Market timing risk on vertical start date when land is held speculatively",
  ],
};

const OTHER: AssetProfile = {
  key: "other",
  label: "Other",
  unitTypeHint: "sf",
  capBandLowPct: 6.0,
  capBandHighPct: 8.0,
  capBandDesc: "generic 2026 cap band 6%-8% (refine once asset class is confirmed)",
  vacancyFloorPct: 7,
  dscrTarget: 1.25,
  dscrPassFloor: 1.15,
  opexRatioDefault: 0.35,
  opexRatioNote: "35% EGI generic fallback; confirm lease structure to sharpen",
  capexFloorPerUnit: 400,
  capexFloorPerUnitOld: 500,
  capexFloorPerSf: 0.25,
  capexFloorPerSfOld: 0.4,
  capexRationale: "Generic reserve floor; refine once asset class is confirmed",
  rentGrowthBull: 3.0,
  rentGrowthBase: 2.5,
  rentGrowthBear: 0.5,
  rentGrowthNote: "Generic market assumption pending asset class confirmation",
  replacementCostPerSf: 200,
  replacementCostPerUnitSmall: 120_000,
  replacementCostPerUnitInst: 225_000,
  priceUnitLabel: "SF",
  assetStrengths: [
    "Diligence opportunity to refine asset class before hardening the bid",
  ],
  assetRisks: [
    "Unclassified asset: underwriting floors use generic defaults until class is confirmed",
  ],
};

export function getAssetProfile(assetType: AssetType | undefined | null): AssetProfile {
  switch (assetType) {
    case "multifamily": return MULTIFAMILY;
    case "retail": return RETAIL;
    case "industrial": return INDUSTRIAL;
    case "office": return OFFICE;
    case "medical_office": return MEDICAL_OFFICE;
    case "mixed_use": return MIXED_USE;
    case "land": return LAND;
    case "other":
    default: return OTHER;
  }
}

/** Capex floor appropriate to the asset + vintage + unit type. Returns a
 *  number in the same convention as the unitType (per unit/yr or per SF/yr). */
export function capexFloorFor(
  assetType: AssetType,
  unitType: UnitType,
  yearBuilt: number | null | undefined,
): number {
  const p = getAssetProfile(assetType);
  const age = yearBuilt ? new Date().getFullYear() - yearBuilt : 35;
  if (unitType === "sf") {
    return age > 20 ? p.capexFloorPerSfOld : p.capexFloorPerSf;
  }
  return age > 20 ? p.capexFloorPerUnitOld : p.capexFloorPerUnit;
}

/** Replacement cost per unit or per SF for the asset. Returns zero when
 *  the asset doesn't have a meaningful replacement anchor (e.g. land). */
export function replacementCostFor(
  assetType: AssetType,
  unitType: UnitType,
  dealScale: "institutional" | "small-operator",
): number {
  const p = getAssetProfile(assetType);
  if (unitType === "sf") return p.replacementCostPerSf ?? 0;
  if (dealScale === "small-operator") return p.replacementCostPerUnitSmall ?? 0;
  return p.replacementCostPerUnitInst ?? p.replacementCostPerUnitSmall ?? 0;
}
