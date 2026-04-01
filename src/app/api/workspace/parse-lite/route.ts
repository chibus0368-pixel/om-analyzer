import { NextRequest, NextResponse } from "next/server";

// Allow up to 120 seconds for multi-stage parsing
export const maxDuration = 120;

async function callOpenAI(messages: { role: string; content: string }[], maxTokens = 16000) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ==============================================================================
// STAGE 1 PROMPTS — identical to Pro (/api/workspace/parse)
// ==============================================================================

const STAGE1_PROMPT = `You are a CRE document parser. Extract ALL facts from this property document. Return JSON only.

Extract these sections:

"property" - name, address, city, state, zip, county, asset_type, year_built, renovated, gla_sf (integer), land_acres (total site acreage — look for "acres", "land area", "lot size", "site size"), lot_dimensions, occupancy_pct (0-100), tenant_count, wale_years, parking, traffic (use HIGHEST count for the property's road — format "XX,XXX AADT on [road name]"), broker, vacancy_status (one of: "vacant", "owner_occupied", "partially_occupied", "fully_leased", null — infer from context), building_count, lease_rate

"pricing" - asking_price (integer), price_per_sf, lease_rate_monthly (if for lease)

"income" - base_rent, nnn_reimbursements, other_income, total_income (use null for ALL if property is vacant/owner-occupied with no income data)

"expenses" - cam, real_estate_taxes, insurance, management_fee_stated, other_expenses, total_expenses_stated, noi_stated (use null for ALL if not provided — do NOT fabricate)

"tenants" - Include EVERY tenant. Each needs: name, sf, annual_rent, monthly_rent, rent_per_sf, reimb, lease_type, lease_start, lease_end, extension, status, notes (under 20 words). Use empty array [] if property is vacant or no tenants listed.

"brief" - Write 2 concise paragraphs about THIS property. Direct acquisitions tone.

RULES:
- "name" is the PROPERTY name or address, NOT the broker/agent/company name.
- "broker" is the listing agent, brokerage firm, or contact person.
- Extract ONLY what the document states. Do not calculate or assume.
- Numbers as plain numbers (8900000 not "$8,900,000")
- Use null for missing data
- Include EVERY tenant — do not skip or truncate
- For land_acres: look for total site/lot acreage even on improved properties.`;

const STAGE1_LAND_PROMPT = `You are a CRE land document parser. Extract ALL facts from this land/development property document. Return JSON only.

Extract these sections:

"property" - name, address, city, state, zip, county, asset_type (should be "land"), total_acres, usable_acres, lot_dimensions, frontage_ft, topography, flood_zone, broker, traffic (use HIGHEST count — format "XX,XXX AADT on [road name]")

"pricing" - asking_price (integer), price_per_acre, price_per_sf (if stated)

"zoning" - current_zoning, zoning_description, planned_use, entitled (true/false/null), entitlement_status, permitted_uses, density_allowed, far_allowed, setbacks, height_limit

"utilities" - water (true/false/null), sewer (true/false/null), electric (true/false/null), gas (true/false/null), utilities_notes, power_proximity, fiber_available

"access" - road_access, highway_proximity, frontage_description, access_points, ingress_egress_notes, rail_access, airport_proximity

"environmental" - phase1_complete (true/false/null), environmental_notes, soil_conditions, wetlands

"improvements" - existing_structures, demolition_needed, site_work_notes

"brief" - Write 2 concise paragraphs about THIS land opportunity. Direct acquisitions tone.

RULES:
- "name" is the PROPERTY name or street address — NOT the broker/agent/company name.
- "broker" is the listing agent or brokerage company.
- Extract ONLY what the document states. Do not calculate or assume.
- Numbers as plain numbers (3930000 not "$3,930,000")
- Use null for missing/unknown data
- For boolean fields, use true/false/null — never guess`;

// ==============================================================================
// STAGE 2 PROMPTS — identical to Pro
// ==============================================================================

