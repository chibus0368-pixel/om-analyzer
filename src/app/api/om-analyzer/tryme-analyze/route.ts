import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { runParseEngine } from "@/lib/workspace/parse-engine";
import { runScoreEngine } from "@/lib/workspace/score-engine";
import { getAdminDb } from "@/lib/firebase-admin";

// Full Pro pipeline timeout
export const maxDuration = 120;

/**
 * POST /api/om-analyzer/tryme-analyze
 *
 * Runs the EXACT SAME pipeline Pro runs — runParseEngine() + runScoreEngine() —
 * against an ephemeral Firestore property record. This guarantees Try Me and
 * Pro produce identical scores for the same document.
 *
 * Flow:
 *   1. Create ephemeral propertyId + tryme-anon userId
 *   2. Seed minimal workspace_properties doc
 *   3. runParseEngine() → writes Stage 1/2/3 + value_add fields to Firestore
 *   4. runScoreEngine() → reads fields, writes workspace_scores + updates property
 *   5. Read back fields + property + score
 *   6. Build flat response shape the Try Me frontend expects
 *   7. Fire-and-forget cleanup of all ephemeral records
 */

// Light classification when user didn't pick an asset type
async function classifyAssetType(documentText: string): Promise<string> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.1,
        max_tokens: 100,
        messages: [
          {
            role: "system",
            content: `Classify this CRE document into one of: retail, industrial, office, land. Return JSON: {"type":"<one>"}`,
          },
          { role: "user", content: documentText.substring(0, 4000) },
        ],
      }),
    });
    if (!res.ok) return "retail";
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    const t = (parsed.type || "").toLowerCase();
    return ["retail", "industrial", "office", "land"].includes(t) ? t : "retail";
  } catch {
    return "retail";
  }
}

