/**
 * Scoring models for Industrial, Office, and Land CRE analysis types
 * Retail scoring remains in /api/workspace/score/route.ts (untouched)
 *
 * Each model evaluates property fundamentals against asset-type-specific criteria.
 * Scoring starts at 50 (neutral) and adjusts based on data quality and values.
 * Missing data reduces weights and re-normalizes for fairness.
 */

export type AnalysisType = "retail" | "industrial" | "office" | "land" | "multifamily";

export interface ScoringCategory {
  name: string;
  weight: number;
  score: number;
  explanation: string;
}

export interface ScoringResult {
  totalScore: number;
  scoreBand: string;
  recommendation: string;
  categories: ScoringCategory[];
  analysisType: AnalysisType;
  modelVersion: string;
}

/**
 * Helper: safely extract field value from normalized extraction map
 * Field names follow pattern: "fieldGroup.fieldName"
 */
function getField(
  fields: Record<string, any>,
  path: string,
  defaultValue: any = null
): any {
  const value = fields[path];
  if (value !== null && value !== undefined && typeof value === "object" && "value" in value) {
    return value.value;
  }
  if (value !== null && value !== undefined) return value;
  return defaultValue;
}

/**
 * Get confidence score for a field (0-1)
 */
function getConfidence(fields: Record<string, any>, path: string): number {
  const field = fields[path];
  if (field && typeof field === "object" && "confidence" in field) {
    return field.confidence || 0.5;
  }
  return 0;
}

/**
 * Get score band label and recommendation
 */
function getScoreBand(score: number): string {
  if (score >= 85) return "strong_buy";
  if (score >= 70) return "buy";
  if (score >= 50) return "hold";
  if (score >= 30) return "pass";
  return "strong_reject";
}

function getRecommendation(band: string, score: number, analysisType: AnalysisType): string {
  const typeLabel = analysisType.charAt(0).toUpperCase() + analysisType.slice(1);
  switch (band) {
    case "strong_buy":
      return `Score ${score}/100 - Strong acquisition candidate. ${typeLabel} fundamentals indicate compelling investment opportunity with favorable risk/return profile.`;
    case "buy":
      return `Score ${score}/100 - Solid opportunity worth pursuing. Fundamentals are sound with manageable risk factors.`;
    case "hold":
      return `Score ${score}/100 - Mixed signals. Further due diligence recommended before committing capital.`;
    case "pass":
      return `Score ${score}/100 - Significant risk factors identified. Pricing or fundamentals do not support acquisition at current terms.`;
    case "strong_reject":
      return `Score ${score}/100 - Does not meet investment criteria. Multiple red flags in pricing, property condition, or strategic fit.`;
    default:
      return `Score ${score}/100.`;
  }
}

/**
 * Normalize weights when some categories lack data
 * If a category has no data, its weight is removed and redistributed
 */
function normalizeWeights(
  weights: Record<string, number>,
  hasData: Record<string, boolean>
): Record<string, number> {
  const activeWeights: Record<string, number> = {};
  let totalActiveWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    if (hasData[key]) {
      activeWeights[key] = weight;
      totalActiveWeight += weight;
    }
  }

  if (totalActiveWeight === 0) {
    // All categories lack data; use equal weights
    const count = Object.keys(weights).length;
    for (const key of Object.keys(weights)) {
      activeWeights[key] = 100 / count;
    }
    return activeWeights;
  }

  // Renormalize to 100
  if (totalActiveWeight !== 100) {
    for (const key of Object.keys(activeWeights)) {
      activeWeights[key] = (activeWeights[key] / totalActiveWeight) * 100;
    }
  }

  return activeWeights;
}

/**
 * Calculate weighted total from category scores
 */