const STAGE2_PROMPT = `You are a CRE underwriting calculator. Given extracted property facts, calculate a complete first-pass underwriting.

IMPORTANT: Many properties are vacant, owner-occupied, or simple broker flyers with limited financial data. DO NOT output "insufficient data" for signals. Instead:
- If income/expense data exists → run full underwriting
- If property is vacant/owner-occupied/no income data → run what you can and provide USEFUL signals

Use these assumptions unless the data states otherwise:
- LTV: 65%, Interest Rate: 7.25%, Amortization: 25 years
- Vacancy allowance: 5% of gross income (unless actual vacancy exists)
- Management fee: 6% of EGI
- Reserves: $0.25/SF
- Exit cap: 8.5%, Hold period: 5 years

Calculate and return JSON with:

"pricing" - price_per_sf (price/gla), entry_cap_om (noi_stated/price*100 — null if no NOI), entry_cap_adjusted (null if no data), basis_signal (Green <$120/SF, Yellow $120-170, Red >$170)

"income" - potential_gross_income, vacancy_allowance, effective_gross_income, rent_per_sf. If no income data: estimate market rent/SF for the asset type and location, flag as estimated.

"expenses" - management_fee, reserves, total_expenses, noi_om, noi_adjusted, noi_per_sf. If no expense data: estimate using standard assumptions.

"debt" - loan_amount (price*0.65), equity_required, annual_debt_service, monthly_payment, dscr_om, dscr_adjusted, debt_yield, cash_on_cash_om, cash_on_cash_adjusted. Always calculate if asking_price exists.

"breakeven" - noi_for_1x_dscr, noi_for_1_2x_dscr, noi_for_1_35x_dscr, breakeven_occupancy, breakeven_rent_per_sf

"exit" - exit_value, exit_cap_rate (8.5), hold_years (5), selling_costs_pct (4)

"signals" - For each: text description + emoji (🟢🟡🔴). NEVER say "insufficient data":
  overall, cap_rate (>8%=🟢, 7-8%=🟡, <7%=🔴), dscr (>1.35x=🟢, 1.2-1.35x=🟡, <1.2x=🔴), occupancy (>90%=🟢, 80-90%=🟡, <80%=🔴), basis (<$120=🟢, $120-170=🟡, >$170=🔴), tenant_quality, rollover_risk, recommendation

"validation" - array of strings, each a check:
  - "GLA check: [tenant SF sum] vs [stated GLA] — [PASS/MISMATCH/N/A if vacant]"
  - "NOI check: EGI - expenses = [calculated] vs stated [stated] — [PASS/MISMATCH/N/A]"
  - "Cap rate check: NOI/price = [calculated]% vs stated [stated]% — [PASS/MISMATCH/N/A]"
  - "DSCR check: NOI/DS = [calculated] — [PASS/BELOW TARGET/N/A]"
  - "Rent/SF check: base_rent/GLA = [calculated] — [REASONABLE/LOW/HIGH/N/A]"
  - "Price/SF check: $[price_per_sf] for [asset_type] in [city] — [COMPETITIVE/MARKET/ABOVE MARKET]"

Return valid JSON only. All numbers as plain numbers.`;

const STAGE2_LAND_PROMPT = `You are a CRE land deal analyst. Given extracted land property facts, produce a first-pass land analysis.

Calculate and return JSON with:

"pricing" - price_per_acre (if not already stated), price_per_sf (if calculable from acres), asking_price, pricing_signal (Green = competitive for area, Yellow = market rate, Red = above market)

"site_assessment" - development_readiness (score 1-10 with brief explanation), highest_and_best_use (brief text), entitlement_risk (Low/Medium/High with explanation)

"signals" - For each provide a text description + emoji (🟢🟡🔴):
  overall - overall land deal assessment
  pricing - is the price competitive for this location and zoning?
  location - proximity to demand drivers, highway access, population growth
  zoning - is the zoning favorable? Entitled or needs work?
  utilities - are water, sewer, electric, gas available?
  access - road frontage, highway proximity, ingress/egress quality
  recommendation - clear buy/hold/pass recommendation with reasoning

"validation" - array of strings, each a check:
  - "Price/acre check: $[price_per_acre] for [zoning] in [city] — [COMPETITIVE/MARKET/ABOVE MARKET]"
  - "Zoning check: [current_zoning] for [planned_use] — [ALIGNED/NEEDS CHANGE/UNKNOWN]"
  - "Utilities check: water=[Y/N/Unknown] sewer=[Y/N/Unknown] electric=[Y/N/Unknown] — [READY/PARTIAL/NOT READY]"
  - "Access check: [road_access] — [GOOD/ADEQUATE/POOR]"
  - "Environmental check: Phase I=[complete/needed/unknown] — [CLEAR/NEEDS REVIEW]"

Return valid JSON only. All numbers as plain numbers.`;