export async function POST(request: NextRequest) {
  const db = getAdminDb();
  const propertyId = `tryme-${randomUUID()}`;
  const projectId = `tryme-${randomUUID()}`;

  try {
    const body = await request.json();
    const { documentText, fileName, analysisType: requestedType, anonId } = body;

    // Key records to this browser's anon session so we can migrate them on
    // signup. Falls back to a shared bucket only if the client failed to
    // provide one (shouldn't happen in normal flow).
    const userId = anonId && typeof anonId === "string"
      ? `tryme-${anonId}`
      : "tryme-anon";

    if (!documentText || documentText.trim().length < 50) {
      return NextResponse.json(
        { error: "Document text too short or missing" },
        { status: 400 }
      );
    }

    // Determine analysis type
    let analysisType: string = requestedType || "";
    const validTypes = ["retail", "industrial", "office", "land"];
    if (!validTypes.includes(analysisType)) {
      analysisType = await classifyAssetType(documentText);
    }

    // 1. Seed ephemeral property doc. We no longer delete this immediately —
    // records stick around so they can be claimed on signup. A TTL field
    // (expiresAt) lets a scheduled cleanup sweep unclaimed records after 7 days.
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.collection("workspace_properties").doc(propertyId).set({
      projectId,
      userId,
      propertyName: fileName?.replace(/\.[^.]+$/, "") || "Property",
      analysisType,
      parseStatus: "pending",
      isTryMe: true,
      anonId: anonId || null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Run Pro parse engine
    const parseResult = await runParseEngine({
      projectId,
      propertyId,
      userId,
      documentText,
      analysisType,
    });

    if (!parseResult.success) {
      void cleanup(db, propertyId, projectId);
      return NextResponse.json(
        { error: parseResult.error || "Parse failed" },
        { status: 500 }
      );
    }

    // 3. Run Pro score engine
    const scoreResult = await runScoreEngine({
      projectId,
      propertyId,
      userId,
      analysisType,
    });

    // 4. Read back extracted fields (keyed by group.name) + property
    const fieldsSnap = await db
      .collection("workspace_extracted_fields")
      .where("propertyId", "==", propertyId)
      .get();

    // Match Pro's PropertyDetailClient reader semantics: prefer user override,
    // then normalizedValue, then rawValue. Try Me previously only read
    // normalizedValue which could be null/empty for some signal writes and
    // caused strength/risk text to disappear even though Pro rendered it.
    const fields: Record<string, any> = {};
    fieldsSnap.docs.forEach((d: any) => {
      const data = d.data();
      const value = data.isUserOverridden
        ? data.userOverrideValue
        : (data.normalizedValue ?? data.rawValue ?? "");
      fields[`${data.fieldGroup}.${data.fieldName}`] = value;
    });

    const propDoc = await db.collection("workspace_properties").doc(propertyId).get();
    const prop = propDoc.data() || {};

    // 5. Build flat response in the shape Try Me frontend expects
    const get = (k: string) => fields[k];

    // Reconstruct tenants array from rent_roll.tenant_N_* fields
    const tenants: any[] = [];
    for (let i = 1; i <= 50; i++) {
      const name = get(`rent_roll.tenant_${i}_name`);
      if (!name) break;
      tenants.push({
        name,
        sf: get(`rent_roll.tenant_${i}_sf`),
        rent: get(`rent_roll.tenant_${i}_rent`),
        monthly_rent: get(`rent_roll.tenant_${i}_monthly_rent`),
        rent_per_sf: get(`rent_roll.tenant_${i}_rent_psf`),
        type: get(`rent_roll.tenant_${i}_type`),
        start: get(`rent_roll.tenant_${i}_lease_start`),
        end: get(`rent_roll.tenant_${i}_lease_end`),
        extension: get(`rent_roll.tenant_${i}_extension`),
        status: get(`rent_roll.tenant_${i}_status`) || "Active",
      });
    }

    // Signals
    const signals: Record<string, string> = {};
    const signalKeys = [
      "overall_signal",
      "cap_rate_signal",
      "dscr_signal",
      "occupancy_signal",
      "basis_signal",
      "tenant_quality_signal",
      "rollover_signal",
      "recommendation",
    ];
    signalKeys.forEach((k) => {
      const v = get(`signals.${k}`);
      if (!v) return;
      // Map "rollover_signal" → "rollover_risk" to match frontend expectation
      let key = k.replace(/_signal$/, "");
      if (key === "rollover") key = "rollover_risk";
      signals[key] = String(v);
    });

    // Validation checks
    const validation: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const v = get(`validation.check_${i}`);
      if (v) validation.push(String(v));
    }

    // Score payload (match shape of old score-lite)
    const proScore = scoreResult.success
      ? {
          totalScore: scoreResult.totalScore,
          scoreBand: scoreResult.scoreBand,
          recommendation: scoreResult.recommendation,
          categories: scoreResult.categories,
          analysisType: scoreResult.analysisType,
          modelVersion: "pro-1.1",
        }
      : null;

    const result: Record<string, any> = {
      analysisType,

      // Property basics
      propertyName:
        get("property_basics.property_name") ||
        prop.propertyName ||
        fileName?.replace(/\.[^.]+$/, "") ||
        "Property",
      address: get("property_basics.address"),
      city: get("property_basics.city"),
      state: get("property_basics.state"),
      zip: get("property_basics.zip"),
      county: get("property_basics.county"),
      assetType: get("property_basics.asset_type") || analysisType,
      yearBuilt: get("property_basics.year_built"),
      renovated: get("property_basics.renovated"),
      buildingSf: get("property_basics.building_sf"),
      landAcres:
        get("property_basics.land_acres") ||
        get("property_basics.lot_acres") ||
        get("property_basics.usable_acres"),
      occupancyPct: get("property_basics.occupancy_pct"),
      tenantCount: get("property_basics.tenant_count") || tenants.length,
      wale: get("property_basics.wale_years"),
      parking: get("property_basics.parking_count"),
      traffic: get("property_basics.traffic"),
      broker: get("property_basics.broker"),
      brief: typeof parseResult.brief === "object" ? JSON.stringify(parseResult.brief) : (parseResult.brief || ""),

      // Pricing
      askingPrice: get("pricing_deal_terms.asking_price"),
      pricePerSf: get("pricing_deal_terms.price_per_sf"),
      pricePerAcre: get("pricing_deal_terms.price_per_acre"),
      capRateOm: get("pricing_deal_terms.cap_rate_om"),
      capRateAdjusted: get("pricing_deal_terms.cap_rate_adjusted"),
      basisSignal: get("pricing_deal_terms.basis_signal"),

      // Income
      baseRent: get("income.base_rent"),
      nnnReimbursements: get("income.nnn_reimbursements"),
      otherIncome: get("income.other_income"),
      grossScheduledIncome: get("income.gross_scheduled_income"),
      vacancyAllowance: get("income.vacancy_allowance"),
      effectiveGrossIncome: get("income.effective_gross_income"),
      rentPerSf: get("income.rent_per_sf"),

      // Expenses
      camExpenses: get("expenses.cam_expenses"),
      propertyTaxes: get("expenses.property_taxes"),
      insurance: get("expenses.insurance"),
      managementFee: get("expenses.management_fee"),
      reserves: get("expenses.reserves"),
      totalExpenses: get("expenses.total_expenses"),
      noiOm: get("expenses.noi_om"),
      noiAdjusted: get("expenses.noi_adjusted"),
      noiPerSf: get("expenses.noi_per_sf"),

      // Debt
      loanAmount: get("debt_assumptions.loan_amount"),
      equityRequired: get("debt_assumptions.equity_required"),
      annualDebtService: get("debt_assumptions.annual_debt_service"),
      dscrOm: get("debt_assumptions.dscr_om"),
      dscrAdjusted: get("debt_assumptions.dscr_adjusted"),
      debtYield: get("debt_assumptions.debt_yield"),
      cashOnCashOm: get("returns.cash_on_cash_om"),
      cashOnCashAdjusted: get("returns.cash_on_cash_adjusted"),

      // Breakeven
      breakevenOccupancy: get("returns.breakeven_occupancy"),
      breakevenRentPerSf: get("returns.breakeven_rent_per_sf"),

      // Signals & validation
      signals,
      validation,

      // Tenants
      tenants,

      // Value-add (Pro feature — shown for parity)
      valueAdd: {
        score: get("value_add.score"),
        flagsCount: get("value_add.flags_count"),
        summary: get("value_add.summary"),
        rentGapPct: get("value_add.rent_gap_pct"),
        vacancyUpsideNoi: get("value_add.vacancy_upside_noi"),
      },

      // Addons (industrial/office)
      addons: buildAddons(fields, analysisType),

      // Pro score result — same shape the frontend already consumes
      proScore,
    };

    // Land-specific extras
    if (analysisType === "land") {
      result.zoning = {
        current_zoning: get("land_zoning.current_zoning"),
        entitled: get("land_zoning.entitled"),
        entitlement_status: get("land_zoning.entitlement_status"),
        permitted_uses: get("land_zoning.permitted_uses"),
        density_allowed: get("land_zoning.density_allowed"),
        far_allowed: get("land_zoning.far_allowed"),
      };
      result.utilities = {
        water: get("land_utilities.water"),
        sewer: get("land_utilities.sewer"),
        electric: get("land_utilities.electric"),
        gas: get("land_utilities.gas"),
      };
      result.access = {
        road_access: get("land_access.road_access"),
        highway_proximity: get("land_access.highway_proximity"),
        frontage_description: get("land_access.frontage_description"),
        rail_access: get("land_access.rail_access"),
      };
    }

    // 6. Persist the record (no cleanup). Records are keyed by anonId and
    // will be claimed on signup via /api/auth/bootstrap. Unclaimed records
    // are pruned by a TTL sweep after 7 days.
    return NextResponse.json({ ...result, propertyId, projectId });
  } catch (error: any) {
    console.error("[tryme-analyze] Error:", error);
    void cleanup(db, propertyId, projectId);
    return NextResponse.json(
      { error: error?.message || "Analysis failed" },
      { status: 500 }
    );
  }
}

function buildAddons(
  fields: Record<string, any>,
  analysisType: string
): Record<string, any> {
  if (analysisType !== "industrial" && analysisType !== "office") return {};
  const addons: Record<string, any> = {};
  const prefix = `${analysisType}_addons.`;
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith(prefix)) {
      addons[k.substring(prefix.length)] = v;
    }
  }
  return addons;
}

