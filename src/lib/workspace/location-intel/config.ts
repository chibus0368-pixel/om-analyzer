/**
 * Per-asset-type Location Intelligence configuration.
 *
 * Each asset type gets its own:
 *   - tileKeys: which Census/market datapoints to surface as stat tiles
 *   - anchorBias: which Google Places categories to weight when ranking
 *     "nearby anchors" for that asset type (e.g. hospitals matter more for
 *     medical office than for industrial)
 *   - signalRubric: ordered list of signal labels the LLM should grade,
 *     one line each, using the data we pass it
 *   - focusPrompt: 1-2 sentence framing that tells the analyst *what
 *     matters* for this asset type
 *
 * Keeping all of this in one config file means the rest of the pipeline
 * (fetch → synthesize → render) is type-agnostic. Adding a new asset type
 * or tuning a rubric is a single-file change.
 */

export type AssetType = "retail" | "industrial" | "office" | "land" | "multifamily";

export type TileKey =
  | "population"         // total pop in area (city-level fallback, tract/radius preferred)
  | "median_hhi"         // median household income
  | "median_age"
  | "home_value"
  | "median_rent"
  | "unemployment"
  | "labor_force"        // size of the working-age labor force in the area
  | "population_growth"  // 5-yr population % change
  | "housing_units"
  | "daytime_population"; // workers + residents present during business hrs

export interface AssetTypeConfig {
  tileKeys: TileKey[];
  anchorBias: string[];
  signalRubric: string[];
  focusPrompt: string;
}

export const TILE_LABELS: Record<TileKey, string> = {
  population: "Population",
  median_hhi: "Median HHI",
  median_age: "Median Age",
  home_value: "Home Value",
  median_rent: "Median Rent",
  unemployment: "Unemployment",
  labor_force: "Labor Force",
  population_growth: "Pop Growth (5y)",
  housing_units: "Housing Units",
  daytime_population: "Daytime Pop",
};

/**
 * Per-asset-type configuration. Keep tileKeys to 5 items so the row stays
 * legible at typical viewport widths.
 */
export const ASSET_TYPE_CONFIG: Record<AssetType, AssetTypeConfig> = {
  retail: {
    tileKeys: ["population", "median_hhi", "median_age", "home_value", "unemployment"],
    anchorBias: [
      "supermarket", "grocery_or_supermarket",
      "shopping_mall", "department_store",
      "pharmacy", "home_improvement_store",
      "restaurant_chain", "hospital",
    ],
    signalRubric: [
      "Demographics — income band + density vs MSA",
      "Daytime pop — office/medical/university traffic within 1 mi",
      "Anchor credit — credit quality of co-tenants and traffic drivers",
    ],
    focusPrompt:
      "Retail focuses on foot traffic, consumer spending power, and co-tenancy. Prioritize signals about rooftops, disposable income, and the credit quality of nearby anchors.",
  },
  office: {
    tileKeys: ["population", "median_hhi", "labor_force", "unemployment", "home_value"],
    anchorBias: [
      "hospital", "medical_center", "university",
      "subway_station", "transit_station",
      "corporate_office", "government_office",
    ],
    signalRubric: [
      "White-collar workforce — professional/medical employers within 1 mi",
      "Transit access — rail, BRT, or major arterial access",
      "Amenity base — food/services that attract tenants to this block",
    ],
    focusPrompt:
      "Office focuses on the white-collar labor shed, transit access, and amenity density that support leasing. For medical office specifically, weight hospital/health-system proximity heavily.",
  },
  industrial: {
    tileKeys: ["population", "labor_force", "unemployment", "median_hhi", "housing_units"],
    anchorBias: [
      "truck_stop", "transit_station", "airport",
      "warehouse", "factory",
      "highway", "industrial_park",
    ],
    signalRubric: [
      "Labor shed — blue-collar workforce within commuting distance",
      "Logistics access — interstates, intermodal, rail, port proximity",
      "Industrial cluster — distribution/manufacturing neighbors",
    ],
    focusPrompt:
      "Industrial focuses on logistics access (interstate/rail/port), labor shed depth, and the surrounding industrial cluster. Demographic income matters less than labor-force size.",
  },
  multifamily: {
    tileKeys: ["population", "median_hhi", "median_rent", "median_age", "population_growth"],
    anchorBias: [
      "grocery_or_supermarket", "supermarket",
      "school", "primary_school", "secondary_school", "university",
      "transit_station", "subway_station",
      "park", "hospital",
    ],
    signalRubric: [
      "Renter demand — household formation + employment growth nearby",
      "Amenity access — grocery, transit, schools within walkable range",
      "Income trajectory — is this a gentrifying, stable, or softening submarket",
    ],
    focusPrompt:
      "Multifamily focuses on renter-household demand, amenity walkability, and the income/employment trajectory of the submarket. Rents and household formation trump anchor-tenant credit.",
  },
  land: {
    tileKeys: ["population", "population_growth", "median_hhi", "home_value", "housing_units"],
    anchorBias: [
      "shopping_mall", "hospital", "school",
      "highway", "transit_station",
      "industrial_park",
    ],
    signalRubric: [
      "Growth trajectory — rooftop and population growth over 5 years",
      "Infrastructure — utility, road, and transit context for development",
      "Adjacency — what's around the site that signals highest-and-best-use",
    ],
    focusPrompt:
      "Land focuses on the growth trajectory of the submarket, surrounding development pattern, and infrastructure that supports entitlement. Current density matters less than the 5-year direction.",
  },
};

export function configFor(assetType: string | undefined | null): AssetTypeConfig {
  const key = (assetType || "retail") as AssetType;
  return ASSET_TYPE_CONFIG[key] || ASSET_TYPE_CONFIG.retail;
}