// ==============================================================================
// STAGE 3: Asset-type addon prompts — from Pro pipeline
// ==============================================================================

const INDUSTRIAL_ADDON_PROMPT = `You are extracting industrial-specific first-pass deal facts.
Return only the asset_addons object as valid JSON.

Fields to consider:
- rent_per_sf
- clear_height (ceiling clearance in feet)
- loading_type (dock-high, grade-level, both)
- loading_count (number of dock doors / drive-in doors)
- trailer_parking (number of trailer spots)
- office_finish_pct (percentage of space that is office vs warehouse)
- lot_acres (total site/lot acreage)
- lot_dimensions (if stated)
- building_coverage_pct (building footprint / lot size)
- yard_space (fenced yard, outside storage area description)
- power_amps (electrical service capacity)
- sprinklered (true/false/null — fire suppression)
- rail_served (true/false/null)
- industrial_tenant_type (logistics, manufacturing, flex, cold storage, etc.)
- industrial_notes

Rules:
- Only include fields that are reasonably supported by the OM
- Use null for unknown values
- lot_acres is critical — search thoroughly
- Keep industrial_notes to 1 or 2 concise sentences`;

const OFFICE_ADDON_PROMPT = `You are extracting office-specific first-pass deal facts.
Return only the asset_addons object as valid JSON.

Fields to consider:
- rent_per_sf
- suite_count (number of individual suites/units)
- medical_flag (true/false/null — only true if clearly medical office)
- major_tenant_mix (brief description of key tenants and industries)
- lease_expirations_near_term (any leases expiring within 24 months)
- parking_ratio (spaces per 1,000 SF)
- lot_acres (total site/lot acreage)
- lot_dimensions (if stated)
- building_class (Class A, B, C)
- floor_count (number of stories)
- elevator_count (if stated)
- ti_lc_signal (brief text: "Low" / "Moderate" / "High" TI/LC exposure)
- office_notes

Rules:
- Only include fields that are reasonably supported by the OM
- Use null for unknown values
- medical_flag should be true only if clearly medical office or clinical tenancy is stated`;