function calculateWeightedTotal(
  categoryScores: Record<string, number>,
  weights: Record<string, number>
): number {
  let total = 0;
  let weightSum = 0;

  for (const [category, score] of Object.entries(categoryScores)) {
    const weight = weights[category] || 0;
    total += score * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? Math.round(total / weightSum) : 50;
}

/**
 * Score data confidence across all extracted fields
 * Based on number of fields with high confidence or user confirmation
 */
function scoreDataConfidence(
  fields: Record<string, any>,
  requiredFields: string[]
): number {
  const totalFields = Object.keys(fields).length;
  if (totalFields === 0) return 20;

  let dataPoints = 0;
  let highQualityPoints = 0;

  for (const fieldPath of requiredFields) {
    const field = fields[fieldPath];
    if (field) {
      dataPoints++;
      const confidence = getConfidence(fields, fieldPath);
      const isConfirmed = field.confirmed === true;
      if (confidence >= 0.8 || isConfirmed) {
        highQualityPoints++;
      }
    }
  }

  if (dataPoints === 0) return 20;

  // Heavier weight on confirmed/high-confidence fields
  return Math.round((highQualityPoints / dataPoints) * 100);
}

// ==============================================================================
// INDUSTRIAL SCORING MODEL
// ==============================================================================

export function scoreIndustrial(fields: Record<string, any>): ScoringResult {
  const categories: Record<string, number> = {};
  const explanations: Record<string, string> = {};
  const hasDataMap: Record<string, boolean> = {};

  // Extract relevant fields
  const capRate = getField(fields, "pricing_deal_terms.cap_rate_actual") ||
    getField(fields, "pricing_deal_terms.cap_rate_asking");
  const pricePerSf = getField(fields, "pricing_deal_terms.price_per_sf");
  const rentPerSf = getField(fields, "rent_roll.avg_rent_psf");
  const noi = getField(fields, "expenses.noi");
  const buildingSf = getField(fields, "property_basics.building_sf");
  const ceilingHeight = getField(fields, "property_basics.ceiling_height");
  const yearBuilt = getField(fields, "property_basics.year_built");
  const occupancy = getField(fields, "property_basics.occupancy_pct");
  const tenantCredit = getField(fields, "tenant_info.tenant_credit_rating");
  const leaseTerms = getField(fields, "rent_roll.weighted_avg_lease_term");
  const dockHighLoading = getField(fields, "property_basics.dock_high_loading");
  const outsideStorage = getField(fields, "property_basics.outside_storage_area");
  const location = getField(fields, "property_basics.location_profile");
  const totalFields = Object.keys(fields).length;

  // ===== PRICING (15% weight) =====
  // Higher when price/SF and cap rate attractive for industrial
  const pricingData = { score: 50, explanation: "" };
  let pricingConditions = 0;
  let pricingPoints = 0;

  if (capRate !== null && capRate !== undefined) {
    pricingConditions++;
    // Industrial cap rates typically 5-7%; 6.5%+ is strong
    if (capRate >= 6.5) {
      pricingPoints += 35;
      pricingData.explanation += "Cap rate ≥6.5% (strong). ";
    } else if (capRate >= 5.5) {
      pricingPoints += 20;
      pricingData.explanation += "Cap rate 5.5-6.5% (competitive). ";
    } else if (capRate >= 4.5) {
      pricingPoints += 10;
      pricingData.explanation += "Cap rate <5.5% (tight). ";
    }
  }

  if (pricePerSf !== null && pricePerSf !== undefined && buildingSf) {
    pricingConditions++;
    // Industrial $80-150/SF typical; varies by market and spec
    if (pricePerSf >= 50 && pricePerSf <= 120) {
      pricingPoints += 35;
      pricingData.explanation += `Price/SF $${pricePerSf} (market range). `;
    } else if (pricePerSf > 120) {
      pricingPoints += 15;
      pricingData.explanation += `Price/SF $${pricePerSf} (premium). `;
    }
  }

  if (rentPerSf !== null && rentPerSf !== undefined) {
    pricingConditions++;
    // Rent must support cap rate; expect $3-6/SF/yr industrial
    if (rentPerSf >= 3 && rentPerSf <= 8) {
      pricingPoints += 30;
      pricingData.explanation += `Rent/SF $${rentPerSf} (viable). `;
    }
  }

  hasDataMap.pricing = pricingConditions > 0;
  if (pricingConditions > 0) {
    let rawScore = Math.round((pricingPoints / (pricingConditions * 35)) * 100);
    // Cap score when insufficient metrics - need all 3 (cap rate, price/SF, rent/SF) for full confidence
    if (pricingConditions < 3) {
      rawScore = Math.min(rawScore, 75);
      pricingData.explanation += `(Capped: only ${pricingConditions}/3 pricing metrics available.) `;
    }
    pricingData.score = rawScore;
  } else {
    pricingData.score = 50;
  }
  categories.pricing = pricingData.score;
  explanations.pricing = pricingData.explanation.trim();

  // ===== INCOME QUALITY (15% weight) =====
  // Higher when rent/SF and NOI appear coherent and reasonable
  const incomeData = { score: 50, explanation: "" };
  let incomeConditions = 0;
  let incomePoints = 0;

  if (
    rentPerSf !== null &&
    rentPerSf !== undefined &&
    noi !== null &&
    noi !== undefined &&
    buildingSf
  ) {
    incomeConditions++;
    // Adjust expense ratio expectation by lease type
    // Triple-net (NNN): tenant pays expenses → 90-95%+ NOI ratio
    // Gross: landlord pays expenses → 70-85% NOI ratio
    const leaseType = getField(fields, "rent_roll.tenant_1_type") || getField(fields, "property_basics.lease_type") || "";
    const leaseStr = String(leaseType).toLowerCase();
    const isNNN = leaseStr.includes("nnn") || leaseStr.includes("triple") || leaseStr.includes("net");
    const expenseRatio = isNNN ? 0.95 : 0.85;
    const expectedNoi = rentPerSf * buildingSf * expenseRatio;
    const tolerance = isNNN ? 0.20 : 0.30;
    if (Math.abs(noi - expectedNoi) / expectedNoi < tolerance) {
      incomePoints += 40;
      incomeData.explanation += `NOI coherent with rent/SF (${isNNN ? "NNN" : "gross"} validated). `;
    } else if (Math.abs(noi - expectedNoi) / expectedNoi < 0.5) {
      incomePoints += 20;
      incomeData.explanation += "NOI reasonable but high variance. ";
    }
  }

  if (occupancy !== null && occupancy !== undefined) {
    incomeConditions++;
    if (occupancy >= 90) {
      incomePoints += 30;
      incomeData.explanation += `Occupancy ${occupancy}% (strong). `;
    } else if (occupancy >= 80) {
      incomePoints += 15;
      incomeData.explanation += `Occupancy ${occupancy}% (acceptable). `;
    }
  }

  if (noi !== null && noi !== undefined && noi > 0) {
    incomeConditions++;
    incomePoints += 30;
    incomeData.explanation += `NOI documented: $${Math.round(noi).toLocaleString()}. `;
  }

  hasDataMap.income_quality = incomeConditions > 0;
  incomeData.score =
    incomeConditions > 0
      ? Math.round((incomePoints / (incomeConditions * 35)) * 100)
      : 50;
  categories.income_quality = incomeData.score;
  explanations.income_quality = incomeData.explanation.trim();

  // ===== FUNCTIONALITY (20% weight) =====
  // Clear ceiling height ≥28ft gets strong boost, dock-high loading, outside storage
  const funcData = { score: 50, explanation: "" };
  let funcConditions = 0;
  let funcPoints = 0;

  if (ceilingHeight !== null && ceilingHeight !== undefined) {
    funcConditions++;
    if (ceilingHeight >= 32) {
      funcPoints += 50;
      funcData.explanation += `Ceiling height ${ceilingHeight}ft (excellent). `;
    } else if (ceilingHeight >= 28) {
      funcPoints += 35;
      funcData.explanation += `Ceiling height ${ceilingHeight}ft (strong). `;
    } else if (ceilingHeight >= 24) {
      funcPoints += 15;
      funcData.explanation += `Ceiling height ${ceilingHeight}ft (limited). `;
    }
  }

  if (dockHighLoading) {
    funcConditions++;
    funcPoints += 25;
    funcData.explanation += "Dock-high loading (modern). ";
  }

  if (outsideStorage) {
    funcConditions++;
    funcPoints += 20;
    funcData.explanation += "Outside storage area (flexible). ";
  }

  if (buildingSf !== null && buildingSf !== undefined) {
    funcConditions++;
    // Larger flex buildings command premium; check for good ratio
    if (buildingSf >= 100000) {
      funcPoints += 15;
      funcData.explanation += `Large format ${Math.round(buildingSf / 1000)}k SF. `;
    } else if (buildingSf >= 50000) {
      funcPoints += 10;
      funcData.explanation += `Mid-size ${Math.round(buildingSf / 1000)}k SF. `;
    }
  }

  hasDataMap.functionality = funcConditions > 0;
  funcData.score =
    funcConditions > 0 ? Math.round((funcPoints / (funcConditions * 35)) * 100) : 50;
  categories.functionality = funcData.score;
  explanations.functionality = funcData.explanation.trim();

  // ===== TENANT / LEASE QUALITY (15% weight) =====
  // Stronger tenant, longer term
  const tenantData = { score: 50, explanation: "" };
  let tenantConditions = 0;
  let tenantPoints = 0;

  if (tenantCredit) {
    tenantConditions++;
    const creditStr = String(tenantCredit).toLowerCase();
    if (
      ["aaa", "aa", "a", "investment_grade", "investment grade"].includes(
        creditStr
      )
    ) {
      tenantPoints += 40;
      tenantData.explanation += `Tenant credit ${tenantCredit} (strong). `;
    } else if (["bbb", "bb"].includes(creditStr)) {
      tenantPoints += 20;
      tenantData.explanation += `Tenant credit ${tenantCredit} (moderate). `;
    } else {
      tenantPoints += 5;
      tenantData.explanation += `Tenant credit ${tenantCredit} (unrated). `;
    }
  }

  if (leaseTerms !== null && leaseTerms !== undefined) {
    tenantConditions++;
    if (leaseTerms >= 10) {
      tenantPoints += 40;
      tenantData.explanation += `Lease term ${leaseTerms} yrs (long). `;
    } else if (leaseTerms >= 5) {
      tenantPoints += 25;
      tenantData.explanation += `Lease term ${leaseTerms} yrs (medium). `;
    } else if (leaseTerms >= 3) {
      tenantPoints += 10;
      tenantData.explanation += `Lease term ${leaseTerms} yrs (short). `;
    }
  }

  hasDataMap.tenant_lease = tenantConditions > 0;
  tenantData.score =
    tenantConditions > 0 ? Math.round((tenantPoints / (tenantConditions * 40)) * 100) : 50;
  categories.tenant_lease = tenantData.score;
  explanations.tenant_lease = tenantData.explanation.trim();

  // ===== LOCATION (15% weight) =====
  // Infill logistics, interstate access, strong corridor
  const locData = { score: 50, explanation: "" };
  let locConditions = 0;
  let locPoints = 0;

  if (location) {
    locConditions++;
    const locStr = String(location).toLowerCase();
    if (
      locStr.includes("infill") ||
      locStr.includes("prime") ||
      locStr.includes("logistics")
    ) {
      locPoints += 45;
      locData.explanation += "Prime logistics/infill location. ";
    } else if (locStr.includes("corridor") || locStr.includes("emerging")) {
      locPoints += 25;
      locData.explanation += "Secondary corridor location. ";
    } else {
      locPoints += 10;
      locData.explanation += `Location: ${location}. `;
    }
  } else {
    locData.explanation += "Location data not provided. ";
  }

  const zip = getField(fields, "property_basics.zip");
  const state = getField(fields, "property_basics.state");
  if (zip && state) {
    locConditions++;
    locPoints += 20;
    locData.explanation += `Verified in ${state} market. `;
  }

  hasDataMap.location = locConditions > 0;
  locData.score =
    locConditions > 0 ? Math.round((locPoints / (locConditions * 35)) * 100) : 50;
  categories.location = locData.score;
  explanations.location = locData.explanation.trim();

  // ===== PHYSICAL UTILITY (10% weight) =====
  // Newer building, usable configuration
  const physData = { score: 50, explanation: "" };
  let physConditions = 0;
  let physPoints = 0;

  if (yearBuilt !== null && yearBuilt !== undefined) {
    physConditions++;
    const age = new Date().getFullYear() - yearBuilt;
    if (age < 10) {
      physPoints += 40;
      physData.explanation += `Built ${yearBuilt} (newer). `;
    } else if (age < 25) {
      physPoints += 25;
      physData.explanation += `Built ${yearBuilt} (modern). `;
    } else if (age < 40) {
      physPoints += 12;
      physData.explanation += `Built ${yearBuilt} (aging). `;
    } else {
      physPoints += 5;
      physData.explanation += `Built ${yearBuilt} (older). `;
    }
  }

  const yearRenovated = getField(fields, "property_basics.year_renovated");
  if (yearRenovated) {
    physConditions++;
    const renovAge = new Date().getFullYear() - yearRenovated;
    if (renovAge < 5) {
      physPoints += 30;
      physData.explanation += `Recently renovated ${yearRenovated}. `;
    } else if (renovAge < 15) {
      physPoints += 15;
      physData.explanation += `Updated ${yearRenovated}. `;
    }
  }

  hasDataMap.physical_utility = physConditions > 0;
  physData.score =
    physConditions > 0 ? Math.round((physPoints / (physConditions * 35)) * 100) : 50;
  categories.physical_utility = physData.score;
  explanations.physical_utility = physData.explanation.trim();

  // ===== DATA CONFIDENCE (10% weight) =====
  const requiredFieldsInd = [
    "pricing_deal_terms.cap_rate_actual",
    "pricing_deal_terms.price_per_sf",
    "property_basics.building_sf",
    "property_basics.ceiling_height",
    "rent_roll.avg_rent_psf",
    "expenses.noi",
    "property_basics.occupancy_pct",
  ];
  const confScore = scoreDataConfidence(fields, requiredFieldsInd);
  categories.data_confidence = confScore;
  explanations.data_confidence = `${confScore}/100 based on ${totalFields} extracted fields.`;

  // Calculate weighted total with normalization
  const weights = {
    pricing: 15,
    income_quality: 15,
    functionality: 20,
    tenant_lease: 15,
    location: 15,
    physical_utility: 10,
    data_confidence: 10,
  };

  const normalizedWeights = normalizeWeights(weights, hasDataMap);
  const totalScore = calculateWeightedTotal(categories, normalizedWeights);
  const scoreBand = getScoreBand(totalScore);
  const recommendation = getRecommendation(scoreBand, totalScore, "industrial");

  const categoryList: ScoringCategory[] = [
    {
      name: "Pricing",
      weight: weights.pricing,
      score: categories.pricing,
      explanation: explanations.pricing,
    },
    {
      name: "Income Quality",
      weight: weights.income_quality,
      score: categories.income_quality,
      explanation: explanations.income_quality,
    },
    {
      name: "Functionality",
      weight: weights.functionality,
      score: categories.functionality,
      explanation: explanations.functionality,
    },
    {
      name: "Tenant / Lease Quality",
      weight: weights.tenant_lease,
      score: categories.tenant_lease,
      explanation: explanations.tenant_lease,
    },
    {
      name: "Location",
      weight: weights.location,
      score: categories.location,
      explanation: explanations.location,
    },
    {
      name: "Physical Utility",
      weight: weights.physical_utility,
      score: categories.physical_utility,
      explanation: explanations.physical_utility,
    },
    {
      name: "Data Confidence",
      weight: weights.data_confidence,
      score: categories.data_confidence,
      explanation: explanations.data_confidence,
    },
  ];

  return {
    totalScore,
    scoreBand,
    recommendation,
    categories: categoryList,
    analysisType: "industrial",
    modelVersion: "1.0",
  };
}

// ==============================================================================
// OFFICE SCORING MODEL
// ==============================================================================

export function scoreOffice(fields: Record<string, any>): ScoringResult {
  const categories: Record<string, number> = {};
  const explanations: Record<string, string> = {};
  const hasDataMap: Record<string, boolean> = {};

  const capRate = getField(fields, "pricing_deal_terms.cap_rate_actual") ||
    getField(fields, "pricing_deal_terms.cap_rate_asking");
  const pricePerSf = getField(fields, "pricing_deal_terms.price_per_sf");
  const occupancy = getField(fields, "property_basics.occupancy_pct");
  const noi = getField(fields, "expenses.noi");
  const rentPerSf = getField(fields, "rent_roll.avg_rent_psf");
  const tenantCount = getField(fields, "property_basics.number_of_tenants");
  const leaseTerms = getField(fields, "rent_roll.weighted_avg_lease_term");
  const tiExposure = getField(fields, "property_basics.ti_exposure");
  const lcExposure = getField(fields, "property_basics.lc_exposure");
  const buildingSf = getField(fields, "property_basics.building_sf");
  const yearBuilt = getField(fields, "property_basics.year_built");
  const location = getField(fields, "property_basics.location_profile");
  const totalFields = Object.keys(fields).length;

  // ===== PRICING (15% weight) =====
  // Reasonable price/SF and cap rate for occupancy and mix
  const pricingData = { score: 50, explanation: "" };
  let pricingConditions = 0;
  let pricingPoints = 0;

  if (capRate !== null && capRate !== undefined) {
    pricingConditions++;
    // Office cap rates typically 4.5-6.5%; varies by class and occupancy
    if (capRate >= 5.5) {
      pricingPoints += 35;
      pricingData.explanation += "Cap rate ≥5.5% (attractive). ";
    } else if (capRate >= 4.5) {
      pricingPoints += 25;
      pricingData.explanation += "Cap rate 4.5-5.5% (fair). ";
    } else if (capRate >= 3.5) {
      pricingPoints += 10;
      pricingData.explanation += "Cap rate <4.5% (compressed). ";
    }
  }

  if (pricePerSf !== null && pricePerSf !== undefined) {
    pricingConditions++;
    // Office $150-300/SF typical for Class B/C; varies by market
    if (pricePerSf >= 100 && pricePerSf <= 250) {
      pricingPoints += 35;
      pricingData.explanation += `Price/SF $${pricePerSf} (market). `;
    } else if (pricePerSf > 250) {
      pricingPoints += 15;
      pricingData.explanation += `Price/SF $${pricePerSf} (premium Class A). `;
    } else if (pricePerSf < 100) {
      pricingPoints += 20;
      pricingData.explanation += `Price/SF $${pricePerSf} (value). `;
    }
  }

  if (occupancy !== null && occupancy !== undefined) {
    pricingConditions++;
    // Occupancy heavily influences pricing
    if (occupancy >= 90) {
      pricingPoints += 25;
      pricingData.explanation += `Occupancy ${occupancy}% (supports pricing). `;
    } else if (occupancy >= 80) {
      pricingPoints += 15;
    } else if (occupancy >= 70) {
      pricingPoints += 5;
    }
  }

  hasDataMap.pricing = pricingConditions > 0;
  pricingData.score =
    pricingConditions > 0
      ? Math.round((pricingPoints / (pricingConditions * 35)) * 100)
      : 50;
  categories.pricing = pricingData.score;
  explanations.pricing = pricingData.explanation.trim();

  // ===== OCCUPANCY STABILITY (20% weight) =====
  // Critical factor for office; banding by occupancy level
  const occData = { score: 50, explanation: "" };

  if (occupancy !== null && occupancy !== undefined) {
    if (occupancy >= 90) {
      occData.score = 90;
      occData.explanation = `Occupancy ${occupancy}% (excellent stability). `;
    } else if (occupancy >= 80) {
      occData.score = 75;
      occData.explanation = `Occupancy ${occupancy}% (good stability, some leasing risk). `;
    } else if (occupancy >= 65) {
      occData.score = 55;
      occData.explanation = `Occupancy ${occupancy}% (moderate vacancy, turnaround required). `;
    } else {
      occData.score = 30;
      occData.explanation = `Occupancy ${occupancy}% (significant vacancy risk). `;
    }
    hasDataMap.occupancy_stability = true;
  } else {
    occData.score = 25;
    occData.explanation = "INSUFFICIENT DATA: Occupancy unknown - treat as high risk.";
    hasDataMap.occupancy_stability = false;
  }
  categories.occupancy_stability = occData.score;
  explanations.occupancy_stability = occData.explanation;

  // ===== TENANT MIX (15% weight) =====
  // Diversified base; medical users score higher
  const mixData = { score: 50, explanation: "" };
  let mixConditions = 0;
  let mixPoints = 0;

  if (tenantCount !== null && tenantCount !== undefined) {
    mixConditions++;
    if (tenantCount >= 10) {
      mixPoints += 40;
      mixData.explanation += `${tenantCount} tenants (diversified). `;
    } else if (tenantCount >= 5) {
      mixPoints += 25;
      mixData.explanation += `${tenantCount} tenants (moderate concentration). `;
    } else {
      mixPoints += 10;
      mixData.explanation += `${tenantCount} tenants (concentrated). `;
    }
  }

  // Check for medical/healthcare focus (premium in office)
  const tenantProfile = getField(fields, "property_basics.tenant_profile");
  if (tenantProfile) {
    mixConditions++;
    const profileStr = String(tenantProfile).toLowerCase();
    if (profileStr.includes("medical") || profileStr.includes("healthcare")) {
      mixPoints += 40;
      mixData.explanation += "Medical/healthcare focus (premium). ";
    } else if (profileStr.includes("professional") || profileStr.includes("service")) {
      mixPoints += 25;
      mixData.explanation += "Professional services tenancy. ";
    }
  }

  hasDataMap.tenant_mix = mixConditions > 0;
  mixData.score =
    mixConditions > 0 ? Math.round((mixPoints / (mixConditions * 40)) * 100) : 50;
  categories.tenant_mix = mixData.score;
  explanations.tenant_mix = mixData.explanation.trim();

  // ===== LEASE ROLLOVER (15% weight) =====
  // Limited near-term churn
  const rolloverData = { score: 50, explanation: "" };
  let rolloverConditions = 0;
  let rolloverPoints = 0;

  if (leaseTerms !== null && leaseTerms !== undefined) {
    rolloverConditions++;
    if (leaseTerms >= 5) {
      rolloverPoints += 40;
      rolloverData.explanation += `Weighted avg lease ${leaseTerms} yrs (stable). `;
    } else if (leaseTerms >= 3) {
      rolloverPoints += 25;
      rolloverData.explanation += `Weighted avg lease ${leaseTerms} yrs (moderate). `;
    } else if (leaseTerms >= 1) {
      rolloverPoints += 10;
      rolloverData.explanation += `Weighted avg lease ${leaseTerms} yrs (near-term churn). `;
    } else {
      rolloverPoints += 0;
      rolloverData.explanation += "Limited lease term data. ";
    }
  }

  // Check for lease renewal schedule data
  const leaseRenewalSchedule = getField(
    fields,
    "rent_roll.lease_renewal_schedule"
  );
  if (leaseRenewalSchedule) {
    rolloverConditions++;
    rolloverPoints += 15;
    rolloverData.explanation += "Lease renewal schedule available. ";
  }

  hasDataMap.lease_rollover = rolloverConditions > 0;
  rolloverData.score =
    rolloverConditions > 0
      ? Math.round((rolloverPoints / (rolloverConditions * 40)) * 100)
      : 50;
  categories.lease_rollover = rolloverData.score;
  explanations.lease_rollover = rolloverData.explanation.trim();

  // ===== LOCATION (15% weight) =====
  // Strong corridor, demographics, healthcare adjacency
  const locData = { score: 50, explanation: "" };
  let locConditions = 0;
  let locPoints = 0;

  if (location) {
    locConditions++;
    const locStr = String(location).toLowerCase();
    if (
      locStr.includes("prime") ||
      locStr.includes("central business")
    ) {
      locPoints += 40;
      locData.explanation += "Prime/CBD location. ";
    } else if (locStr.includes("corridor") || locStr.includes("strong")) {
      locPoints += 25;
      locData.explanation += "Strong corridor. ";
    } else if (locStr.includes("emerging")) {
      locPoints += 15;
      locData.explanation += "Emerging corridor. ";
    }
  }

  const city = getField(fields, "property_basics.city");
  const state = getField(fields, "property_basics.state");
  if (city && state) {
    locConditions++;
    locPoints += 20;
    locData.explanation += `Market: ${city}, ${state}. `;
  }

  hasDataMap.location = locConditions > 0;
  locData.score =
    locConditions > 0 ? Math.round((locPoints / (locConditions * 35)) * 100) : 50;
  categories.location = locData.score;
  explanations.location = locData.explanation.trim();

  // ===== CAPITAL EXPOSURE (10% weight) =====
  // TI/LC exposure creates penalty
  const capExpData = { score: 50, explanation: "" };
  let capExpConditions = 0;
  let capExpPoints = 0;

  if (tiExposure !== null && tiExposure !== undefined) {
    capExpConditions++;
    const tiRatio = tiExposure / (buildingSf || 1);
    if (tiRatio < 0.01) {
      // <$1/SF TI
      capExpPoints += 35;
      capExpData.explanation += `TI/SF ${tiRatio.toFixed(2)} (minimal). `;
    } else if (tiRatio < 0.05) {
      capExpPoints += 20;
      capExpData.explanation += `TI exposure moderate. `;
    } else {
      capExpPoints += 5;
      capExpData.explanation += `High TI exposure ($${tiExposure.toLocaleString()}). `;
    }
  }

  if (lcExposure !== null && lcExposure !== undefined) {
    capExpConditions++;
    const lcRatio = lcExposure / (buildingSf || 1);
    if (lcRatio < 0.01) {
      capExpPoints += 35;
      capExpData.explanation += `LC/SF ${lcRatio.toFixed(2)} (minimal). `;
    } else if (lcRatio < 0.05) {
      capExpPoints += 20;
      capExpData.explanation += `LC exposure moderate. `;
    } else {
      capExpPoints += 5;
      capExpData.explanation += `High LC exposure ($${lcExposure.toLocaleString()}). `;
    }
  }

  if (capExpConditions === 0) {
    capExpData.explanation = "TI/LC exposure not documented; assume standard.";
  }

  hasDataMap.capital_exposure = capExpConditions > 0;
  capExpData.score =
    capExpConditions > 0
      ? Math.round((capExpPoints / (capExpConditions * 35)) * 100)
      : 50;
  categories.capital_exposure = capExpData.score;
  explanations.capital_exposure = capExpData.explanation.trim();

  // ===== DATA CONFIDENCE (10% weight) =====
  const requiredFieldsOffice = [
    "property_basics.occupancy_pct",
    "pricing_deal_terms.cap_rate_actual",
    "pricing_deal_terms.price_per_sf",
    "rent_roll.weighted_avg_lease_term",
    "property_basics.number_of_tenants",
    "expenses.noi",
  ];
  const confScore = scoreDataConfidence(fields, requiredFieldsOffice);
  categories.data_confidence = confScore;
  explanations.data_confidence = `${confScore}/100 based on ${totalFields} extracted fields.`;

  // Calculate weighted total
  const weights = {
    pricing: 15,
    occupancy_stability: 20,
    tenant_mix: 15,
    lease_rollover: 15,
    location: 15,
    capital_exposure: 10,
    data_confidence: 10,
  };

  const normalizedWeights = normalizeWeights(weights, hasDataMap);
  const totalScore = calculateWeightedTotal(categories, normalizedWeights);
  const scoreBand = getScoreBand(totalScore);
  const recommendation = getRecommendation(scoreBand, totalScore, "office");

  const categoryList: ScoringCategory[] = [
    {
      name: "Pricing",
      weight: weights.pricing,
      score: categories.pricing,
      explanation: explanations.pricing,
    },
    {
      name: "Occupancy Stability",
      weight: weights.occupancy_stability,
      score: categories.occupancy_stability,
      explanation: explanations.occupancy_stability,
    },
    {
      name: "Tenant Mix",
      weight: weights.tenant_mix,
      score: categories.tenant_mix,
      explanation: explanations.tenant_mix,
    },
    {
      name: "Lease Rollover",
      weight: weights.lease_rollover,
      score: categories.lease_rollover,
      explanation: explanations.lease_rollover,
    },
    {
      name: "Location",
      weight: weights.location,
      score: categories.location,
      explanation: explanations.location,
    },
    {
      name: "Capital Exposure",
      weight: weights.capital_exposure,
      score: categories.capital_exposure,
      explanation: explanations.capital_exposure,
    },
    {
      name: "Data Confidence",
      weight: weights.data_confidence,
      score: categories.data_confidence,
      explanation: explanations.data_confidence,
    },
  ];

  return {
    totalScore,
    scoreBand,
    recommendation,
    categories: categoryList,
    analysisType: "office",
    modelVersion: "1.0",
  };
}

// ==============================================================================
// LAND SCORING MODEL
// ==============================================================================

export function scoreLand(fields: Record<string, any>): ScoringResult {
  const categories: Record<string, number> = {};
  const explanations: Record<string, string> = {};
  const hasDataMap: Record<string, boolean> = {};

  const pricePerAcre = getField(fields, "pricing_deal_terms.price_per_acre");
  const askingPrice = getField(fields, "pricing_deal_terms.asking_price");
  // Parser saves as lot_acres (property_basics) - check both paths
  const acres = getField(fields, "property_basics.lot_acres") ||
    getField(fields, "property_basics.land_acres") ||
    getField(fields, "property_basics.usable_acres");
  const frontage = getField(fields, "property_basics.frontage_ft") ||
    getField(fields, "land_access.frontage_description");
  const visibility = getField(fields, "property_basics.visibility") ||
    getField(fields, "property_basics.topography");
  // Zoning is saved to land_zoning group by parser
  const zoning = getField(fields, "land_zoning.current_zoning") ||
    getField(fields, "property_basics.zoning");
  const marketedUse = getField(fields, "land_zoning.planned_use") ||
    getField(fields, "property_basics.marketed_use");
  // Utilities saved to land_utilities group by parser
  const sewerAvailable = getField(fields, "land_utilities.sewer") ??
    getField(fields, "property_basics.sewer_available");
  const waterAvailable = getField(fields, "land_utilities.water") ??
    getField(fields, "property_basics.water_available");
  const powerAvailable = getField(fields, "land_utilities.electric") ??
    getField(fields, "property_basics.power_available");
  // Access saved to land_access group by parser
  const interchangeAccess = getField(fields, "land_access.highway_proximity") ||
    getField(fields, "property_basics.interchange_access");
  const location = getField(fields, "property_basics.location_profile") ||
    getField(fields, "land_access.road_access");
  const totalFields = Object.keys(fields).length;

  // ===== PRICING (25% weight) =====
  // Attractive price/acre or price/buildable acre
  const pricingData = { score: 50, explanation: "" };
  let pricingConditions = 0;
  let pricingPoints = 0;

  if (pricePerAcre !== null && pricePerAcre !== undefined) {
    pricingConditions++;
    // Land pricing highly variable; $50k-500k/acre typical
    // For dev land, look for $100k-300k/acre reasonable
    if (pricePerAcre >= 50000 && pricePerAcre <= 300000) {
      pricingPoints += 40;
      pricingData.explanation += `Price/acre $${Math.round(pricePerAcre / 1000)}k (market). `;
    } else if (pricePerAcre < 50000) {
      pricingPoints += 35;
      pricingData.explanation += `Price/acre $${Math.round(pricePerAcre / 1000)}k (value). `;
    } else if (pricePerAcre <= 500000) {
      pricingPoints += 20;
      pricingData.explanation += `Price/acre $${Math.round(pricePerAcre / 1000)}k (premium). `;
    } else {
      pricingPoints += 5;
      pricingData.explanation += `Price/acre $${Math.round(pricePerAcre / 1000)}k (very high). `;
    }
  } else if (askingPrice && acres && acres > 0) {
    pricingConditions++;
    const calcPerAcre = askingPrice / acres;
    if (calcPerAcre >= 50000 && calcPerAcre <= 300000) {
      pricingPoints += 40;
      pricingData.explanation += `Implied price/acre $${Math.round(calcPerAcre / 1000)}k. `;
    } else if (calcPerAcre < 50000) {
      pricingPoints += 35;
      pricingData.explanation += `Implied price/acre $${Math.round(calcPerAcre / 1000)}k (value). `;
    } else {
      pricingPoints += 15;
      pricingData.explanation += `Implied price/acre $${Math.round(calcPerAcre / 1000)}k (premium). `;
    }
  }

  if (acres && acres > 0) {
    pricingConditions++;
    if (acres >= 10 && acres <= 50) {
      pricingPoints += 25;
      pricingData.explanation += `${acres} acres (typical development size). `;
    } else if (acres < 10) {
      pricingPoints += 15;
      pricingData.explanation += `${acres} acres (infill). `;
    } else if (acres <= 100) {
      pricingPoints += 20;
      pricingData.explanation += `${acres} acres (larger parcel). `;
    }
  }

  hasDataMap.pricing = pricingConditions > 0;
  pricingData.score =
    pricingConditions > 0
      ? Math.round((pricingPoints / (pricingConditions * 40)) * 100)
      : 50;
  categories.pricing = pricingData.score;
  explanations.pricing = pricingData.explanation.trim();

  // ===== LOCATION (20% weight) =====
  // Visibility, corridor quality, interchange adjacency
  const locData = { score: 50, explanation: "" };
  let locConditions = 0;
  let locPoints = 0;

  if (visibility) {
    locConditions++;
    const visStr = String(visibility).toLowerCase();
    if (visStr.includes("high") || visStr.includes("excellent")) {
      locPoints += 35;
      locData.explanation += "High visibility (retail-ready). ";
    } else if (visStr.includes("good") || visStr.includes("moderate")) {
      locPoints += 20;
      locData.explanation += "Good visibility. ";
    } else {
      locPoints += 5;
      locData.explanation += "Limited visibility. ";
    }
  }

  if (location) {
    locConditions++;
    const locStr = String(location).toLowerCase();
    if (
      locStr.includes("prime") ||
      locStr.includes("major corridor") ||
      locStr.includes("infill")
    ) {
      locPoints += 35;
      locData.explanation += "Prime location. ";
    } else if (locStr.includes("corridor") || locStr.includes("secondary")) {
      locPoints += 20;
      locData.explanation += "Secondary corridor. ";
    } else {
      locPoints += 5;
      locData.explanation += `Location: ${location}. `;
    }
  }

  if (interchangeAccess) {
    locConditions++;
    locPoints += 30;
    locData.explanation += "Interchange access (strong). ";
  }

  hasDataMap.location = locConditions > 0;
  locData.score =
    locConditions > 0 ? Math.round((locPoints / (locConditions * 35)) * 100) : 50;
  categories.location = locData.score;
  explanations.location = locData.explanation.trim();

  // ===== ZONING / ENTITLEMENT (20% weight) =====
  // Zoning aligns with marketed use
  const zoningData = { score: 50, explanation: "" };
  let zoningConditions = 0;
  let zoningPoints = 0;

  if (zoning && marketedUse) {
    zoningConditions++;
    const zoningStr = String(zoning).toLowerCase();
    const useStr = String(marketedUse).toLowerCase();

    // Check for alignment
    const alignments = [
      { zoning: "commercial", uses: ["retail", "office", "restaurant"] },
      { zoning: "industrial", uses: ["warehouse", "manufacturing", "industrial"] },
      { zoning: "residential", uses: ["residential", "condo", "multifamily"] },
      { zoning: "mixed-use", uses: ["mixed", "retail", "office", "residential"] },
    ];

    let aligned = false;
    for (const align of alignments) {
      if (
        zoningStr.includes(align.zoning) &&
        align.uses.some(u => useStr.includes(u))
      ) {
        aligned = true;
        break;
      }
    }

    if (aligned) {
      zoningPoints += 45;
      zoningData.explanation += `Zoning (${zoning}) aligns with use (${marketedUse}). `;
    } else {
      zoningPoints += 15;
      zoningData.explanation += `Zoning (${zoning}) vs use (${marketedUse}); review needed. `;
    }
  } else if (zoning) {
    zoningConditions++;
    zoningPoints += 25;
    zoningData.explanation += `Zoning: ${zoning}. `;
  }

  // Entitlements / approvals in place?
  const entitlementStatus = getField(fields, "land_zoning.entitlement_status") ||
    getField(fields, "land_zoning.entitled") ||
    getField(fields, "property_basics.entitlement_status");
  if (entitlementStatus) {
    zoningConditions++;
    const statusStr = String(entitlementStatus).toLowerCase();
    if (statusStr.includes("approved") || statusStr.includes("final")) {
      zoningPoints += 40;
      zoningData.explanation += "Entitlements approved. ";
    } else if (statusStr.includes("in progress") || statusStr.includes("pending")) {
      zoningPoints += 20;
      zoningData.explanation += "Entitlements in process. ";
    } else {
      zoningPoints += 5;
      zoningData.explanation += "Entitlements uncertain. ";
    }
  }

  hasDataMap.zoning_entitlement = zoningConditions > 0;
  zoningData.score =
    zoningConditions > 0
      ? Math.round((zoningPoints / (zoningConditions * 40)) * 100)
      : 50;
  categories.zoning_entitlement = zoningData.score;
  explanations.zoning_entitlement = zoningData.explanation.trim();

  // ===== UTILITIES / POWER (20% weight) =====
  // Sewer, water, power nearby
  const utilData = { score: 50, explanation: "" };
  let utilConditions = 0;
  let utilPoints = 0;

  const utilityRequirements = 3; // Sewer, water, power

  if (sewerAvailable !== null && sewerAvailable !== undefined) {
    utilConditions++;
    if (sewerAvailable) {
      utilPoints += 30;
      utilData.explanation += "Sewer available. ";
    } else {
      utilPoints += 5;
      utilData.explanation += "Sewer unavailable/septic. ";
    }
  }

  if (waterAvailable !== null && waterAvailable !== undefined) {
    utilConditions++;
    if (waterAvailable) {
      utilPoints += 30;
      utilData.explanation += "Water available. ";
    } else {
      utilPoints += 5;
      utilData.explanation += "Water unavailable/well. ";
    }
  }

  if (powerAvailable !== null && powerAvailable !== undefined) {
    utilConditions++;
    if (powerAvailable) {
      utilPoints += 30;
      utilData.explanation += "Power available. ";
    } else {
      utilPoints += 5;
      utilData.explanation += "Power development cost. ";
    }
  }

  hasDataMap.utilities_power = utilConditions > 0;
  utilData.score =
    utilConditions > 0
      ? Math.round((utilPoints / (utilConditions * 30)) * 100)
      : 50;
  categories.utilities_power = utilData.score;
  explanations.utilities_power = utilData.explanation.trim();

  // ===== ACCESS / FRONTAGE (10% weight) =====
  // Strong frontage, signalized access
  const accessData = { score: 50, explanation: "" };
  let accessConditions = 0;
  let accessPoints = 0;

  if (frontage !== null && frontage !== undefined) {
    accessConditions++;
    if (frontage >= 150) {
      accessPoints += 40;
      accessData.explanation += `${frontage}ft frontage (strong). `;
    } else if (frontage >= 80) {
      accessPoints += 25;
      accessData.explanation += `${frontage}ft frontage (good). `;
    } else {
      accessPoints += 10;
      accessData.explanation += `${frontage}ft frontage (limited). `;
    }
  }

  const signalizedAccess = getField(fields, "land_access.access_points") ||
    getField(fields, "property_basics.signalized_access");
  if (signalizedAccess) {
    accessConditions++;
    accessPoints += 30;
    accessData.explanation += "Signalized access available. ";
  }

  hasDataMap.access_frontage = accessConditions > 0;
  accessData.score =
    accessConditions > 0
      ? Math.round((accessPoints / (accessConditions * 35)) * 100)
      : 50;
  categories.access_frontage = accessData.score;
  explanations.access_frontage = accessData.explanation.trim();

  // ===== DATA CONFIDENCE (5% weight) =====
  const requiredFieldsLand = [
    "pricing_deal_terms.price_per_acre",
    "pricing_deal_terms.asking_price",
    "property_basics.lot_acres",
    "land_zoning.current_zoning",
    "land_zoning.planned_use",
    "land_utilities.water",
    "land_utilities.sewer",
    "land_utilities.electric",
    "land_access.road_access",
  ];
  const confScore = scoreDataConfidence(fields, requiredFieldsLand);
  categories.data_confidence = confScore;
  explanations.data_confidence = `${confScore}/100 based on ${totalFields} extracted fields.`;

  // Calculate weighted total
  const weights = {
    pricing: 25,
    location: 20,
    zoning_entitlement: 20,
    utilities_power: 20,
    access_frontage: 10,
    data_confidence: 5,
  };

  const normalizedWeights = normalizeWeights(weights, hasDataMap);
  const totalScore = calculateWeightedTotal(categories, normalizedWeights);
  const scoreBand = getScoreBand(totalScore);
  const recommendation = getRecommendation(scoreBand, totalScore, "land");

  const categoryList: ScoringCategory[] = [
    {
      name: "Pricing",
      weight: weights.pricing,
      score: categories.pricing,
      explanation: explanations.pricing,
    },
    {
      name: "Location",
      weight: weights.location,
      score: categories.location,
      explanation: explanations.location,
    },
    {
      name: "Zoning / Entitlement",
      weight: weights.zoning_entitlement,
      score: categories.zoning_entitlement,
      explanation: explanations.zoning_entitlement,
    },
    {
      name: "Utilities / Power",
      weight: weights.utilities_power,
      score: categories.utilities_power,
      explanation: explanations.utilities_power,
    },
    {
      name: "Access / Frontage",
      weight: weights.access_frontage,
      score: categories.access_frontage,
      explanation: explanations.access_frontage,
    },
    {
      name: "Data Confidence",
      weight: weights.data_confidence,
      score: categories.data_confidence,
      explanation: explanations.data_confidence,
    },
  ];

  return {
    totalScore,
    scoreBand,
    recommendation,
    categories: categoryList,
    analysisType: "land",
    modelVersion: "1.0",
  };
}

// ==============================================================================
// MULTIFAMILY SCORING MODEL
// ==============================================================================

export function scoreMultifamily(fields: Record<string, any>): ScoringResult {
  const categories: Record<string, number> = {};
  const explanations: Record<string, string> = {};
  const hasDataMap: Record<string, boolean> = {};
  const totalFields = Object.keys(fields).length;

  // ===== PRICING (20% weight) =====
  const pricingData = { score: 50, explanation: "" };
  let pricingConditions = 0;
  let pricingPoints = 0;

  const capRate = getField(fields, "pricing_deal_terms.cap_rate_actual") ||
    getField(fields, "pricing_deal_terms.cap_rate_asking") ||
    getField(fields, "pricing_deal_terms.cap_rate_om") ||
    getField(fields, "pricing_deal_terms.entry_cap_rate");
  const askingPrice = getField(fields, "pricing_deal_terms.asking_price") ||
    getField(fields, "pricing_deal_terms.purchase_price");
  const unitCount = getField(fields, "multifamily.unit_count") ||
    getField(fields, "property_basics.unit_count") ||
    getField(fields, "property_basics.suite_count");
  const pricePerUnit = getField(fields, "pricing_deal_terms.price_per_unit");

  if (capRate !== null && capRate !== undefined) {
    pricingConditions++;
    // Multifamily cap rates: 4.0-5.0% compressed, 5.0-6.5% market, 6.5%+ value-add
    if (capRate >= 6.5) {
      pricingPoints += 40;
      pricingData.explanation += `${capRate.toFixed(1)}% cap rate (value-add opportunity). `;
    } else if (capRate >= 5.0) {
      pricingPoints += 35;
      pricingData.explanation += `${capRate.toFixed(1)}% cap rate (market). `;
    } else if (capRate >= 4.0) {
      pricingPoints += 20;
      pricingData.explanation += `${capRate.toFixed(1)}% cap rate (compressed). `;
    } else {
      pricingPoints += 10;
      pricingData.explanation += `${capRate.toFixed(1)}% cap rate (very thin). `;
    }
  }

  // Price per unit
  const effectivePPU = pricePerUnit || (askingPrice && unitCount && unitCount > 0 ? askingPrice / unitCount : null);
  if (effectivePPU !== null && effectivePPU !== undefined) {
    pricingConditions++;
    // $50k-100k/unit value, $100k-175k market, $175k+ premium
    if (effectivePPU <= 100000) {
      pricingPoints += 40;
      pricingData.explanation += `$${Math.round(effectivePPU / 1000)}k/unit (value). `;
    } else if (effectivePPU <= 175000) {
      pricingPoints += 30;
      pricingData.explanation += `$${Math.round(effectivePPU / 1000)}k/unit (market). `;
    } else if (effectivePPU <= 250000) {
      pricingPoints += 20;
      pricingData.explanation += `$${Math.round(effectivePPU / 1000)}k/unit (premium). `;
    } else {
      pricingPoints += 10;
      pricingData.explanation += `$${Math.round(effectivePPU / 1000)}k/unit (very high). `;
    }
  }

  hasDataMap.pricing = pricingConditions > 0;
  pricingData.score = pricingConditions > 0
    ? Math.round((pricingPoints / (pricingConditions * 40)) * 100)
    : 50;
  categories.pricing = pricingData.score;
  explanations.pricing = pricingData.explanation.trim();

  // ===== CASH FLOW (20% weight) =====
  const cashflowData = { score: 50, explanation: "" };
  let cfConditions = 0;
  let cfPoints = 0;

  const noi = getField(fields, "expenses.noi") ||
    getField(fields, "expenses.noi_om") ||
    getField(fields, "multifamily.t12_noi");
  const t12Revenue = getField(fields, "multifamily.t12_revenue") ||
    getField(fields, "expenses.gross_income") ||
    getField(fields, "expenses.effective_gross_income");
  const expenseRatio = getField(fields, "multifamily.expense_ratio") ||
    getField(fields, "expenses.expense_ratio");
  const economicOccupancy = getField(fields, "multifamily.economic_occupancy");

  if (noi !== null && noi !== undefined && askingPrice) {
    cfConditions++;
    const impliedCap = (noi / askingPrice) * 100;
    if (impliedCap >= 6) {
      cfPoints += 40;
      cashflowData.explanation += `NOI implies ${impliedCap.toFixed(1)}% yield (strong). `;
    } else if (impliedCap >= 4.5) {
      cfPoints += 30;
      cashflowData.explanation += `NOI implies ${impliedCap.toFixed(1)}% yield (market). `;
    } else {
      cfPoints += 15;
      cashflowData.explanation += `NOI implies ${impliedCap.toFixed(1)}% yield (thin). `;
    }
  }

  if (expenseRatio !== null && expenseRatio !== undefined) {
    cfConditions++;
    // Multifamily typical expense ratio 40-55%
    if (expenseRatio <= 40) {
      cfPoints += 40;
      cashflowData.explanation += `${expenseRatio.toFixed(0)}% expense ratio (efficient). `;
    } else if (expenseRatio <= 50) {
      cfPoints += 30;
      cashflowData.explanation += `${expenseRatio.toFixed(0)}% expense ratio (typical). `;
    } else if (expenseRatio <= 60) {
      cfPoints += 20;
      cashflowData.explanation += `${expenseRatio.toFixed(0)}% expense ratio (high). `;
    } else {
      cfPoints += 10;
      cashflowData.explanation += `${expenseRatio.toFixed(0)}% expense ratio (very high). `;
    }
  }

  if (economicOccupancy !== null && economicOccupancy !== undefined) {
    cfConditions++;
    if (economicOccupancy >= 95) {
      cfPoints += 35;
      cashflowData.explanation += `${economicOccupancy.toFixed(0)}% economic occupancy (strong). `;
    } else if (economicOccupancy >= 90) {
      cfPoints += 25;
      cashflowData.explanation += `${economicOccupancy.toFixed(0)}% economic occupancy (solid). `;
    } else {
      cfPoints += 10;
      cashflowData.explanation += `${economicOccupancy.toFixed(0)}% economic occupancy (soft). `;
    }
  }

  hasDataMap.cashflow = cfConditions > 0;
  cashflowData.score = cfConditions > 0
    ? Math.round((cfPoints / (cfConditions * 40)) * 100)
    : 50;
  categories.cashflow = cashflowData.score;
  explanations.cashflow = cashflowData.explanation.trim();

  // ===== UNIT QUALITY (15% weight) =====
  const unitData = { score: 50, explanation: "" };
  let unitConditions = 0;
  let unitPoints = 0;

  if (unitCount !== null && unitCount !== undefined) {
    unitConditions++;
    // 50-200 units institutional sweet spot
    if (unitCount >= 50 && unitCount <= 200) {
      unitPoints += 35;
      unitData.explanation += `${unitCount} units (institutional scale). `;
    } else if (unitCount >= 20) {
      unitPoints += 25;
      unitData.explanation += `${unitCount} units (mid-size). `;
    } else if (unitCount >= 200) {
      unitPoints += 30;
      unitData.explanation += `${unitCount} units (large community). `;
    } else {
      unitPoints += 15;
      unitData.explanation += `${unitCount} units (small). `;
    }
  }

  const avgRent = getField(fields, "multifamily.avg_rent_per_unit") ||
    getField(fields, "rent_roll.avg_rent");
  if (avgRent !== null && avgRent !== undefined) {
    unitConditions++;
    if (avgRent >= 1200 && avgRent <= 2000) {
      unitPoints += 35;
      unitData.explanation += `$${Math.round(avgRent)}/unit avg rent (strong demand). `;
    } else if (avgRent >= 800) {
      unitPoints += 25;
      unitData.explanation += `$${Math.round(avgRent)}/unit avg rent (workforce). `;
    } else if (avgRent > 2000) {
      unitPoints += 30;
      unitData.explanation += `$${Math.round(avgRent)}/unit avg rent (luxury). `;
    } else {
      unitPoints += 15;
      unitData.explanation += `$${Math.round(avgRent)}/unit avg rent (below market). `;
    }
  }

  const avgSf = getField(fields, "multifamily.avg_sf_per_unit");
  const unitMix = getField(fields, "multifamily.unit_mix");
  const amenities = getField(fields, "multifamily.amenities");
  const inUnitWD = getField(fields, "multifamily.in_unit_washer_dryer");

  if (avgSf !== null && avgSf !== undefined) {
    unitConditions++;
    if (avgSf >= 700 && avgSf <= 1100) {
      unitPoints += 30;
      unitData.explanation += `${Math.round(avgSf)} SF avg (market standard). `;
    } else if (avgSf > 1100) {
      unitPoints += 25;
      unitData.explanation += `${Math.round(avgSf)} SF avg (spacious). `;
    } else {
      unitPoints += 15;
      unitData.explanation += `${Math.round(avgSf)} SF avg (compact). `;
    }
  }

  if (amenities) {
    unitConditions++;
    unitPoints += 25;
    unitData.explanation += "Amenities present. ";
  }

  if (inUnitWD) {
    unitConditions++;
    const wdStr = String(inUnitWD).toLowerCase();
    if (wdStr.includes("yes") || wdStr === "true") {
      unitPoints += 30;
      unitData.explanation += "In-unit W/D (premium). ";
    } else {
      unitPoints += 15;
      unitData.explanation += "No in-unit W/D. ";
    }
  }

  hasDataMap.unit_quality = unitConditions > 0;
  unitData.score = unitConditions > 0
    ? Math.round((unitPoints / (unitConditions * 35)) * 100)
    : 50;
  categories.unit_quality = unitData.score;
  explanations.unit_quality = unitData.explanation.trim();

  // ===== OCCUPANCY & DEMAND (15% weight) =====
  const occData = { score: 50, explanation: "" };
  let occConditions = 0;
  let occPoints = 0;

  const occupancy = getField(fields, "property_basics.occupancy_pct") ||
    getField(fields, "property_basics.occupancy") ||
    getField(fields, "multifamily.vacancy_rate");
  const rentGrowth = getField(fields, "multifamily.rent_growth_trailing");
  const marketRentComp = getField(fields, "multifamily.market_rent_comparison");

  if (occupancy !== null && occupancy !== undefined) {
    occConditions++;
    // May be vacancy_rate (inverse) or occupancy_pct
    let occ = occupancy;
    if (occ <= 20) occ = 100 - occ; // Treat as vacancy rate if very low
    if (occ >= 95) {
      occPoints += 40;
      occData.explanation += `${occ.toFixed(0)}% occupied (strong demand). `;
    } else if (occ >= 90) {
      occPoints += 30;
      occData.explanation += `${occ.toFixed(0)}% occupied (solid). `;
    } else if (occ >= 85) {
      occPoints += 20;
      occData.explanation += `${occ.toFixed(0)}% occupied (softening). `;
    } else {
      occPoints += 10;
      occData.explanation += `${occ.toFixed(0)}% occupied (weak). `;
    }
  }

  if (rentGrowth !== null && rentGrowth !== undefined) {
    occConditions++;
    if (rentGrowth >= 5) {
      occPoints += 40;
      occData.explanation += `${rentGrowth.toFixed(1)}% rent growth (strong). `;
    } else if (rentGrowth >= 2) {
      occPoints += 30;
      occData.explanation += `${rentGrowth.toFixed(1)}% rent growth (healthy). `;
    } else if (rentGrowth >= 0) {
      occPoints += 15;
      occData.explanation += `${rentGrowth.toFixed(1)}% rent growth (flat). `;
    } else {
      occPoints += 5;
      occData.explanation += `${rentGrowth.toFixed(1)}% rent growth (declining). `;
    }
  }

  if (marketRentComp) {
    occConditions++;
    const compStr = String(marketRentComp).toLowerCase();
    if (compStr.includes("below") || compStr.includes("under")) {
      occPoints += 40;
      occData.explanation += "Below market rents (upside). ";
    } else if (compStr.includes("at") || compStr.includes("market")) {
      occPoints += 25;
      occData.explanation += "At market rents. ";
    } else if (compStr.includes("above") || compStr.includes("over")) {
      occPoints += 10;
      occData.explanation += "Above market rents (risk). ";
    } else {
      occPoints += 20;
      occData.explanation += `Market comparison: ${marketRentComp}. `;
    }
  }

  hasDataMap.occupancy_demand = occConditions > 0;
  occData.score = occConditions > 0
    ? Math.round((occPoints / (occConditions * 40)) * 100)
    : 50;
  categories.occupancy_demand = occData.score;
  explanations.occupancy_demand = occData.explanation.trim();

  // ===== BUILDING QUALITY (15% weight) =====
  const bldgData = { score: 50, explanation: "" };
  let bldgConditions = 0;
  let bldgPoints = 0;

  const yearBuilt = getField(fields, "property_basics.year_built") ||
    getField(fields, "multifamily.year_built");
  const yearRenovated = getField(fields, "property_basics.year_renovated") ||
    getField(fields, "multifamily.year_renovated");
  const constructionType = getField(fields, "multifamily.construction_type");
  const buildingSf = getField(fields, "property_basics.building_sf") ||
    getField(fields, "multifamily.total_building_sf");
  const valueAddSignal = getField(fields, "multifamily.value_add_signal");
  const stories = getField(fields, "multifamily.stories") ||
    getField(fields, "property_basics.stories");

  if (yearBuilt !== null && yearBuilt !== undefined) {
    bldgConditions++;
    const effectiveYear = yearRenovated && yearRenovated > yearBuilt ? yearRenovated : yearBuilt;
    const age = 2026 - effectiveYear;
    if (age <= 10) {
      bldgPoints += 40;
      bldgData.explanation += `Built/renovated ${effectiveYear} (newer). `;
    } else if (age <= 25) {
      bldgPoints += 30;
      bldgData.explanation += `Built/renovated ${effectiveYear} (good condition expected). `;
    } else if (age <= 40) {
      bldgPoints += 20;
      bldgData.explanation += `Built ${yearBuilt}${yearRenovated ? `, renovated ${yearRenovated}` : ""} (aging). `;
    } else {
      bldgPoints += 10;
      bldgData.explanation += `Built ${yearBuilt} (significant age). `;
    }
  }

  if (constructionType) {
    bldgConditions++;
    const ctStr = String(constructionType).toLowerCase();
    if (ctStr.includes("concrete") || ctStr.includes("steel")) {
      bldgPoints += 35;
      bldgData.explanation += `${constructionType} construction (durable). `;
    } else if (ctStr.includes("wood") || ctStr.includes("frame")) {
      bldgPoints += 20;
      bldgData.explanation += `${constructionType} construction (standard). `;
    } else {
      bldgPoints += 25;
      bldgData.explanation += `${constructionType} construction. `;
    }
  }

  if (valueAddSignal) {
    bldgConditions++;
    const vaStr = String(valueAddSignal).toLowerCase();
    if (vaStr.includes("yes") || vaStr.includes("significant") || vaStr.includes("strong")) {
      bldgPoints += 40;
      bldgData.explanation += "Value-add opportunity identified. ";
    } else if (vaStr.includes("moderate") || vaStr.includes("some")) {
      bldgPoints += 25;
      bldgData.explanation += "Moderate value-add potential. ";
    } else {
      bldgPoints += 15;
      bldgData.explanation += "Limited value-add signal. ";
    }
  }

  hasDataMap.building_quality = bldgConditions > 0;
  bldgData.score = bldgConditions > 0
    ? Math.round((bldgPoints / (bldgConditions * 40)) * 100)
    : 50;
  categories.building_quality = bldgData.score;
  explanations.building_quality = bldgData.explanation.trim();

  // ===== LOCATION (10% weight) =====
  const locData = { score: 50, explanation: "" };
  let locConditions = 0;
  let locPoints = 0;

  const locationProfile = getField(fields, "property_basics.location_profile") ||
    getField(fields, "property_basics.submarket");
  const studentHousing = getField(fields, "multifamily.student_housing_flag");
  const seniorHousing = getField(fields, "multifamily.senior_housing_flag");
  const section8 = getField(fields, "multifamily.section_8_flag");

  if (locationProfile) {
    locConditions++;
    const locStr = String(locationProfile).toLowerCase();
    if (locStr.includes("urban") || locStr.includes("downtown") || locStr.includes("core")) {
      locPoints += 35;
      locData.explanation += "Urban/core location (premium). ";
    } else if (locStr.includes("suburban") || locStr.includes("growth")) {
      locPoints += 30;
      locData.explanation += "Suburban/growth corridor. ";
    } else if (locStr.includes("rural")) {
      locPoints += 15;
      locData.explanation += "Rural location (limited demand). ";
    } else {
      locPoints += 25;
      locData.explanation += `Location: ${locationProfile}. `;
    }
  }

  // Niche flags - inform but don't penalize heavily
  if (studentHousing) {
    const sh = String(studentHousing).toLowerCase();
    if (sh.includes("yes") || sh === "true") {
      locConditions++;
      locPoints += 20;
      locData.explanation += "Student housing (niche demand). ";
    }
  }
  if (seniorHousing) {
    const sn = String(seniorHousing).toLowerCase();
    if (sn.includes("yes") || sn === "true") {
      locConditions++;
      locPoints += 25;
      locData.explanation += "Senior housing (stable demand). ";
    }
  }
  if (section8) {
    const s8 = String(section8).toLowerCase();
    if (s8.includes("yes") || s8 === "true") {
      locConditions++;
      locPoints += 25;
      locData.explanation += "Section 8 (guaranteed income stream). ";
    }
  }

  hasDataMap.location = locConditions > 0;
  locData.score = locConditions > 0
    ? Math.round((locPoints / (locConditions * 35)) * 100)
    : 50;
  categories.location = locData.score;
  explanations.location = locData.explanation.trim();

  // ===== DATA CONFIDENCE (5% weight) =====
  const requiredFieldsMF = [
    "pricing_deal_terms.asking_price",
    "pricing_deal_terms.cap_rate_actual",
    "multifamily.unit_count",
    "multifamily.avg_rent_per_unit",
    "property_basics.occupancy_pct",
    "multifamily.t12_noi",
    "multifamily.expense_ratio",
    "multifamily.year_built",
    "multifamily.unit_mix",
    "multifamily.value_add_signal",
  ];
  const confScore = scoreDataConfidence(fields, requiredFieldsMF);
  categories.data_confidence = confScore;
  explanations.data_confidence = `${confScore}/100 based on ${totalFields} extracted fields.`;

  // Calculate weighted total
  const weights = {
    pricing: 20,
    cashflow: 20,
    unit_quality: 15,
    occupancy_demand: 15,
    building_quality: 15,
    location: 10,
    data_confidence: 5,
  };

  const normalizedWeights = normalizeWeights(weights, hasDataMap);
  const totalScore = calculateWeightedTotal(categories, normalizedWeights);
  const scoreBand = getScoreBand(totalScore);
  const recommendation = getRecommendation(scoreBand, totalScore, "multifamily");

  const categoryList: ScoringCategory[] = [
    { name: "Pricing", weight: weights.pricing, score: categories.pricing, explanation: explanations.pricing },
    { name: "Cash Flow", weight: weights.cashflow, score: categories.cashflow, explanation: explanations.cashflow },
    { name: "Unit Quality", weight: weights.unit_quality, score: categories.unit_quality, explanation: explanations.unit_quality },
    { name: "Occupancy & Demand", weight: weights.occupancy_demand, score: categories.occupancy_demand, explanation: explanations.occupancy_demand },
    { name: "Building Quality", weight: weights.building_quality, score: categories.building_quality, explanation: explanations.building_quality },
    { name: "Location", weight: weights.location, score: categories.location, explanation: explanations.location },
    { name: "Data Confidence", weight: weights.data_confidence, score: categories.data_confidence, explanation: explanations.data_confidence },
  ];

  return {
    totalScore,
    scoreBand,
    recommendation,
    categories: categoryList,
    analysisType: "multifamily",
    modelVersion: "1.0",
  };
}

// ==============================================================================
// DISPATCH FUNCTION
// ==============================================================================

/**
 * Route scoring requests to appropriate model based on analysis type
 */
export function scoreByType(
  analysisType: AnalysisType,
  fields: Record<string, any>
): ScoringResult {
  switch (analysisType) {
    case "industrial":
      return scoreIndustrial(fields);
    case "office":
      return scoreOffice(fields);
    case "land":
      return scoreLand(fields);
    case "multifamily":
      return scoreMultifamily(fields);
    case "retail":
      return scoreRetailPure(fields);
    default:
      throw new Error(`Unknown analysis type: ${analysisType}`);
  }
}

// ==============================================================================
// RETAIL SCORING - Pure function (shared by Pro score-engine and Try Me score-lite)
// Lifted from /lib/workspace/score-engine.ts so Pro + Try Me always produce
// identical retail scores. Operates on a { "group.name": { value, confidence } }
// field map plus an optional field-count hint for confidence scoring.
// ==============================================================================

const RETAIL_WEIGHTS = {
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

function retailScoreBand(score: number): string {
  if (score >= 85) return "strong_buy";
  if (score >= 70) return "buy";
  if (score >= 50) return "hold";
  if (score >= 30) return "pass";
  return "strong_reject";
}

function retailRecommendation(band: string, score: number, fields: Record<string, any>): string {
  const first = (...keys: string[]) => {
    for (const k of keys) {
      const f = fields[k];
      const v = f && typeof f === "object" && "value" in f ? f.value : f;
      if (v !== undefined && v !== null) return Number(v);
    }
    return undefined;
  };
  const capRate = first("pricing_deal_terms.cap_rate_actual", "pricing_deal_terms.cap_rate_asking", "pricing_deal_terms.cap_rate_om", "pricing_deal_terms.entry_cap_rate");
  const occupancy = first("property_basics.occupancy_pct", "property_basics.occupancy");
  const dscr = first("debt_assumptions.dscr", "debt_assumptions.dscr_om", "debt_assumptions.dscr_adjusted");
  const noi = first("expenses.noi", "expenses.noi_om", "expenses.noi_adjusted", "expenses.net_operating_income");
  const wale = first("rent_roll.weighted_avg_lease_term", "property_basics.wale_years", "rent_roll.wale", "lease_data.wale_years");
  const price = first("pricing_deal_terms.asking_price", "pricing_deal_terms.purchase_price", "pricing_deal_terms.list_price");

  const strengths: string[] = [];
  const concerns: string[] = [];
  if (capRate !== undefined) {
    if (capRate >= 8) strengths.push(`strong ${capRate.toFixed(1)}% cap rate`);
    else if (capRate >= 7) strengths.push(`solid ${capRate.toFixed(1)}% cap rate`);
    else if (capRate < 6) concerns.push(`thin ${capRate.toFixed(1)}% cap rate`);
  }
  if (occupancy !== undefined) {
    if (occupancy >= 95) strengths.push(`${occupancy.toFixed(0)}% occupied`);
    else if (occupancy < 80) concerns.push(`${occupancy.toFixed(0)}% occupancy`);
  }
  if (dscr !== undefined) {
    if (dscr >= 1.35) strengths.push(`${dscr.toFixed(2)}x DSCR`);
    else if (dscr < 1.2) concerns.push(`tight ${dscr.toFixed(2)}x DSCR`);
  }
  if (wale !== undefined) {
    if (wale >= 7) strengths.push(`${wale.toFixed(1)}-year WALE`);
    else if (wale < 3) concerns.push(`short ${wale.toFixed(1)}-year WALE`);
  }
  if (noi && price && noi > 0 && price > 0) {
    const dy = (noi / (price * 0.65)) * 100;
    if (dy >= 12) strengths.push(`${dy.toFixed(1)}% debt yield`);
    else if (dy < 9) concerns.push(`${dy.toFixed(1)}% debt yield`);
  }

  const bandLabel: Record<string, string> = { strong_buy: "Strong Buy", buy: "Buy", hold: "Neutral", pass: "Pass", strong_reject: "Strong Reject" };
  const label = bandLabel[band] || band;
  const parts: string[] = [];
  if (strengths.length > 0) parts.push(strengths.join(", "));
  if (concerns.length > 0) parts.push((strengths.length > 0 ? "but " : "") + concerns.join(", "));

  if (parts.length === 0) {
    switch (band) {
      case "strong_buy": return `${label} (${score}) - Compelling fundamentals across pricing, cash flow, and tenancy.`;
      case "buy": return `${label} (${score}) - Sound fundamentals with manageable risk.`;
      case "hold": return `${label} (${score}) - Mixed signals. Further diligence recommended.`;
      case "pass": return `${label} (${score}) - Risk factors outweigh current pricing.`;
      case "strong_reject": return `${label} (${score}) - Does not meet investment criteria.`;
      default: return `${label} (${score})`;
    }
  }
  return `${label} (${score}) - ${parts.join("; ")}.`;
}

/**
 * Pure retail scoring - identical logic to Pro's runScoreEngine retail branch.
 * Operates on a field map of the form { "group.name": { value, confidence, confirmed } }.
 * This is the single source of truth for retail scores across Pro and Try Me.
 */
export function scoreRetailPure(fields: Record<string, any>): ScoringResult {
  const hasField = (key: string) => fields[key]?.value !== undefined && fields[key]?.value !== null;
  const getVal = (key: string) => fields[key]?.value;
  const getFirst = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = getVal(k);
      if (v !== undefined && v !== null) {
        const n = Number(v);
        if (!isNaN(n)) return n;
      }
    }
    return undefined;
  };

  function scoreCategory(checks: { condition: boolean; points: number }[]): number {
    const maxPoints = checks.reduce((s, c) => s + c.points, 0);
    const earned = checks.filter(c => c.condition).reduce((s, c) => s + c.points, 0);
    return maxPoints > 0 ? Math.round((earned / maxPoints) * 100) : 50;
  }

  const capRate = getFirst(
    "pricing_deal_terms.cap_rate_actual",
    "pricing_deal_terms.cap_rate_asking",
    "pricing_deal_terms.cap_rate_om",
    "pricing_deal_terms.entry_cap_rate",
  );
  const occupancy = getFirst("property_basics.occupancy_pct", "property_basics.occupancy");
  const noi = getFirst("expenses.noi", "expenses.noi_om", "expenses.noi_adjusted", "expenses.net_operating_income");
  const price = getFirst("pricing_deal_terms.asking_price", "pricing_deal_terms.purchase_price", "pricing_deal_terms.list_price");
  const priceSf = getFirst("pricing_deal_terms.price_per_sf", "pricing_deal_terms.price_psf");
  const leaseTerms = getFirst("rent_roll.weighted_avg_lease_term", "property_basics.wale_years", "rent_roll.wale", "lease_data.wale_years");
  const dscr = getFirst("debt_assumptions.dscr", "debt_assumptions.dscr_om", "debt_assumptions.dscr_adjusted");
  const tenantCredit = getVal("tenant_info.tenant_credit_rating");
  const buildingSf = getFirst("property_basics.building_sf", "property_basics.gla", "property_basics.gla_sf");
  const yearBuilt = getFirst("property_basics.year_built");
  const baseRent = getFirst("income.base_rent", "income.total_rent", "rent_roll.total_rent");

  let debtYield: number | undefined;
  if (noi && price && noi > 0 && price > 0) {
    debtYield = (noi / (price * 0.65)) * 100;
  }

  // 1. PRICING (15)
  const pricingScore = scoreCategory([
    { condition: capRate !== undefined && capRate >= 8, points: 30 },
    { condition: capRate !== undefined && capRate >= 6.5, points: 25 },
    { condition: capRate !== undefined && capRate >= 5, points: 10 },
    { condition: price !== undefined && price > 0, points: 10 },
    { condition: priceSf !== undefined && priceSf > 0, points: 10 },
    { condition: priceSf !== undefined && priceSf < 150, points: 15 },
  ]);

  // 2. CASHFLOW (15)
  const cashflowScore = scoreCategory([
    { condition: noi !== undefined && noi > 0, points: 25 },
    { condition: dscr !== undefined && dscr >= 1.50, points: 25 },
    { condition: dscr !== undefined && dscr >= 1.25, points: 15 },
    { condition: debtYield !== undefined && debtYield >= 10, points: 15 },
    { condition: hasField("income.effective_gross_income") || hasField("income.total_income") || baseRent !== undefined, points: 10 },
    { condition: hasField("expenses.total_expenses") || hasField("expenses.operating_expenses"), points: 10 },
  ]);

  // 3. VALUE-ADD (10)
  const vaScore = getFirst("value_add.score");
  const rentGapPct = getFirst("value_add.rent_gap_pct");
  const vacancyUpsideNoi = getFirst("value_add.vacancy_upside_noi");
  const physicalNeeded = getVal("value_add.physical_update_needed");
  const nearTermExps = getFirst("value_add.near_term_expirations");
  const expenseRatio = getFirst("value_add.expense_ratio");
  const expenseBenchmark = getFirst("value_add.expense_ratio_benchmark");

  const upsideScore = (() => {
    if (vaScore !== undefined && vaScore >= 0) {
      return Math.min(100, Math.round(vaScore * 10));
    }
    return scoreCategory([
      { condition: rentGapPct !== undefined && rentGapPct > 15, points: 30 },
      { condition: rentGapPct !== undefined && rentGapPct > 5, points: 15 },
      { condition: occupancy !== undefined && occupancy < 92, points: 20 },
      { condition: vacancyUpsideNoi !== undefined && vacancyUpsideNoi > 0, points: 10 },
      { condition: nearTermExps !== undefined && nearTermExps >= 2, points: 15 },
      { condition: physicalNeeded === true || physicalNeeded === "true", points: 10 },
      { condition: expenseRatio !== undefined && expenseBenchmark !== undefined && expenseRatio > expenseBenchmark, points: 15 },
    ]);
  })();

  // 4. TENANT (12)
  const hasTenantInfo = hasField("tenant_info.primary_tenant") || hasField("tenant_info.tenant_name") || hasField("tenant_info.tenant_1_name");
  const hasLeaseType = hasField("lease_data.lease_type") || hasField("lease_data.lease_structure") || hasField("tenant_info.lease_type");
  const creditStr = String(tenantCredit || "").toLowerCase();
  const hasInvestmentGradeCredit = creditStr.includes("investment") || creditStr.includes("grade") || ["a", "aa", "aaa", "a+", "a-", "bbb", "bbb+"].includes(creditStr);
  const tenantScore = scoreCategory([
    { condition: hasTenantInfo, points: 25 },
    { condition: hasInvestmentGradeCredit, points: 25 },
    { condition: hasLeaseType, points: 15 },
    { condition: hasField("tenant_info.guarantor") || hasField("tenant_info.parent_company"), points: 15 },
    { condition: occupancy !== undefined && occupancy >= 95, points: 20 },
  ]);

  // 5. ROLLOVER (10)
  const rolloverScore = scoreCategory([
    { condition: leaseTerms !== undefined && leaseTerms >= 7, points: 40 },
    { condition: leaseTerms !== undefined && leaseTerms >= 4, points: 20 },
    { condition: leaseTerms !== undefined && leaseTerms >= 2, points: 10 },
    { condition: hasField("lease_data.options_to_renew") || hasField("lease_data.renewal_options"), points: 15 },
    { condition: hasField("lease_data.lease_expiration") || hasField("rent_roll.earliest_expiration"), points: 15 },
  ]);

  // 6. VACANCY (8)
  const vacancyScore = scoreCategory([
    { condition: occupancy !== undefined && occupancy >= 95, points: 50 },
    { condition: occupancy !== undefined && occupancy >= 85, points: 30 },
    { condition: occupancy !== undefined && occupancy > 0, points: 20 },
  ]);

  // 7. LOCATION (10)
  const hasTraffic = hasField("property_basics.traffic_count") || hasField("property_basics.traffic");
  const locationScore = scoreCategory([
    { condition: hasField("property_basics.city"), points: 20 },
    { condition: hasField("property_basics.state"), points: 20 },
    { condition: hasField("property_basics.zip") || hasField("property_basics.zip_code"), points: 20 },
    { condition: hasTraffic, points: 20 },
    { condition: hasField("property_basics.county") || hasField("property_basics.msa"), points: 20 },
  ]);

  // 8. PHYSICAL (8)
  const physicalScore = scoreCategory([
    { condition: yearBuilt !== undefined, points: 20 },
    { condition: yearBuilt !== undefined && yearBuilt >= 2000, points: 15 },
    { condition: buildingSf !== undefined && buildingSf > 0, points: 20 },
    { condition: hasField("property_basics.parking_count") || hasField("property_basics.parking_ratio"), points: 15 },
    { condition: hasField("property_basics.year_renovated") || hasField("property_basics.renovated"), points: 15 },
    { condition: hasField("property_basics.lot_size") || hasField("property_basics.land_acres"), points: 15 },
  ]);

  // 9. REDEVELOPMENT (5)
  const redevelopmentScore = scoreCategory([
    { condition: hasField("property_basics.land_acres") || hasField("property_basics.lot_size"), points: 50 },
    { condition: hasField("property_basics.zoning") || hasField("property_basics.zoning_code"), points: 50 },
  ]);

  // 10. CONFIDENCE (7)
  const allFieldEntries = Object.values(fields);
  const totalFields = allFieldEntries.length;
  const confirmedFields = allFieldEntries.filter((f: any) => f?.confirmed).length;
  const highConfFields = allFieldEntries.filter((f: any) => (f?.confidence || 0) >= 0.7).length;
  const medConfFields = allFieldEntries.filter((f: any) => {
    const conf = f?.confidence || 0;
    return conf >= 0.4 && conf < 0.7;
  }).length;

  let confidenceScore: number;
  if (totalFields === 0) {
    confidenceScore = 20;
  } else {
    const effectiveGood = confirmedFields + highConfFields + (medConfFields * 0.6);
    const ratio = effectiveGood / totalFields;
    confidenceScore = Math.max(40, Math.min(100, Math.round(ratio * 100)));
  }

  const totalScore = Math.round(
    (pricingScore * RETAIL_WEIGHTS.pricing +
      cashflowScore * RETAIL_WEIGHTS.cashflow +
      upsideScore * RETAIL_WEIGHTS.upside +
      tenantScore * RETAIL_WEIGHTS.tenant +
      rolloverScore * RETAIL_WEIGHTS.rollover +
      vacancyScore * RETAIL_WEIGHTS.vacancy +
      locationScore * RETAIL_WEIGHTS.location +
      physicalScore * RETAIL_WEIGHTS.physical +
      redevelopmentScore * RETAIL_WEIGHTS.redevelopment +
      confidenceScore * RETAIL_WEIGHTS.confidence) / 100,
  );

  const scoreBand = retailScoreBand(totalScore);
  const recommendation = retailRecommendation(scoreBand, totalScore, fields);

  return {
    totalScore,
    scoreBand,
    recommendation,
    categories: [
      { name: "pricing", weight: RETAIL_WEIGHTS.pricing, score: pricingScore, explanation: capRate ? `Cap rate ${capRate.toFixed(1)}%${priceSf ? `, $${Math.round(priceSf)}/SF` : ""}` : "Limited pricing data" },
      { name: "cashflow", weight: RETAIL_WEIGHTS.cashflow, score: cashflowScore, explanation: dscr !== undefined ? `DSCR ${dscr.toFixed(2)}x` : (noi ? `NOI $${Math.round(noi).toLocaleString()}` : "Limited cashflow data") },
      { name: "upside", weight: RETAIL_WEIGHTS.upside, score: upsideScore, explanation: vaScore !== undefined ? `Value-add score ${vaScore}` : "Market rent growth potential assessed" },
      { name: "tenant", weight: RETAIL_WEIGHTS.tenant, score: tenantScore, explanation: hasTenantInfo ? "Tenant data captured" : "Tenant data limited" },
      { name: "rollover", weight: RETAIL_WEIGHTS.rollover, score: rolloverScore, explanation: leaseTerms !== undefined ? `${leaseTerms.toFixed(1)}-year WALE` : "Rollover data limited" },
      { name: "vacancy", weight: RETAIL_WEIGHTS.vacancy, score: vacancyScore, explanation: occupancy !== undefined ? `${occupancy.toFixed(0)}% occupied` : "Occupancy data limited" },
      { name: "location", weight: RETAIL_WEIGHTS.location, score: locationScore, explanation: "Location data captured at market level" },
      { name: "physical", weight: RETAIL_WEIGHTS.physical, score: physicalScore, explanation: yearBuilt ? `Built ${yearBuilt}` : "Building age unknown" },
      { name: "redevelopment", weight: RETAIL_WEIGHTS.redevelopment, score: redevelopmentScore, explanation: "Redevelopment potential assessed" },
      { name: "confidence", weight: RETAIL_WEIGHTS.confidence, score: confidenceScore, explanation: `${totalFields} data points extracted` },
    ],
    analysisType: "retail" as AnalysisType,
    modelVersion: "1.1",
  };
}
