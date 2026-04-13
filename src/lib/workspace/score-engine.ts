import { getAdminDb } from "@/lib/firebase-admin";
import { scoreByType, type ScoringResult } from "@/lib/workspace/scoring-models";

// Default scoring weights (out of 100 total)
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

function getScoreBand(score: number): string {
  if (score >= 85) return "strong_buy";
  if (score >= 70) return "buy";
  if (score >= 50) return "hold";
  if (score >= 30) return "pass";
  return "strong_reject";
}

function getRecommendation(band: string, score: number, fields: Record<string, any>): string {
  // Helper to get first available value from multiple field keys
  const first = (...keys: string[]) => {
    for (const k of keys) { if (fields[k]?.value !== undefined && fields[k]?.value !== null) return fields[k].value; }
    return undefined;
  };
  const capRate = first("pricing_deal_terms.cap_rate_actual", "pricing_deal_terms.cap_rate_asking", "pricing_deal_terms.cap_rate_om", "pricing_deal_terms.entry_cap_rate");
  const occupancy = first("property_basics.occupancy_pct", "property_basics.occupancy");
  const dscr = first("debt_assumptions.dscr", "debt_assumptions.dscr_om", "debt_assumptions.dscr_adjusted");
  const noi = first("expenses.noi", "expenses.noi_om", "expenses.noi_adjusted", "expenses.net_operating_income");
  const wale = first("rent_roll.weighted_avg_lease_term", "property_basics.wale_years", "rent_roll.wale", "lease_data.wale_years");
  const price = first("pricing_deal_terms.asking_price", "pricing_deal_terms.purchase_price", "pricing_deal_terms.list_price");
  const priceSf = first("pricing_deal_terms.price_per_sf", "pricing_deal_terms.price_psf");

  // Build specific strengths and concerns
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
  if (wale) {
    if (wale >= 7) strengths.push(`${Number(wale).toFixed(1)}-year WALE`);
    else if (wale < 3) concerns.push(`short ${Number(wale).toFixed(1)}-year WALE`);
  }
  if (noi && price) {
    const noiNum = Number(noi);
    const priceNum = Number(price);
    if (noiNum > 0 && priceNum > 0) {
      const debtYield = (noiNum / (priceNum * 0.65)) * 100;
      if (debtYield >= 12) strengths.push(`${debtYield.toFixed(1)}% debt yield`);
      else if (debtYield < 9) concerns.push(`${debtYield.toFixed(1)}% debt yield`);
    }
  }

  const bandLabel: Record<string, string> = {
    strong_buy: "Strong Buy",
    buy: "Buy",
    hold: "Neutral",
    pass: "Pass",
    strong_reject: "Strong Reject",
  };

  const label = bandLabel[band] || band;
  let parts: string[] = [];

  if (strengths.length > 0) parts.push(strengths.join(", "));
  if (concerns.length > 0) parts.push((strengths.length > 0 ? "but " : "") + concerns.join(", "));

  if (parts.length === 0) {
    // Fallback if we couldn't extract specific metrics
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

export async function runScoreEngine(params: {
  propertyId?: string;
  projectId?: string;
  userId: string;
  analysisType?: string;
  overrides?: Record<string, any>;
}): Promise<{
  success: boolean;
  scoreId?: string;
  totalScore: number;
  scoreBand: string;
  recommendation: string;
  analysisType: string;
  categories: Record<string, number>;
  error?: string;
}> {
  try {
    const { userId, overrides, analysisType: requestedType } = params;
    const propertyId = params.propertyId && typeof params.propertyId === "string" && params.propertyId.trim() ? params.propertyId.trim() : undefined;
    const projectId = (params.projectId && typeof params.projectId === "string" && params.projectId.trim()) ? params.projectId.trim() : "workspace-default";

    if (!userId) {
      return {
        success: false,
        error: "Missing required fields",
        totalScore: 0,
        scoreBand: "unknown",
        recommendation: "Error: missing userId",
        analysisType: "unknown",
        categories: {},
      };
    }
    if (projectId === "workspace-default" && !propertyId) {
      return {
        success: false,
        error: "Must provide projectId or propertyId",
        totalScore: 0,
        scoreBand: "unknown",
        recommendation: "Error: must provide projectId or propertyId",
        analysisType: "unknown",
        categories: {},
      };
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    // Get extracted fields - prefer propertyId query (more specific), fall back to projectId
    let fieldsSnap;
    if (propertyId) {
      fieldsSnap = await db.collection("workspace_extracted_fields")
        .where("propertyId", "==", propertyId)
        .get();
    }
    if (!fieldsSnap || fieldsSnap.empty) {
      fieldsSnap = await db.collection("workspace_extracted_fields")
        .where("projectId", "==", projectId || "workspace-default")
        .get();
      // If we have a propertyId, filter to only that property's fields
      if (propertyId && fieldsSnap && !fieldsSnap.empty) {
        const filtered = fieldsSnap.docs.filter(d => d.data().propertyId === propertyId);
        if (filtered.length > 0) {
          fieldsSnap = { docs: filtered, empty: false } as any;
        }
      }
    }

    const fields: Record<string, any> = {};
    fieldsSnap.docs.forEach((d: any) => {
      const data = d.data();
      const val = data.isUserOverridden ? data.userOverrideValue : data.normalizedValue;
      fields[`${data.fieldGroup}.${data.fieldName}`] = {
        value: val,
        confidence: data.confidenceScore || 0.5,
        confirmed: data.isUserConfirmed,
      };
    });

    // Determine analysis type: from request, property record, or default to retail
    let analysisType = requestedType || "retail";
    if (!requestedType && propertyId) {
      // Try to get from property record by propertyId
      const propDoc = await db.collection("workspace_properties").doc(propertyId).get();
      if (propDoc.exists) {
        const propData = propDoc.data();
        if (propData?.analysisType) analysisType = propData.analysisType;
      }
    } else if (!requestedType && projectId) {
      // Legacy: try to get from property record by projectId
      const propSnap = await db.collection("workspace_properties")
        .where("projectId", "==", projectId)
        .limit(1)
        .get();
      if (!propSnap.empty) {
        const propData = propSnap.docs[0].data();
        if (propData.analysisType) analysisType = propData.analysisType;
      }
    }

    // For non-retail types, use the new scoring models
    if (analysisType !== "retail") {
      // Build flat field map for new scoring models
      const flatFields: Record<string, any> = {};
      fieldsSnap.docs.forEach((d: any) => {
        const data = d.data();
        const val = data.isUserOverridden ? data.userOverrideValue : data.normalizedValue;
        flatFields[data.fieldName] = val;
        flatFields[`${data.fieldGroup}.${data.fieldName}`] = val;
      });

      const result: ScoringResult = scoreByType(analysisType as any, flatFields);

      // Mark old scores as not current
      const oldScores = await db.collection("workspace_scores")
        .where("projectId", "==", projectId)
        .where("isCurrent", "==", true)
        .get();
      const batch = db.batch();
      oldScores.docs.forEach(d => batch.update(d.ref, { isCurrent: false }));

      // Build category scores map
      const categoryScores: Record<string, number> = {};
      const categoryWeights: Record<string, number> = {};
      result.categories.forEach(c => {
        categoryScores[c.name] = c.score;
        categoryWeights[c.name] = c.weight;
      });

      // Save new score
      const scoreRef = db.collection("workspace_scores").doc();
      batch.set(scoreRef, {
        projectId,
        scoringModelVersion: result.modelVersion,
        analysisType,
        totalScore: result.totalScore,
        scoreBand: result.scoreBand,
        recommendation: result.recommendation,
        pricingScore: categoryScores["Pricing"] || 0,
        cashflowScore: categoryScores["Income Quality"] || categoryScores["Occupancy Stability"] || 0,
        upsideScore: 0,
        tenantScore: categoryScores["Tenant / Lease Quality"] || categoryScores["Tenant Mix"] || 0,
        rolloverRiskScore: categoryScores["Lease Rollover"] || 0,
        vacancyScore: 0,
        locationScore: categoryScores["Location"] || 0,
        physicalConditionScore: categoryScores["Physical Utility"] || categoryScores["Capital Exposure"] || 0,
        redevelopmentScore: categoryScores["Zoning / Entitlement Signal"] || 0,
        confidenceScore: categoryScores["Data Confidence"] || 0,
        functionalityScore: categoryScores["Functionality"] || 0,
        utilitiesScore: categoryScores["Utilities / Power Signal"] || 0,
        accessScore: categoryScores["Access / Frontage"] || 0,
        categoryScores,
        categoryWeights,
        createdAt: now,
        isCurrent: true,
      });

      await batch.commit();

      // Update property record with score - separate from batch so a missing doc doesn't kill scoring
      if (propertyId) {
        try {
          await db.collection("workspace_properties").doc(propertyId).set({
            scoreTotal: result.totalScore,
            scoreBand: result.scoreBand,
            recommendation: result.recommendation,
            updatedAt: now,
          }, { merge: true });
        } catch (e) { console.warn("[score-engine] Property update failed (non-retail):", e); }
      }

      // Update project record separately (legacy) - don't let this break the main flow
      if (projectId && projectId !== "workspace-default") {
        try {
          const projRef = db.collection("workspace_projects").doc(projectId);
          const projDoc = await projRef.get();
          if (projDoc.exists) {
            await projRef.update({
              scoreTotal: result.totalScore,
              scoreBand: result.scoreBand,
              recommendation: result.recommendation,
              updatedAt: now,
            });
          }
        } catch { /* project may not exist */ }
      }

      // Log activity
      try {
        await db.collection("workspace_activity_logs").add({
          projectId: propertyId || projectId,
          userId,
          activityType: "score_recalculated",
          entityType: "score",
          entityId: scoreRef.id,
          summary: `${analysisType} score: ${result.totalScore}/100 (${result.scoreBand.replace(/_/g, " ")})`,
          createdAt: now,
        });
      } catch { /* non-critical */ }

      return {
        success: true,
        scoreId: scoreRef.id,
        totalScore: result.totalScore,
        scoreBand: result.scoreBand,
        recommendation: result.recommendation,
        analysisType,
        categories: categoryScores,
      };
    }

    // ===== RETAIL SCORING v2 =====
    // Fixes: missing _om field fallbacks, inverted upside logic,
    // rigid tenant checks, low confidence baseline

    // Helper: check multiple field name variants (fields are stored with
    // different suffixes depending on extraction - _om, _actual, _asking)
    const hasField = (key: string) => fields[key]?.value !== undefined && fields[key]?.value !== null;
    const getVal = (key: string) => fields[key]?.value;
    const getFirst = (...keys: string[]) => {
      for (const k of keys) {
        const v = getVal(k);
        if (v !== undefined && v !== null) return Number(v);
      }
      return undefined;
    };

    function scoreCategory(checks: { condition: boolean; points: number }[]): number {
      const maxPoints = checks.reduce((s, c) => s + c.points, 0);
      const earned = checks.filter(c => c.condition).reduce((s, c) => s + c.points, 0);
      return maxPoints > 0 ? Math.round((earned / maxPoints) * 100) : 50;
    }

    // ── Extract core metrics with _om fallbacks ──
    const capRate = getFirst(
      "pricing_deal_terms.cap_rate_actual",
      "pricing_deal_terms.cap_rate_asking",
      "pricing_deal_terms.cap_rate_om",
      "pricing_deal_terms.entry_cap_rate",
    );
    const occupancy = getFirst(
      "property_basics.occupancy_pct",
      "property_basics.occupancy",
    );
    const noi = getFirst(
      "expenses.noi",
      "expenses.noi_om",
      "expenses.noi_adjusted",
      "expenses.net_operating_income",
    );
    const price = getFirst(
      "pricing_deal_terms.asking_price",
      "pricing_deal_terms.purchase_price",
      "pricing_deal_terms.list_price",
    );
    const priceSf = getFirst(
      "pricing_deal_terms.price_per_sf",
      "pricing_deal_terms.price_psf",
    );
    const leaseTerms = getFirst(
      "rent_roll.weighted_avg_lease_term",
      "property_basics.wale_years",
      "rent_roll.wale",
      "lease_data.wale_years",
    );
    const dscr = getFirst(
      "debt_assumptions.dscr",
      "debt_assumptions.dscr_om",
      "debt_assumptions.dscr_adjusted",
    );
    const tenantCredit = getVal("tenant_info.tenant_credit_rating");
    const buildingSf = getFirst("property_basics.building_sf", "property_basics.gla");
    const yearBuilt = getFirst("property_basics.year_built");
    const baseRent = getFirst("income.base_rent", "income.total_rent", "rent_roll.total_rent");

    // Compute debt yield if we have NOI and price
    let debtYield: number | undefined;
    if (noi && price && noi > 0 && price > 0) {
      debtYield = (noi / (price * 0.65)) * 100;
    }

    // ── 1. PRICING (weight: 15) ──
    // Evaluates cap rate quality, price basis, and value indicators
    const pricingScore = scoreCategory([
      { condition: capRate !== undefined && capRate >= 8, points: 30 },    // Strong cap
      { condition: capRate !== undefined && capRate >= 6.5, points: 25 },  // Solid cap
      { condition: capRate !== undefined && capRate >= 5, points: 10 },    // Acceptable cap
      { condition: price !== undefined && price > 0, points: 10 },
      { condition: priceSf !== undefined && priceSf > 0, points: 10 },
      { condition: priceSf !== undefined && priceSf < 150, points: 15 },  // Below replacement cost
    ]);

    // ── 2. CASHFLOW (weight: 15) ──
    // Evaluates income quality, DSCR, and debt metrics
    const cashflowScore = scoreCategory([
      { condition: noi !== undefined && noi > 0, points: 25 },
      { condition: dscr !== undefined && dscr >= 1.50, points: 25 },    // Strong coverage
      { condition: dscr !== undefined && dscr >= 1.25, points: 15 },    // Adequate coverage
      { condition: debtYield !== undefined && debtYield >= 10, points: 15 },  // Strong debt yield
      { condition: hasField("income.effective_gross_income") || hasField("income.total_income") || baseRent !== undefined, points: 10 },
      { condition: hasField("expenses.total_expenses") || hasField("expenses.operating_expenses"), points: 10 },
    ]);

    // ── 3. VALUE-ADD (weight: 10) ──
    // Uses concrete value-add signals computed by the parse engine:
    // rent gap, expense inefficiency, physical update, vacancy lease-up, lease rollover
    const vaScore = getFirst("value_add.score");
    const vaFlagsCount = getFirst("value_add.flags_count");
    const rentGapPct = getFirst("value_add.rent_gap_pct");
    const vacancyUpsideNoi = getFirst("value_add.vacancy_upside_noi");
    const physicalNeeded = getVal("value_add.physical_update_needed");
    const nearTermExps = getFirst("value_add.near_term_expirations");
    const expenseRatio = getFirst("value_add.expense_ratio");
    const expenseBenchmark = getFirst("value_add.expense_ratio_benchmark");

    const upsideScore = (() => {
      // If we have the parsed value-add score, use it directly (scaled 0-100)
      if (vaScore !== undefined && vaScore >= 0) {
        return Math.min(100, Math.round(vaScore * 10));
      }
      // Fallback: score from individual indicators
      return scoreCategory([
        { condition: rentGapPct !== undefined && rentGapPct > 15, points: 30 },   // Strong rent gap
        { condition: rentGapPct !== undefined && rentGapPct > 5, points: 15 },    // Moderate rent gap
        { condition: occupancy !== undefined && occupancy < 92, points: 20 },     // Vacancy lease-up
        { condition: vacancyUpsideNoi !== undefined && vacancyUpsideNoi > 0, points: 10 },
        { condition: nearTermExps !== undefined && nearTermExps >= 2, points: 15 }, // Lease rollover
        { condition: physicalNeeded === true || physicalNeeded === "true", points: 10 }, // Physical update
        { condition: expenseRatio !== undefined && expenseBenchmark !== undefined && expenseRatio > expenseBenchmark, points: 15 }, // Expense inefficiency
      ]);
    })();

    // ── 4. TENANT (weight: 12) ──
    // More flexible - checks for any tenant info, not just exact credit strings
    const hasTenantInfo = hasField("tenant_info.primary_tenant") ||
      hasField("tenant_info.tenant_name") ||
      hasField("tenant_info.tenant_1_name");
    const hasLeaseType = hasField("lease_data.lease_type") ||
      hasField("lease_data.lease_structure") ||
      hasField("tenant_info.lease_type");
    const creditStr = String(tenantCredit || "").toLowerCase();
    const hasInvestmentGradeCredit = creditStr.includes("investment") ||
      creditStr.includes("grade") || ["a", "aa", "aaa", "a+", "a-", "bbb", "bbb+"].includes(creditStr);

    const tenantScore = scoreCategory([
      { condition: hasTenantInfo, points: 25 },
      { condition: hasInvestmentGradeCredit, points: 25 },
      { condition: hasLeaseType, points: 15 },
      { condition: hasField("tenant_info.guarantor") || hasField("tenant_info.parent_company"), points: 15 },
      { condition: occupancy !== undefined && occupancy >= 95, points: 20 }, // Full occupancy = tenants are paying
    ]);

    // ── 5. ROLLOVER (weight: 10) ──
    const rolloverScore = scoreCategory([
      { condition: leaseTerms !== undefined && leaseTerms >= 7, points: 40 },
      { condition: leaseTerms !== undefined && leaseTerms >= 4, points: 20 },
      { condition: leaseTerms !== undefined && leaseTerms >= 2, points: 10 },
      { condition: hasField("lease_data.options_to_renew") || hasField("lease_data.renewal_options"), points: 15 },
      { condition: hasField("lease_data.lease_expiration") || hasField("rent_roll.earliest_expiration"), points: 15 },
    ]);

    // ── 6. VACANCY / OCCUPANCY (weight: 8) ──
    const vacancyScore = scoreCategory([
      { condition: occupancy !== undefined && occupancy >= 95, points: 50 },
      { condition: occupancy !== undefined && occupancy >= 85, points: 30 },
      { condition: occupancy !== undefined && occupancy > 0, points: 20 },
    ]);

    // ── 7. LOCATION (weight: 10) ──
    const hasTraffic = hasField("property_basics.traffic_count") || hasField("property_basics.traffic");
    const locationScore = scoreCategory([
      { condition: hasField("property_basics.city"), points: 20 },
      { condition: hasField("property_basics.state"), points: 20 },
      { condition: hasField("property_basics.zip") || hasField("property_basics.zip_code"), points: 20 },
      { condition: hasTraffic, points: 20 },
      { condition: hasField("property_basics.county") || hasField("property_basics.msa"), points: 20 },
    ]);

    // ── 8. PHYSICAL (weight: 8) ──
    const physicalScore = scoreCategory([
      { condition: yearBuilt !== undefined, points: 20 },
      { condition: yearBuilt !== undefined && yearBuilt >= 2000, points: 15 }, // Newer building
      { condition: buildingSf !== undefined && buildingSf > 0, points: 20 },
      { condition: hasField("property_basics.parking_count") || hasField("property_basics.parking_ratio"), points: 15 },
      { condition: hasField("property_basics.year_renovated") || hasField("property_basics.renovated"), points: 15 },
      { condition: hasField("property_basics.lot_size") || hasField("property_basics.land_acres"), points: 15 },
    ]);

    // ── 9. REDEVELOPMENT (weight: 5) ──
    const redevelopmentScore = scoreCategory([
      { condition: hasField("property_basics.land_acres") || hasField("property_basics.lot_size"), points: 50 },
      { condition: hasField("property_basics.zoning") || hasField("property_basics.zoning_code"), points: 50 },
    ]);

    // ── 10. CONFIDENCE (weight: 7) ──
    // Base confidence on field completeness and extraction quality
    // AI-extracted fields without user confirmation should still get reasonable credit
    const totalFields = fieldsSnap.docs.length;
    const confirmedFields = fieldsSnap.docs.filter((d: any) => d.data().isUserConfirmed).length;
    const highConfFields = fieldsSnap.docs.filter((d: any) => (d.data().confidenceScore || 0) >= 0.7).length;
    const medConfFields = fieldsSnap.docs.filter((d: any) => {
      const conf = d.data().confidenceScore || 0;
      return conf >= 0.4 && conf < 0.7;
    }).length;

    let confidenceScore: number;
    if (totalFields === 0) {
      confidenceScore = 20;
    } else {
      // High-confidence fields count full, medium count 60%, confirmed count full
      const effectiveGood = confirmedFields + highConfFields + (medConfFields * 0.6);
      const ratio = effectiveGood / totalFields;
      // Floor at 40 for any analyzed property (AI extracted = baseline trust)
      confidenceScore = Math.max(40, Math.min(100, Math.round(ratio * 100)));
    }

    // ── CALCULATE WEIGHTED TOTAL ──
    const totalScore = Math.round(
      (pricingScore * WEIGHTS.pricing +
       cashflowScore * WEIGHTS.cashflow +
       upsideScore * WEIGHTS.upside +
       tenantScore * WEIGHTS.tenant +
       rolloverScore * WEIGHTS.rollover +
       vacancyScore * WEIGHTS.vacancy +
       locationScore * WEIGHTS.location +
       physicalScore * WEIGHTS.physical +
       redevelopmentScore * WEIGHTS.redevelopment +
       confidenceScore * WEIGHTS.confidence) / 100
    );

    const scoreBand = getScoreBand(totalScore);
    const recommendation = getRecommendation(scoreBand, totalScore, fields);

    // Mark old scores as not current
    const oldScores = await db.collection("workspace_scores")
      .where("projectId", "==", projectId)
      .where("isCurrent", "==", true)
      .get();
    const batch = db.batch();
    oldScores.docs.forEach(d => batch.update(d.ref, { isCurrent: false }));

    // Save new score
    const scoreRef = db.collection("workspace_scores").doc();
    batch.set(scoreRef, {
      projectId,
      scoringModelVersion: "1.1",
      totalScore,
      scoreBand,
      recommendation,
      pricingScore,
      cashflowScore,
      upsideScore,
      valueAddScore: vaScore !== undefined ? vaScore : null,
      valueAddFlagsCount: vaFlagsCount !== undefined ? vaFlagsCount : 0,
      tenantScore,
      rolloverRiskScore: rolloverScore,
      vacancyScore,
      locationScore,
      physicalConditionScore: physicalScore,
      redevelopmentScore,
      confidenceScore,
      createdAt: now,
      isCurrent: true,
    });

    await batch.commit();

    // Update property record with score - separate from batch so a missing doc doesn't kill scoring
    if (propertyId) {
      try {
        const propScoreUpdate: Record<string, any> = {
          scoreTotal: totalScore,
          scoreBand,
          recommendation,
          updatedAt: now,
        };
        if (vaScore !== undefined) propScoreUpdate.valueAddScore = vaScore;
        if (vaFlagsCount !== undefined) propScoreUpdate.valueAddFlagsCount = vaFlagsCount;
        await db.collection("workspace_properties").doc(propertyId).set(propScoreUpdate, { merge: true });
      } catch (e) { console.warn("[score-engine] Property update failed (retail):", e); }
    }

    // Update project record separately (legacy) - don't let this break the main flow
    if (projectId && projectId !== "workspace-default") {
      try {
        const projRef = db.collection("workspace_projects").doc(projectId);
        const projDoc = await projRef.get();
        if (projDoc.exists) {
          await projRef.update({
            scoreTotal: totalScore,
            scoreBand,
            recommendation,
            updatedAt: now,
          });
        }
      } catch { /* project may not exist */ }
    }

    // Log activity
    try {
      await db.collection("workspace_activity_logs").add({
        projectId: propertyId || projectId,
        userId,
        activityType: "score_recalculated",
        entityType: "score",
        entityId: scoreRef.id,
        summary: `Score calculated: ${totalScore}/100 (${scoreBand.replace(/_/g, " ")})`,
        createdAt: now,
      });
    } catch { /* non-critical */ }

    return {
      success: true,
      scoreId: scoreRef.id,
      totalScore,
      scoreBand,
      recommendation,
      analysisType,
      categories: {
        pricing: pricingScore,
        cashflow: cashflowScore,
        upside: upsideScore,
        tenant: tenantScore,
        rollover: rolloverScore,
        vacancy: vacancyScore,
        location: locationScore,
        physical: physicalScore,
        redevelopment: redevelopmentScore,
        confidence: confidenceScore,
      },
    };
  } catch (error: any) {
    const errorMsg = error?.message || "Scoring failed";
    console.error("[score-engine] Error:", errorMsg, "| propertyId:", params?.propertyId, "| projectId:", params?.projectId, "| stack:", error?.stack?.slice(0, 300));
    return {
      success: false,
      error: errorMsg,
      totalScore: 0,
      scoreBand: "unknown",
      recommendation: `Error: ${errorMsg}`,
      analysisType: params?.analysisType || "unknown",
      categories: {},
    };
  }
}