// ==============================================================================
// HANDLER
// ==============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentText, fileName, analysisType: requestedType } = body;

    if (!documentText || documentText.trim().length < 50) {
      return NextResponse.json({ error: "Document text too short or missing" }, { status: 400 });
    }

    // Determine analysis type — use requested type or auto-classify
    let analysisType: string = requestedType || "";
    const validTypes = ["retail", "industrial", "office", "land"];

    if (!validTypes.includes(analysisType)) {
      // Auto-classify from document text
      console.log("[parse-lite] Auto-classifying asset type...");
      try {
        const classifyRes = await callOpenAI([
          {
            role: "system",
            content: `You classify commercial real estate offering materials into one analysis type. Return only valid JSON.
Choose exactly one: retail, industrial, office, land
Rules:
- retail = retail broadly, including single-tenant NNN, ground lease, sale-leaseback, multi-tenant strip, neighborhood center
- industrial = warehouse, flex, distribution, manufacturing, industrial outdoor storage
- office = professional office, medical office, clinic, suburban office
- land = raw land, development land, redevelopment, outparcel, pad site`,
          },
          {
            role: "user",
            content: `Classify this document:\n\n{"detected_type": "", "confidence": 0.0, "reason": ""}\n\n${documentText.substring(0, 4000)}`,
          },
        ], 200);

        const jsonStr = classifyRes.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
        const classifyResult = JSON.parse(jsonStr.match(/\{[\s\S]*\}/)?.[0] || jsonStr);
        if (validTypes.includes(classifyResult.detected_type)) {
          analysisType = classifyResult.detected_type;
        } else {
          analysisType = "retail";
        }
        console.log("[parse-lite] Classified as:", analysisType, "confidence:", classifyResult.confidence);
      } catch (classifyErr) {
        console.warn("[parse-lite] Classification failed, defaulting to retail:", classifyErr);
        analysisType = "retail";
      }
    }

    const isLand = analysisType === "land";

    // ===== STAGE 1: Extract raw facts =====
    console.log(`[parse-lite] Stage 1: Extracting facts (${analysisType}) from`, fileName);
    const stage1Prompt = isLand ? STAGE1_LAND_PROMPT : STAGE1_PROMPT;
    const stage1Response = await callOpenAI([
      { role: "system", content: stage1Prompt },
      { role: "user", content: `Extract ALL facts from this CRE ${analysisType} property document. IMPORTANT: Extract the actual property name and full address. ${isLand ? "" : "Include EVERY tenant."} Return JSON only.\n\n${documentText.substring(0, 40000)}` },
    ], 12000);

    let stage1: any;
    try {
      const jsonMatch = stage1Response.match(/\{[\s\S]*\}/);
      stage1 = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(stage1Response);
    } catch {
      console.error("[parse-lite] Stage 1 JSON parse failed");
      return NextResponse.json({ error: "Failed to parse document" }, { status: 500 });
    }

    // ===== STAGE 2: Calculate underwriting =====
    console.log(`[parse-lite] Stage 2: Calculating underwriting (${analysisType})...`);
    const stage2Prompt = isLand ? STAGE2_LAND_PROMPT : STAGE2_PROMPT;
    const stage2Input = JSON.stringify(isLand
      ? { property: stage1.property, pricing: stage1.pricing, zoning: stage1.zoning, utilities: stage1.utilities, access: stage1.access, environmental: stage1.environmental }
      : { property: stage1.property, pricing: stage1.pricing, income: stage1.income, expenses: stage1.expenses, tenants: stage1.tenants }
    );

    const stage2Response = await callOpenAI([
      { role: "system", content: stage2Prompt },
      { role: "user", content: `Calculate complete ${isLand ? "land analysis" : "underwriting"} from these extracted facts:\n\n${stage2Input}` },
    ], 8000);

    let stage2: any;
    try {
      const jsonMatch = stage2Response.match(/\{[\s\S]*\}/);
      stage2 = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(stage2Response);
    } catch {
      console.error("[parse-lite] Stage 2 JSON parse failed");
      stage2 = {};
    }

    // ===== STAGE 3: Asset-type addon extraction (NEW — matches Pro) =====
    let addons: any = {};
    if (analysisType === "industrial" || analysisType === "office") {
      console.log(`[parse-lite] Stage 3: Extracting ${analysisType} addons...`);
      const addonPrompt = analysisType === "industrial" ? INDUSTRIAL_ADDON_PROMPT : OFFICE_ADDON_PROMPT;
      try {
        const addonResponse = await callOpenAI([
          { role: "system", content: addonPrompt },
          { role: "user", content: `Extract ${analysisType}-specific facts from this document:\n\n${documentText.substring(0, 20000)}` },
        ], 4000);
        const jsonMatch = addonResponse.match(/\{[\s\S]*\}/);
        addons = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch (addonErr) {
        console.warn("[parse-lite] Addon extraction failed:", addonErr);
      }
    }

    // ===== Build response =====
    const prop = stage1.property || {};
    const pricing = { ...(stage1.pricing || {}), ...(stage2.pricing || {}) };
    const signals = stage2.signals || {};
    const validation = stage2.validation || [];

    // Signals come as strings with emoji (🟢🟡🔴)
    const formattedSignals: Record<string, string> = {};
    for (const [key, val] of Object.entries(signals)) {
      if (val && typeof val === "object") {
        formattedSignals[key] = (val as any).text || (val as any).description || JSON.stringify(val);
      } else if (typeof val === "string") {
        formattedSignals[key] = val;
      } else if (val !== null && val !== undefined) {
        formattedSignals[key] = String(val);
      }
    }

    // Format tenants (non-land)
    const tenants = isLand ? [] : (stage1.tenants || []).map((t: any) => ({
      name: t.name || "Unknown",
      sf: t.sf,
      rent: t.annual_rent,
      monthly_rent: t.monthly_rent,
      rent_per_sf: t.rent_per_sf,
      type: t.lease_type || t.type,
      start: t.lease_start,
      end: t.lease_end,
      extension: t.extension,
      status: t.status || "Active",
      notes: t.notes,
    }));

    // Build common result
    const income = isLand ? {} : { ...(stage1.income || {}), ...(stage2.income || {}) };
    const expenses = isLand ? {} : { ...(stage1.expenses || {}), ...(stage2.expenses || {}) };
    const debt = stage2.debt || {};
    const breakeven = stage2.breakeven || {};
    const exit = stage2.exit || {};

    const result: Record<string, any> = {
      // Analysis type — critical for scoring
      analysisType,

      // Property basics
      propertyName: prop.name || fileName?.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") || "Property",
      address: prop.address,
      city: prop.city,
      state: prop.state,
      zip: prop.zip,
      county: prop.county,
      assetType: prop.asset_type || analysisType,
      yearBuilt: prop.year_built,
      renovated: prop.renovated,
      buildingSf: prop.gla_sf,
      landAcres: isLand ? (prop.total_acres || prop.usable_acres) : prop.land_acres,
      occupancyPct: prop.occupancy_pct,
      tenantCount: prop.tenant_count || String(tenants.length),
      wale: prop.wale_years,
      parking: prop.parking,
      traffic: prop.traffic,
      broker: prop.broker,
      brief: typeof stage1.brief === "string" ? stage1.brief : Array.isArray(stage1.brief) ? stage1.brief.join("\n") : String(stage1.brief || ""),

      // Pricing & deal terms
      askingPrice: pricing.asking_price,
      pricePerSf: pricing.price_per_sf,
      pricePerAcre: pricing.price_per_acre,
      capRateOm: pricing.entry_cap_om,
      capRateAdjusted: pricing.entry_cap_adjusted,
      basisSignal: pricing.basis_signal || pricing.pricing_signal,

      // Income
      baseRent: income.base_rent,
      nnnReimbursements: income.nnn_reimbursements,
      otherIncome: income.other_income,
      grossScheduledIncome: income.potential_gross_income,
      vacancyAllowance: income.vacancy_allowance,
      effectiveGrossIncome: income.effective_gross_income,
      rentPerSf: income.rent_per_sf,

      // Expenses
      camExpenses: expenses.cam,
      propertyTaxes: expenses.real_estate_taxes,
      insurance: expenses.insurance,
      managementFee: expenses.management_fee,
      reserves: expenses.reserves,
      totalExpenses: expenses.total_expenses,
      noiOm: expenses.noi_om || expenses.noi_stated,
      noiAdjusted: expenses.noi_adjusted,
      noiPerSf: expenses.noi_per_sf,

      // Debt
      loanAmount: debt.loan_amount,
      equityRequired: debt.equity_required,
      annualDebtService: debt.annual_debt_service,
      monthlyPayment: debt.monthly_payment,
      dscrOm: debt.dscr_om,
      dscrAdjusted: debt.dscr_adjusted,
      debtYield: debt.debt_yield,
      cashOnCashOm: debt.cash_on_cash_om,
      cashOnCashAdjusted: debt.cash_on_cash_adjusted,

      // Breakeven
      breakevenOccupancy: breakeven.breakeven_occupancy,
      breakevenRentPerSf: breakeven.breakeven_rent_per_sf,

      // Exit
      exitValue: exit.exit_value,
      exitCapRate: exit.exit_cap_rate,
      holdYears: exit.hold_years,

      // Signals — raw strings with emoji
      signals: formattedSignals,

      // Validation checks
      validation,

      // Tenants — full detail
      tenants,

      // Asset-type addons (for scoring)
      addons,
    };

    // Land-specific fields
    if (isLand) {
      result.zoning = stage1.zoning || {};
      result.utilities = stage1.utilities || {};
      result.access = stage1.access || {};
      result.environmental = stage1.environmental || {};
      result.siteAssessment = stage2.site_assessment || {};
    }

    console.log(`[parse-lite] Complete (${analysisType}):`, prop.name, "—", tenants.length, "tenants");

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[parse-lite] Error:", error);
    return NextResponse.json({ error: error.message || "Analysis failed" }, { status: 500 });
  }
}