async function cleanup(db: any, propertyId: string, projectId: string) {
  try {
    // Delete extracted fields
    const fieldsSnap = await db
      .collection("workspace_extracted_fields")
      .where("propertyId", "==", propertyId)
      .get();
    const batch = db.batch();
    fieldsSnap.docs.forEach((d: any) => batch.delete(d.ref));

    // Delete scores
    const scoresSnap = await db
      .collection("workspace_scores")
      .where("projectId", "==", projectId)
      .get();
    scoresSnap.docs.forEach((d: any) => batch.delete(d.ref));

    // Delete parser runs
    const runsSnap = await db
      .collection("workspace_parser_runs")
      .where("projectId", "==", projectId)
      .get();
    runsSnap.docs.forEach((d: any) => batch.delete(d.ref));

    // Delete notes
    const notesSnap = await db
      .collection("workspace_notes")
      .where("propertyId", "==", propertyId)
      .get();
    notesSnap.docs.forEach((d: any) => batch.delete(d.ref));

    // Delete activity logs
    const logsSnap = await db
      .collection("workspace_activity_logs")
      .where("projectId", "==", propertyId)
      .get();
    logsSnap.docs.forEach((d: any) => batch.delete(d.ref));

    // Delete property
    batch.delete(db.collection("workspace_properties").doc(propertyId));

    await batch.commit();
    console.log(`[tryme-analyze] Cleanup complete: ${propertyId}`);
  } catch (err) {
    console.warn(`[tryme-analyze] Cleanup failed for ${propertyId}:`, err);
  }
}
