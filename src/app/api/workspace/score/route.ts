import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

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
  return "strong_pass";
}

function getRecommendation(band: string, score: number): string {
  switch (band) {
    case "strong_buy": return `Score ${score}/100 — Strong acquisition candidate. Pricing, cash flow, and tenant quality all indicate a compelling investment opportunity.`;
    case "buy": return `Score ${score}/100 — Solid opportunity worth pursuing. Fundamentals are sound with manageable risk factors.`;
    case "hold": return `Score ${score}/100 — Mixed signals. Further due diligence recommended before committing capital.`;
    case "pass": return `Score ${score}/100 — Significant risk factors identified. Pricing or fundamentals do not support acquisition at current terms.`;
    case "strong_pass": return `Score ${score}/100 — Does not meet investment criteria. Multiple red flags in pricing, tenancy, or property condition.`;
    default: return `Score ${score}/100.`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, userId, overrides } = await request.json();
    if (!projectId || !userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    // Get extracted fields for this project
    const fieldsSnap = await db.collection("workspace_extracted_fields")
      .where("projectId", "==", projectId)
      .get();

    const fields: Record<string, any> = {};
    fieldsSnap.docs.forEach(d => {
      const data = d.data();
      const val = data.isUserOverridden ? data.userOverrideValue : data.normalizedValue;
      fields[`${data.fieldGroup}.${data.fieldName}`] = {
        value: val,
        confidence: data.confidenceScore || 0.5,
        confirmed: data.isUserConfirmed,
      };
    });

    // Get underwriting outputs if available
    const uwSnap = await db.collection("workspace_underwriting_models")
      .where("projectId", "==", projectId)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    // Score each category (simplified scoring — can be made much more sophisticated)
    function scoreCategory(checks: { condition: boolean; points: number }[]): number {
      const maxPoints = checks.reduce((s, c) => s + c.points, 0);
      const earned = checks.filter(c => c.condition).reduce((s, c) => s + c.points, 0);
      return maxPoints > 0 ? Math.round((earned / maxPoints) * 100) : 50;
    }

    const hasField = (key: string) => fields[key]?.value !== undefined && fields[key]?.value !== null;
    const getVal = (key: string) => fields[key]?.value;

    const capRate = getVal("pricing_deal_terms.cap_rate_actual") || getVal("pricing_deal_terms.cap_rate_asking");
    const occupancy = getVal("property_basics.occupancy_pct");
    const noi = getVal("expenses.noi");
    const price = getVal("pricing_deal_terms.asking_price");
    const leaseTerms = getVal("rent_roll.weighted_avg_lease_term");
    const tenantCredit = getVal("tenant_info.tenant_credit_rating");

    const pricingScore = scoreCategory([
      { condition: capRate && capRate >= 6, points: 40 },
      { condition: capRate && capRate >= 5, points: 20 },
      { condition: price && price > 0, points: 20 },
      { condition: hasField("pricing_deal_terms.price_per_sf"), points: 20 },
    ]);

    const cashflowScore = scoreCategory([
      { condition: noi && noi > 0, points: 40 },
      { condition: hasField("income.effective_gross_income"), points: 20 },
      { condition: hasField("income.total_income"), points: 20 },
      { condition: hasField("expenses.total_expenses"), points: 20 },
    ]);

    const upsideScore = scoreCategory([
      { condition: occupancy && occupancy < 95, points: 30 },
      { condition: hasField("rent_roll.avg_rent_psf"), points: 30 },
      { condition: capRate && capRate >= 7, points: 40 },
    ]);

    const tenantScore = scoreCategory([
      { condition: hasField("tenant_info.primary_tenant"), points: 30 },
      { condition: tenantCredit && ["A", "AA", "AAA", "investment_grade"].includes(String(tenantCredit).toLowerCase()), points: 40 },
      { condition: hasField("tenant_info.guarantor"), points: 30 },
    ]);

    const rolloverScore = scoreCategory([
      { condition: leaseTerms && leaseTerms >= 7, points: 50 },
      { condition: leaseTerms && leaseTerms >= 3, points: 25 },
      { condition: hasField("lease_data.options_to_renew"), points: 25 },
    ]);

    const vacancyScore = scoreCategory([
      { condition: occupancy && occupancy >= 95, points: 50 },
      { condition: occupancy && occupancy >= 85, points: 30 },
      { condition: occupancy && occupancy > 0, points: 20 },
    ]);

    const locationScore = scoreCategory([
      { condition: hasField("property_basics.city"), points: 30 },
      { condition: hasField("property_basics.state"), points: 30 },
      { condition: hasField("property_basics.zip"), points: 40 },
    ]);

    const physicalScore = scoreCategory([
      { condition: hasField("property_basics.year_built"), points: 30 },
      { condition: hasField("property_basics.building_sf"), points: 30 },
      { condition: hasField("property_basics.parking_count"), points: 20 },
      { condition: hasField("property_basics.year_renovated"), points: 20 },
    ]);

    const redevelopmentScore = scoreCategory([
      { condition: hasField("property_basics.land_acres"), points: 50 },
      { condition: hasField("property_basics.zoning"), points: 50 },
    ]);

    // Data confidence based on number of confirmed fields
    const totalFields = fieldsSnap.docs.length;
    const confirmedFields = fieldsSnap.docs.filter(d => d.data().isUserConfirmed).length;
    const highConfFields = fieldsSnap.docs.filter(d => (d.data().confidenceScore || 0) >= 0.8).length;
    const confidenceScore = totalFields > 0
      ? Math.round(((confirmedFields + highConfFields) / (totalFields * 2)) * 100)
      : 20;

    // Calculate weighted total
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
    const recommendation = getRecommendation(scoreBand, totalScore);

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
      scoringModelVersion: "1.0",
      totalScore,
      scoreBand,
      recommendation,
      pricingScore,
      cashflowScore,
      upsideScore,
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

    // Update project with score
    batch.update(db.collection("workspace_projects").doc(projectId), {
      scoreTotal: totalScore,
      scoreBand,
      recommendation,
      updatedAt: now,
    });

    await batch.commit();

    // Log activity
    await db.collection("workspace_activity_logs").add({
      projectId,
      userId,
      activityType: "score_recalculated",
      entityType: "score",
      entityId: scoreRef.id,
      summary: `Score calculated: ${totalScore}/100 (${scoreBand.replace(/_/g, " ")})`,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      scoreId: scoreRef.id,
      totalScore,
      scoreBand,
      recommendation,
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
    });
  } catch (error: any) {
    console.error("Scoring error:", error);
    return NextResponse.json({ error: error.message || "Scoring failed" }, { status: 500 });
  }
}
