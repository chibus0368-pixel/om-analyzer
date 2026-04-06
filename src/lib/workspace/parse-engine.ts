import { getAdminDb } from "@/lib/firebase-admin";

// ===== OpenAI API Helper =====
async function callOpenAI(
  messages: { role: string; content: string }[],
  maxTokens = 16000
) {
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

// ===== STAGE 1: Extract raw facts (Retail / Industrial / Office) =====
const STAGE1_PROMPT = `You are a CRE document parser. Extract ALL facts from this property document. Return JSON only.

Extract these sections:

"property" - name, address, city, state, zip, county, asset_type, year_built, renovated, gla_sf (integer), land_acres (total site acreage — look for "acres", "land area", "lot size", "site size"), lot_dimensions, occupancy_pct (0-100), tenant_count, wale_years, parking, traffic (use HIGHEST count for the property's road — format "XX,XXX AADT on [road name]"), broker, vacancy_status (one of: "vacant", "owner_occupied", "partially_occupied", "fully_leased", null — infer from context: no tenants listed + for sale usually means vacant or owner-occupied), building_count (number of buildings on site if stated), lease_rate (monthly or annual lease rate if listed for lease)

"pricing" - asking_price (integer), price_per_sf, lease_rate_monthly (if for lease)

"income" - base_rent, nnn_reimbursements, other_income, total_income (use null for ALL if property is vacant/owner-occupied with no income data — this is normal for flyers)

"expenses" - cam, real_estate_taxes, insurance, management_fee_stated, other_expenses, total_expenses_stated, noi_stated (use null for ALL if not provided — do NOT fabricate)

"tenants" - Include EVERY tenant. Each needs: name, sf, annual_rent, monthly_rent, rent_per_sf, reimb, lease_type, lease_start, lease_end, extension, status, notes (under 20 words). Use empty array [] if property is vacant or no tenants listed.

"brief" - Write 2 concise paragraphs about THIS property. Direct acquisitions tone. For vacant/owner-user properties, focus on building specs, lot size, location, and potential uses.

RULES:
- "name" is the PROPERTY name or address, NOT the broker/agent/company name. If in doubt, use the street address as the name.
- "broker" is the listing agent, brokerage firm, or contact person — keep it separate from the property name.
- Extract ONLY what the document states. Do not calculate or assume.
- Numbers as plain numbers (8900000 not "$8,900,000")
- Use null for missing data
- Include EVERY tenant — do not skip or truncate
- For land_acres: look for total site/lot acreage even on improved properties. Industrial and office properties often list lot size.`;

// ===== STAGE 1 LAND: Extract land-specific facts =====
const STAGE1_LAND_PROMPT = `You are a CRE land document parser. Extract ALL facts from this land/development property document. Return JSON only.

Extract these sections:

"property" - name, address, city, state, zip, county, asset_type (should be "land"), total_acres, usable_acres, lot_dimensions, frontage_ft, topography, flood_zone, broker, traffic (use HIGHEST count — format "XX,XXX AADT on [road name]")

"pricing" - asking_price (integer), price_per_acre, price_per_sf (if stated)

"zoning" - current_zoning, zoning_description, planned_use, entitled (true/false/null), entitlement_status, permitted_uses, density_allowed, far_allowed, setbacks, height_limit

"utilities" - water (true/false/null), sewer (true/false/null), electric (true/false/null), gas (true/false/null), utilities_notes, power_proximity, fiber_available

"access" - road_access, highway_proximity, frontage_description, access_points, ingress_egress_notes, rail_access, airport_proximity

"environmental" - phase1_complete (true/false/null), environmental_notes, soil_conditions, wetlands

"improvements" - existing_structures, demolition_needed, site_work_notes

"brief" - Write 2 concise paragraphs about THIS land opportunity. Direct acquisitions tone. Focus on location, zoning viability, development potential, and pricing relative to area comps.

RULES:
- "name" is the PROPERTY name, site name, or street address — NOT the broker/agent/company name.
- "broker" is the listing agent or brokerage company — keep it separate from the property name.
- Extract ONLY what the document states. Do not calculate or assume.
- Numbers as plain numbers (3930000 not "$3,930,000")
- Use null for missing/unknown data
- For boolean fields, use true/false/null — never guess`;

// ===== STAGE 2: Calculate underwriting (Retail / Industrial / Office) =====
const STAGE2_PROMPT = `You are a CRE underwriting calculator. Given extracted property facts, calculate a complete first-pass underwriting.

IMPORTANT: Many properties are vacant, owner-occupied, or simple broker flyers with limited financial data. DO NOT output "insufficient data" for signals. Instead:
- If income/expense data exists → run full underwriting
- If property is vacant/owner-occupied/no income data → run what you can (pricing, basis, debt sizing) and provide USEFUL signals based on building specs, lot size, price/SF, location, and condition

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

"signals" - For each: text description + emoji (🟢🟡🔴). NEVER say "insufficient data" — always provide a useful signal:
  overall - assess the deal holistically. For vacant properties: evaluate price/SF, lot value, building condition, location.
  cap_rate - if calculable: >8%=🟢, 7-8%=🟡, <7%=🔴. If vacant: estimate potential cap rate at market rents.
  dscr - if calculable: >1.35x=🟢, 1.2-1.35x=🟡, <1.2x=🔴. If vacant: estimate at market rents.
  occupancy - if data exists: >90%=🟢, 80-90%=🟡, <80%=🔴. If vacant: 🔴 "Currently vacant — owner-user or lease-up opportunity"
  basis - price/SF: <$120=🟢, $120-170=🟡, >$170=🔴. Always calculable if price + GLA exist.
  tenant_quality - describe tenants, or "Vacant — no tenant risk, but no income" for empty buildings.
  rollover_risk - describe risk, or "N/A — vacant property" for empty buildings.
  recommendation - always give a clear buy/hold/pass with reasoning, even for vacant properties.

"validation" - array of strings, each a check:
  - "GLA check: [tenant SF sum] vs [stated GLA] — [PASS/MISMATCH/N/A if vacant]"
  - "NOI check: EGI - expenses = [calculated] vs stated [stated] — [PASS/MISMATCH/N/A]"
  - "Cap rate check: NOI/price = [calculated]% vs stated [stated]% — [PASS/MISMATCH/N/A]"
  - "DSCR check: NOI/DS = [calculated] — [PASS/BELOW TARGET/N/A]"
  - "Rent/SF check: base_rent/GLA = [calculated] — [REASONABLE/LOW/HIGH/N/A]"
  - "Price/SF check: $[price_per_sf] for [asset_type] in [city] — [COMPETITIVE/MARKET/ABOVE MARKET]"

Return valid JSON only. All numbers as plain numbers.`;

// ===== STAGE 2 LAND: Analyze land deal =====
const STAGE2_LAND_PROMPT = `You are a CRE land deal analyst. Given extracted land property facts, produce a first-pass land analysis.

Calculate and return JSON with:

"pricing" - price_per_acre (if not already stated), price_per_sf (if calculable from acres), asking_price, pricing_signal (Green = competitive for area, Yellow = market rate, Red = above market — use your knowledge of similar land pricing in the stated area)

"site_assessment" - development_readiness (score 1-10 with brief explanation), highest_and_best_use (brief text), entitlement_risk (Low/Medium/High with explanation)

"signals" - For each provide a text description + emoji (🟢🟡🔴):
  overall - overall land deal assessment
  pricing - is the price competitive for this location and zoning? Compare to typical land prices in the metro area.
  location - proximity to demand drivers, highway access, population growth, economic activity
  zoning - is the zoning favorable? Is it entitled or does it need entitlement work? How restrictive?
  utilities - are water, sewer, electric, gas available on site or nearby? Will utility extension be costly?
  access - road frontage, highway proximity, ingress/egress quality, rail/air access if relevant
  recommendation - clear buy/hold/pass recommendation with reasoning

"validation" - array of strings, each a check:
  - "Price/acre check: $[price_per_acre] for [zoning] in [city] — [COMPETITIVE/MARKET/ABOVE MARKET]"
  - "Zoning check: [current_zoning] for [planned_use] — [ALIGNED/NEEDS CHANGE/UNKNOWN]"
  - "Utilities check: water=[Y/N/Unknown] sewer=[Y/N/Unknown] electric=[Y/N/Unknown] — [READY/PARTIAL/NOT READY]"
  - "Access check: [road_access] — [GOOD/ADEQUATE/POOR]"
  - "Environmental check: Phase I=[complete/needed/unknown] — [CLEAR/NEEDS REVIEW]"

Return valid JSON only. All numbers as plain numbers.`;

// ===== STAGE 3: Asset-type-specific addon extraction =====
const INDUSTRIAL_ADDON_PROMPT = `You are extracting industrial-specific first-pass deal facts.
Return only the asset_addons object as valid JSON.

Fields to consider:
- rent_per_sf
- clear_height (ceiling clearance in feet)
- loading_type (dock-high, grade-level, both)
- loading_count (number of dock doors / drive-in doors)
- trailer_parking (number of trailer spots)
- office_finish_pct (percentage of space that is office vs warehouse)
- lot_acres (total site/lot acreage — look for "acres", "land area", "lot size", "site size", "total site")
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
- lot_acres is critical — search thoroughly for any mention of site size, land area, lot size, or acreage
- Keep industrial_notes to 1 or 2 concise sentences`;

const OFFICE_ADDON_PROMPT = `You are extracting office-specific first-pass deal facts.
Return only the asset_addons object as valid JSON.

Fields to consider:
- rent_per_sf
- suite_count (number of individual suites/units)
- medical_flag (true/false/null — only true if clearly medical office or clinical tenancy)
- major_tenant_mix (brief description of key tenants and industries)
- lease_expirations_near_term (any leases expiring within 24 months — brief summary)
- parking_ratio (spaces per 1,000 SF — e.g. "4.0/1,000 SF")
- lot_acres (total site/lot acreage — look for "acres", "land area", "lot size", "site size", "total site")
- lot_dimensions (if stated)
- building_class (Class A, B, C — if stated or inferable from quality/age)
- floor_count (number of stories)
- elevator_count (if stated)
- ti_lc_signal (brief text: "Low" / "Moderate" / "High" TI/LC exposure)
- office_notes

Rules:
- Only include fields that are reasonably supported by the OM
- Use null for unknown values
- lot_acres is important — search thoroughly for any mention of site size, land area, lot size, or acreage
- medical_flag should be true only if clearly medical office or clinical tenancy is stated
- ti_lc_signal should be a short text signal, not a numeric forecast
- Keep office_notes concise`;

const LAND_ADDON_PROMPT = `You are extracting land-specific first-pass deal facts.
Return only the asset_addons object as valid JSON.

Fields to consider:
- zoning (current zoning designation)
- planned_use (intended development type)
- usable_acres (net developable acres after setbacks/easements/wetlands)
- total_acres (gross site acres — cross-check with Stage 1 if available)
- entitled (true/false/null — are entitlements in place?)
- density_allowed (units/acre or FAR if stated)
- utilities_signal (brief: "All available on-site" / "Partial" / "None nearby")
- power_proximity_signal (brief distance to nearest power)
- frontage_signal (brief: road frontage quality and length)
- access_signal (brief: ingress/egress quality, highway proximity)
- topography (flat, sloped, rolling, etc.)
- flood_zone (zone designation if stated)
- environmental_flag (any Phase I, contamination, wetlands concerns)
- nearby_development (brief: what is being built or recently built nearby)
- land_notes

Rules:
- Only include fields that are reasonably supported by the OM
- Use null for unknown values
- Do not speculate about entitlement probability
- Capture utility and power mentions exactly and conservatively
- Keep land_notes concise and practical`;

// ===== Broker pattern regex =====
const brokerPatterns =
  /\b(realty|brokerage|advisors|capital|partners|group|associates|investments|commercial|cushman|cbre|jll|marcus\s*&\s*millichap|colliers|newmark|berkadia|kw\s+commercial|lee\s*&\s*associates|svn|nai|coldwell|century\s*21|keller\s+williams|re\/max|sotheby|loopnet)\b/i;

/**
 * Core parsing engine for CRE documents.
 * Extracts property facts across three stages: extraction, underwriting/analysis, and asset-specific addons.
 * Returns structured data suitable for database storage and UI rendering.
 */
export async function runParseEngine(params: {
  projectId?: string;
  propertyId?: string;
  userId: string;
  documentText: string;
  analysisType?: string;
}): Promise<{
  success: boolean;
  runId: string;
  fieldsExtracted: number;
  brief: string;
  fields: any;
  stages: any;
  error?: string;
}> {
  try {
    const {
      projectId,
      propertyId,
      userId,
      documentText,
      analysisType = "retail",
    } = params;

    if (!userId || !documentText) {
      return {
        success: false,
        runId: "",
        fieldsExtracted: 0,
        brief: "",
        fields: {},
        stages: {},
        error: "Missing userId or documentText",
      };
    }

    const db = getAdminDb();
    const now = new Date().toISOString();
    const isLand = analysisType === "land";

    // Create parser run
    const runRef = await db.collection("workspace_parser_runs").add({
      projectId: projectId || "workspace-default",
      triggeredByUserId: userId,
      runStatus: "running",
      startedAt: now,
      parserVersion: "5.1-multi-asset",
      filesProcessedCount: 1,
      fieldsExtractedCount: 0,
      warningCount: 0,
      errorCount: 0,
      stage: "extracting",
    });

    // ===== STAGE 1: Extract raw facts =====
    console.log(
      `[parser] Stage 1: Extracting facts (${analysisType})...`
    );
    const stage1Prompt = isLand ? STAGE1_LAND_PROMPT : STAGE1_PROMPT;
    const stage1UserMsg = isLand
      ? `Extract ALL facts from this land property document.
IMPORTANT:
- "name" = the PROPERTY name, site name, or street address — NOT the broker/agent/firm name.
- "broker" = the listing agent or brokerage company — separate field.
Return JSON only.\n\n${documentText.substring(0, 40000)}`
      : `Extract ALL facts from this CRE property document.
IMPORTANT:
- "name" = the PROPERTY name or street address, NOT the broker/agent/firm name.
- "broker" = the listing agent or brokerage company — separate field.
- "land_acres" = total site/lot acreage — look for "acres", "site size", "lot size", even on improved buildings.
- Include EVERY tenant.
Return JSON only.\n\n${documentText.substring(0, 40000)}`;

    const stage1Response = await callOpenAI(
      [
        { role: "system", content: stage1Prompt },
        { role: "user", content: stage1UserMsg },
      ],
      12000
    );

    let stage1: any;
    try {
      const jsonMatch = stage1Response.match(/\{[\s\S]*\}/);
      stage1 = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(stage1Response);
    } catch {
      console.error(
        "[parser] Stage 1 JSON parse failed:",
        stage1Response.substring(0, 300)
      );
      stage1 = { brief: stage1Response };
    }

    console.log(
      "[parser] Stage 1 complete:",
      JSON.stringify(
        isLand
          ? {
              name: stage1.property?.name,
              acres: stage1.property?.total_acres,
              zoning: stage1.zoning?.current_zoning,
              price: stage1.pricing?.asking_price,
            }
          : {
              name: stage1.property?.name,
              tenants: stage1.tenants?.length || 0,
              hasIncome: !!stage1.income,
              hasExpenses: !!stage1.expenses,
            }
      )
    );

    // ===== CROSS-CHECK: Validate extracted data quality (ALL asset types) =====
    const xcheckWarnings: string[] = [];
    {
      const prop = stage1.property || {};

      // Check 1: property name vs broker contamination
      if (prop.name && prop.broker) {
        const nameLower = (prop.name || "").toLowerCase();
        const brokerLower = (prop.broker || "").toLowerCase();
        const brokerFirstWord = brokerLower.split(/\s+/)[0];
        if (brokerFirstWord.length > 3 && nameLower.includes(brokerFirstWord)) {
          xcheckWarnings.push(
            `CROSS-CHECK: Property name "${prop.name}" may contain broker info ("${prop.broker}"). Will use address if available.`
          );
          if (prop.address) {
            console.log(
              `[parser] Cross-check fix: Replacing name "${prop.name}" with address "${prop.address}"`
            );
            stage1.property.name = prop.address;
          }
        }
      }

      // Check 2: name matches known broker/firm patterns
      if (prop.name && brokerPatterns.test(prop.name)) {
        xcheckWarnings.push(
          `CROSS-CHECK: Property name "${prop.name}" matches brokerage pattern. Will use address if available.`
        );
        if (prop.address) {
          stage1.property.name = prop.address;
        }
      }

      // Check 3: property name is suspiciously short or generic
      if (
        prop.name &&
        (prop.name.length < 4 ||
          /^(the\s+)?(property|building|site|subject|offering|land|parcel|tract)$/i.test(
            prop.name
          ))
      ) {
        xcheckWarnings.push(
          `CROSS-CHECK: Property name "${prop.name}" is generic. Will prefer address.`
        );
        if (prop.address) stage1.property.name = prop.address;
      }

      // Check 4: address extracted but no name
      if (!prop.name && prop.address) {
        xcheckWarnings.push(
          `CROSS-CHECK: No property name found. Using address "${prop.address}" as name.`
        );
        stage1.property.name = prop.address;
      }

      // Check 5: missing lot acreage for industrial/office
      if (
        (analysisType === "industrial" || analysisType === "office") &&
        !prop.land_acres
      ) {
        xcheckWarnings.push(
          `CROSS-CHECK: No lot_acres extracted for ${analysisType} property. Will attempt recovery in Stage 3 addon.`
        );
      }

      // Check 6: land-specific — missing acreage
      if (isLand && !prop.total_acres && !prop.usable_acres) {
        xcheckWarnings.push(
          `CROSS-CHECK: No acreage found for land property. Critical data missing.`
        );
      }

      // Check 7: missing asking price (all types)
      const price = isLand
        ? stage1.pricing?.asking_price
        : stage1.pricing?.asking_price;
      if (!price) {
        xcheckWarnings.push(
          `CROSS-CHECK: No asking_price extracted. Pricing analysis will be limited.`
        );
      }

      // Check 8: address sanity — should contain a number or known road word
      if (
        prop.address &&
        !/\d/.test(prop.address) &&
        !/\b(road|street|avenue|blvd|drive|lane|way|highway|hwy|pkwy|ct|circle)\b/i.test(
          prop.address
        )
      ) {
        xcheckWarnings.push(
          `CROSS-CHECK: Address "${prop.address}" may not be a real street address.`
        );
      }

      // Check 9: name and address are identical (redundant but not an error)
      if (
        prop.name &&
        prop.address &&
        prop.name.toLowerCase().trim() === prop.address.toLowerCase().trim()
      ) {
        xcheckWarnings.push(
          `CROSS-CHECK: Property name and address are identical ("${prop.name}"). Normal for address-based naming.`
        );
      }
    }
    if (xcheckWarnings.length > 0) {
      console.warn(
        `[parser] Cross-check (${analysisType}): ${xcheckWarnings.length} warnings:`,
        xcheckWarnings
      );
      await runRef.update({
        warningCount: xcheckWarnings.length,
        crossCheckWarnings: xcheckWarnings,
      });
    }

    // Update run status
    await runRef.update({ stage: "calculating" });

    // ===== STAGE 2: Calculate / Analyze =====
    console.log(
      `[parser] Stage 2: ${
        isLand ? "Analyzing land deal" : "Calculating underwriting"
      }...`
    );
    const stage2Prompt = isLand ? STAGE2_LAND_PROMPT : STAGE2_PROMPT;

    const stage2Input = isLand
      ? JSON.stringify({
          property: stage1.property,
          pricing: stage1.pricing,
          zoning: stage1.zoning,
          utilities: stage1.utilities,
          access: stage1.access,
          environmental: stage1.environmental,
          improvements: stage1.improvements,
        })
      : JSON.stringify({
          property: stage1.property,
          pricing: stage1.pricing,
          income: stage1.income,
          expenses: stage1.expenses,
          tenants: stage1.tenants,
        });

    const stage2Response = await callOpenAI(
      [
        { role: "system", content: stage2Prompt },
        {
          role: "user",
          content: `${
            isLand ? "Analyze this land deal" : "Calculate complete underwriting"
          } from these extracted facts:\n\n${stage2Input}`,
        },
      ],
      8000
    );

    let stage2: any;
    try {
      const jsonMatch = stage2Response.match(/\{[\s\S]*\}/);
      stage2 = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(stage2Response);
    } catch {
      console.error(
        "[parser] Stage 2 JSON parse failed:",
        stage2Response.substring(0, 300)
      );
      stage2 = {};
    }

    console.log(
      "[parser] Stage 2 complete:",
      JSON.stringify({
        hasSignals: !!stage2.signals,
        validationChecks: stage2.validation?.length || 0,
        ...(isLand
          ? { hasSiteAssessment: !!stage2.site_assessment }
          : { hasDebt: !!stage2.debt }),
      })
    );

    // ===== STAGE 3: Asset-type-specific addon extraction (non-retail only) =====
    if (analysisType && analysisType !== "retail") {
      const addonPrompts: Record<string, string> = {
        industrial: INDUSTRIAL_ADDON_PROMPT,
        office: OFFICE_ADDON_PROMPT,
        land: LAND_ADDON_PROMPT,
      };

      const addonPrompt = addonPrompts[analysisType];
      if (addonPrompt) {
        try {
          console.log(
            `[parser] Stage 3: Extracting ${analysisType} addon fields...`
          );
          const apiKey = process.env.OPENAI_API_KEY;
          const addonResponse = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4o",
                temperature: 0.1,
                max_tokens: 2000,
                messages: [
                  { role: "system", content: addonPrompt },
                  {
                    role: "user",
                    content: `Document text:\n${documentText.slice(0, 8000)}`,
                  },
                ],
              }),
            }
          );

          if (addonResponse.ok) {
            const addonData = await addonResponse.json();
            const addonRaw = addonData.choices?.[0]?.message?.content || "";
            const addonJson = addonRaw
              .replace(/```json?\s*/g, "")
              .replace(/```/g, "")
              .trim();
            const addonFields = JSON.parse(addonJson);

            // Save addon fields to extracted_fields collection
            const addonFieldsToSave = Object.entries(addonFields)
              .filter(([_, v]) => v !== null && v !== undefined)
              .map(([key, value]) => ({
                projectId: projectId || "workspace-default",
                propertyId: propertyId || "",
                documentId: "addon-extraction",
                fieldGroup: `${analysisType}_addons`,
                fieldName: key,
                rawValue: String(value),
                normalizedValue: typeof value === "number" ? value : String(value),
                confidenceScore: 0.7,
                extractionMethod: "ai_addon",
                isUserConfirmed: false,
                isUserOverridden: false,
                createdAt: now,
                updatedAt: now,
              }));

            if (addonFieldsToSave.length > 0) {
              for (const field of addonFieldsToSave) {
                const fieldRef = db.collection("workspace_extracted_fields").doc();
                await fieldRef.set(field);
              }
              console.log(
                `[parser] Saved ${addonFieldsToSave.length} ${analysisType} addon fields`
              );
            }

            // If addon found lot_acres that Stage 1 missed, backfill it
            if (addonFields.lot_acres && !stage1.property?.land_acres) {
              console.log(
                `[parser] Backfilling lot_acres from ${analysisType} addon: ${addonFields.lot_acres}`
              );
              if (!stage1.property) stage1.property = {};
              stage1.property.land_acres = addonFields.lot_acres;
              // Also save to property_basics for scoring/display
              const backfillRef = db
                .collection("workspace_extracted_fields")
                .doc();
              await backfillRef.set({
                projectId: projectId || "workspace-default",
                propertyId: propertyId || "",
                documentId: "addon-backfill",
                fieldGroup: "property_basics",
                fieldName: "land_acres",
                rawValue: String(addonFields.lot_acres),
                normalizedValue: addonFields.lot_acres,
                confidenceScore: 0.7,
                extractionMethod: "ai_addon_backfill",
                isUserConfirmed: false,
                isUserOverridden: false,
                createdAt: now,
                updatedAt: now,
              });
            }
          } else {
            console.warn(
              `[parser] ${analysisType} addon extraction API returned ${addonResponse.status}`
            );
          }
        } catch (addonErr) {
          console.warn(
            `[parser] ${analysisType} addon extraction failed:`,
            addonErr
          );
          // Non-blocking — addon failure should not fail the main parse
        }
      }
    }

    // ===== Save to Firestore =====
    let fieldCount = 0;
    const batch = db.batch();

    function saveField(
      group: string,
      name: string,
      value: any,
      confidence = 0.8,
      source = "calculated"
    ) {
      if (value === null || value === undefined || value === "") return;
      const fieldRef = db.collection("workspace_extracted_fields").doc();
      const fieldData: Record<string, any> = {
        projectId: projectId || "workspace-default",
        documentId: "",
        fieldGroup: group,
        fieldName: name,
        rawValue: String(value),
        normalizedValue: value,
        confidenceScore: confidence,
        extractionMethod: "openai_gpt4o_v5_two_stage",
        sourceLocator: source,
        isUserConfirmed: false,
        isUserOverridden: false,
        createdAt: now,
        updatedAt: now,
      };
      if (propertyId) fieldData.propertyId = propertyId;
      batch.set(fieldRef, fieldData);
      fieldCount++;
    }

    if (isLand) {
      // ===== LAND-SPECIFIC FIELD SAVING =====
      const p = stage1.property || {};
      saveField("property_basics", "property_name", p.name, 0.95, "confirmed");
      saveField("property_basics", "address", p.address, 0.95, "confirmed");
      saveField("property_basics", "city", p.city, 0.95, "confirmed");
      saveField("property_basics", "state", p.state, 0.95, "confirmed");
      saveField("property_basics", "zip", p.zip, 0.9, "confirmed");
      saveField("property_basics", "county", p.county, 0.9, "confirmed");
      saveField(
        "property_basics",
        "asset_type",
        p.asset_type || "land",
        0.95,
        "confirmed"
      );
      saveField(
        "property_basics",
        "lot_acres",
        p.total_acres,
        0.9,
        "confirmed"
      );
      saveField(
        "property_basics",
        "usable_acres",
        p.usable_acres,
        0.85,
        "confirmed"
      );
      saveField(
        "property_basics",
        "lot_dimensions",
        p.lot_dimensions,
        0.8,
        "confirmed"
      );
      saveField(
        "property_basics",
        "frontage_ft",
        p.frontage_ft,
        0.8,
        "confirmed"
      );
      saveField("property_basics", "topography", p.topography, 0.8, "confirmed");
      saveField("property_basics", "flood_zone", p.flood_zone, 0.8, "confirmed");
      saveField("property_basics", "traffic", p.traffic, 0.8, "confirmed");
      saveField("property_basics", "broker", p.broker, 0.9, "confirmed");

      // Land pricing
      const pr = { ...(stage1.pricing || {}), ...(stage2.pricing || {}) };
      saveField(
        "pricing_deal_terms",
        "asking_price",
        pr.asking_price,
        0.95,
        "confirmed"
      );
      saveField(
        "pricing_deal_terms",
        "price_per_acre",
        pr.price_per_acre,
        0.9,
        "calculated"
      );
      saveField(
        "pricing_deal_terms",
        "price_per_sf",
        pr.price_per_sf,
        0.85,
        "calculated"
      );
      saveField(
        "pricing_deal_terms",
        "pricing_signal",
        pr.pricing_signal,
        0.8,
        "calculated"
      );

      // Zoning
      const z = stage1.zoning || {};
      saveField("land_zoning", "current_zoning", z.current_zoning, 0.9, "confirmed");
      saveField(
        "land_zoning",
        "zoning_description",
        z.zoning_description,
        0.8,
        "confirmed"
      );
      saveField("land_zoning", "planned_use", z.planned_use, 0.85, "confirmed");
      saveField("land_zoning", "entitled", z.entitled, 0.8, "confirmed");
      saveField(
        "land_zoning",
        "entitlement_status",
        z.entitlement_status,
        0.8,
        "confirmed"
      );
      saveField(
        "land_zoning",
        "permitted_uses",
        z.permitted_uses,
        0.8,
        "confirmed"
      );
      saveField(
        "land_zoning",
        "density_allowed",
        z.density_allowed,
        0.8,
        "confirmed"
      );
      saveField("land_zoning", "far_allowed", z.far_allowed, 0.8, "confirmed");
      saveField("land_zoning", "height_limit", z.height_limit, 0.8, "confirmed");

      // Utilities
      const u = stage1.utilities || {};
      saveField("land_utilities", "water", u.water, 0.8, "confirmed");
      saveField("land_utilities", "sewer", u.sewer, 0.8, "confirmed");
      saveField("land_utilities", "electric", u.electric, 0.8, "confirmed");
      saveField("land_utilities", "gas", u.gas, 0.8, "confirmed");
      saveField("land_utilities", "utilities_notes", u.utilities_notes, 0.8, "confirmed");
      saveField("land_utilities", "power_proximity", u.power_proximity, 0.8, "confirmed");
      saveField("land_utilities", "fiber_available", u.fiber_available, 0.7, "confirmed");

      // Access
      const a = stage1.access || {};
      saveField("land_access", "road_access", a.road_access, 0.85, "confirmed");
      saveField(
        "land_access",
        "highway_proximity",
        a.highway_proximity,
        0.8,
        "confirmed"
      );
      saveField(
        "land_access",
        "frontage_description",
        a.frontage_description,
        0.8,
        "confirmed"
      );
      saveField("land_access", "access_points", a.access_points, 0.8, "confirmed");
      saveField("land_access", "rail_access", a.rail_access, 0.7, "confirmed");

      // Environmental
      const env = stage1.environmental || {};
      saveField(
        "land_environmental",
        "phase1_complete",
        env.phase1_complete,
        0.8,
        "confirmed"
      );
      saveField(
        "land_environmental",
        "environmental_notes",
        env.environmental_notes,
        0.8,
        "confirmed"
      );
      saveField(
        "land_environmental",
        "soil_conditions",
        env.soil_conditions,
        0.7,
        "confirmed"
      );
      saveField(
        "land_environmental",
        "wetlands",
        env.wetlands,
        0.7,
        "confirmed"
      );

      // Site assessment (from Stage 2)
      const sa = stage2.site_assessment || {};
      saveField(
        "land_assessment",
        "development_readiness",
        sa.development_readiness,
        0.8,
        "calculated"
      );
      saveField(
        "land_assessment",
        "highest_best_use",
        sa.highest_and_best_use,
        0.8,
        "calculated"
      );
      saveField(
        "land_assessment",
        "entitlement_risk",
        sa.entitlement_risk,
        0.8,
        "calculated"
      );

      // Land signals
      const s = stage2.signals || {};
      saveField("signals", "overall_signal", s.overall || "", 0.8);
      saveField("signals", "pricing_signal", s.pricing || "", 0.8);
      saveField("signals", "location_signal", s.location || "", 0.8);
      saveField("signals", "zoning_signal", s.zoning || "", 0.8);
      saveField("signals", "utilities_signal", s.utilities || "", 0.8);
      saveField("signals", "access_signal", s.access || "", 0.8);
      saveField("signals", "recommendation", s.recommendation || "", 0.8);
    } else {
      // ===== INCOME PROPERTY FIELD SAVING (retail, industrial, office) =====

      // Merge stage 1 + stage 2
      const parsed = {
        property: stage1.property || {},
        pricing: { ...(stage1.pricing || {}), ...(stage2.pricing || {}) },
        income: { ...(stage1.income || {}), ...(stage2.income || {}) },
        expenses: { ...(stage1.expenses || {}), ...(stage2.expenses || {}) },
        debt: stage2.debt || {},
        breakeven: stage2.breakeven || {},
        exit: stage2.exit || {},
        tenants: stage1.tenants || [],
        signals: stage2.signals || {},
        validation: stage2.validation || [],
      };

      // Save property fields
      if (parsed.property) {
        const p = parsed.property;
        saveField("property_basics", "property_name", p.name, 0.95, "confirmed");
        saveField("property_basics", "address", p.address, 0.95, "confirmed");
        saveField("property_basics", "city", p.city, 0.95, "confirmed");
        saveField("property_basics", "state", p.state, 0.95, "confirmed");
        saveField("property_basics", "zip", p.zip, 0.9, "confirmed");
        saveField("property_basics", "county", p.county, 0.9, "confirmed");
        saveField("property_basics", "asset_type", p.asset_type, 0.9, "confirmed");
        saveField("property_basics", "year_built", p.year_built, 0.9, "confirmed");
        saveField("property_basics", "renovated", p.renovated, 0.85, "confirmed");
        saveField("property_basics", "building_sf", p.gla_sf, 0.95, "confirmed");
        saveField("property_basics", "occupancy_pct", p.occupancy_pct, 0.95, "confirmed");
        saveField("property_basics", "tenant_count", p.tenant_count, 0.9, "confirmed");
        saveField("property_basics", "land_acres", p.land_acres, 0.8, "confirmed");
        saveField("property_basics", "lot_dimensions", p.lot_dimensions, 0.8, "confirmed");
        saveField("property_basics", "parking_count", p.parking, 0.8, "confirmed");
        saveField("property_basics", "traffic", p.traffic, 0.8, "confirmed");
        saveField("property_basics", "wale_years", p.wale_years, 0.85, "calculated");
        saveField("property_basics", "broker", p.broker, 0.9, "confirmed");
        saveField("property_basics", "vacancy_status", p.vacancy_status, 0.85, "confirmed");
        saveField("property_basics", "building_count", p.building_count, 0.8, "confirmed");
        saveField("property_basics", "lease_rate", p.lease_rate, 0.8, "confirmed");
      }

      // Save pricing
      if (parsed.pricing) {
        const pr = parsed.pricing;
        saveField(
          "pricing_deal_terms",
          "asking_price",
          pr.asking_price,
          0.95,
          "confirmed"
        );
        saveField(
          "pricing_deal_terms",
          "price_per_sf",
          pr.price_per_sf,
          0.9,
          "calculated"
        );
        saveField(
          "pricing_deal_terms",
          "lease_rate_monthly",
          pr.lease_rate_monthly,
          0.85,
          "confirmed"
        );
        saveField(
          "pricing_deal_terms",
          "cap_rate_om",
          pr.entry_cap_om,
          0.9,
          "calculated"
        );
        saveField(
          "pricing_deal_terms",
          "cap_rate_adjusted",
          pr.entry_cap_adjusted,
          0.85,
          "calculated"
        );
        saveField(
          "pricing_deal_terms",
          "basis_signal",
          pr.basis_signal,
          0.8,
          "calculated"
        );
      }

      // Save income
      if (parsed.income) {
        const inc = parsed.income;
        saveField("income", "base_rent", inc.base_rent, 0.9, "confirmed");
        saveField(
          "income",
          "nnn_reimbursements",
          inc.nnn_reimbursements,
          0.9,
          "confirmed"
        );
        saveField(
          "income",
          "other_income",
          inc.other_income,
          0.85,
          "confirmed"
        );
        saveField(
          "income",
          "gross_scheduled_income",
          inc.potential_gross_income || inc.total_income,
          0.9,
          "calculated"
        );
        saveField(
          "income",
          "vacancy_allowance",
          inc.vacancy_allowance,
          0.8,
          "calculated"
        );
        saveField(
          "income",
          "effective_gross_income",
          inc.effective_gross_income,
          0.85,
          "calculated"
        );
        saveField("income", "rent_per_sf", inc.rent_per_sf, 0.85, "calculated");
      }

      // Save expenses
      if (parsed.expenses) {
        const exp = parsed.expenses;
        saveField("expenses", "cam_expenses", exp.cam, 0.9, "confirmed");
        saveField(
          "expenses",
          "property_taxes",
          exp.real_estate_taxes,
          0.9,
          "confirmed"
        );
        saveField("expenses", "insurance", exp.insurance, 0.9, "confirmed");
        saveField(
          "expenses",
          "management_fee",
          exp.management_fee || exp.management_fee_stated,
          0.7,
          "calculated"
        );
        saveField(
          "expenses",
          "total_expenses",
          exp.total_expenses || exp.total_expenses_stated,
          0.85,
          "calculated"
        );
        saveField(
          "expenses",
          "noi_om",
          exp.noi_om || exp.noi_stated,
          0.9,
          "confirmed"
        );
        saveField(
          "expenses",
          "noi_adjusted",
          exp.noi_adjusted,
          0.85,
          "calculated"
        );
        saveField(
          "expenses",
          "noi",
          exp.noi_adjusted || exp.noi_om || exp.noi_stated,
          0.85,
          "calculated"
        );
        saveField(
          "expenses",
          "noi_per_sf",
          exp.noi_per_sf,
          0.85,
          "calculated"
        );
      }

      // Save debt
      if (parsed.debt) {
        const d = parsed.debt;
        saveField(
          "debt_assumptions",
          "ltv",
          d.ltv || 65,
          0.7,
          "assumed"
        );
        saveField(
          "debt_assumptions",
          "interest_rate",
          d.interest_rate || 7.25,
          0.7,
          "assumed"
        );
        saveField(
          "debt_assumptions",
          "amortization_years",
          d.amort_years || 25,
          0.7,
          "assumed"
        );
        saveField(
          "debt_assumptions",
          "loan_amount",
          d.loan_amount,
          0.8,
          "calculated"
        );
        saveField(
          "debt_assumptions",
          "equity_required",
          d.equity_required,
          0.8,
          "calculated"
        );
        saveField(
          "debt_assumptions",
          "annual_debt_service",
          d.annual_debt_service,
          0.8,
          "calculated"
        );
        saveField(
          "debt_assumptions",
          "dscr_om",
          d.dscr_om,
          0.8,
          "calculated"
        );
        saveField(
          "debt_assumptions",
          "dscr_adjusted",
          d.dscr_adjusted,
          0.8,
          "calculated"
        );
        saveField(
          "debt_assumptions",
          "dscr",
          d.dscr_om || d.dscr_adjusted,
          0.8,
          "calculated"
        );
        saveField(
          "debt_assumptions",
          "debt_yield",
          d.debt_yield,
          0.8,
          "calculated"
        );
        saveField(
          "returns",
          "cash_on_cash_om",
          d.cash_on_cash_om,
          0.8,
          "calculated"
        );
        saveField(
          "returns",
          "cash_on_cash_adjusted",
          d.cash_on_cash_adjusted,
          0.8,
          "calculated"
        );
        saveField(
          "returns",
          "cash_on_cash",
          d.cash_on_cash_om || d.cash_on_cash_adjusted,
          0.8,
          "calculated"
        );
      }

      // Save breakeven
      if (parsed.breakeven) {
        const b = parsed.breakeven;
        saveField(
          "returns",
          "breakeven_occupancy",
          b.breakeven_occupancy,
          0.8,
          "calculated"
        );
        saveField(
          "returns",
          "breakeven_rent_per_sf",
          b.breakeven_rent_per_sf,
          0.8,
          "calculated"
        );
        saveField(
          "returns",
          "noi_for_1x_dscr",
          b.noi_for_1x_dscr,
          0.8,
          "calculated"
        );
        saveField(
          "returns",
          "noi_for_1_35x_dscr",
          b.noi_for_1_35x_dscr,
          0.8,
          "calculated"
        );
      }

      // Save signals
      if (parsed.signals) {
        const s = parsed.signals;
        saveField(
          "signals",
          "overall_signal",
          `${s.overall_emoji || ""} ${s.overall || ""}`.trim(),
          0.8
        );
        saveField(
          "signals",
          "cap_rate_signal",
          `${s.cap_rate_emoji || ""} ${s.cap_rate || ""}`.trim(),
          0.8
        );
        saveField(
          "signals",
          "dscr_signal",
          `${s.dscr_emoji || ""} ${s.dscr || ""}`.trim(),
          0.8
        );
        saveField(
          "signals",
          "occupancy_signal",
          `${s.occupancy_emoji || ""} ${s.occupancy || ""}`.trim(),
          0.8
        );
        saveField(
          "signals",
          "basis_signal",
          `${s.basis_emoji || ""} ${s.basis || ""}`.trim(),
          0.8
        );
        saveField(
          "signals",
          "tenant_quality_signal",
          `${s.tenant_quality_emoji || ""} ${s.tenant_quality || ""}`.trim(),
          0.8
        );
        saveField(
          "signals",
          "rollover_signal",
          `${s.rollover_emoji || ""} ${s.rollover_risk || ""}`.trim(),
          0.8
        );
        saveField("signals", "recommendation", s.recommendation, 0.8);
      }

      // Save validation results
      if (parsed.validation && Array.isArray(parsed.validation)) {
        for (let i = 0; i < parsed.validation.length; i++) {
          saveField(
            "validation",
            `check_${i + 1}`,
            parsed.validation[i],
            0.9,
            "calculated"
          );
        }
      }

      // Save tenant data
      if (parsed.tenants && Array.isArray(parsed.tenants)) {
        for (let i = 0; i < parsed.tenants.length; i++) {
          const t = parsed.tenants[i];
          saveField("rent_roll", `tenant_${i + 1}_name`, t.name, 0.9, "confirmed");
          saveField("rent_roll", `tenant_${i + 1}_sf`, t.sf, 0.9, "confirmed");
          saveField(
            "rent_roll",
            `tenant_${i + 1}_rent`,
            t.annual_rent,
            0.9,
            "confirmed"
          );
          saveField(
            "rent_roll",
            `tenant_${i + 1}_monthly_rent`,
            t.monthly_rent,
            0.85,
            "calculated"
          );
          saveField(
            "rent_roll",
            `tenant_${i + 1}_rent_psf`,
            t.rent_per_sf,
            0.85,
            "calculated"
          );
          saveField(
            "rent_roll",
            `tenant_${i + 1}_lease_start`,
            t.lease_start,
            0.9,
            "confirmed"
          );
          saveField(
            "rent_roll",
            `tenant_${i + 1}_lease_end`,
            t.lease_end,
            0.9,
            "confirmed"
          );
          saveField(
            "rent_roll",
            `tenant_${i + 1}_extension`,
            t.extension,
            0.85,
            "confirmed"
          );
          saveField(
            "rent_roll",
            `tenant_${i + 1}_type`,
            t.lease_type,
            0.9,
            "confirmed"
          );
          saveField(
            "rent_roll",
            `tenant_${i + 1}_status`,
            t.status,
            0.85,
            "confirmed"
          );
        }
        if (parsed.tenants[0]) {
          saveField(
            "rent_roll",
            "anchor_tenant",
            parsed.tenants[0].name,
            0.9,
            "confirmed"
          );
          saveField(
            "rent_roll",
            "num_tenants",
            parsed.tenants.length,
            0.9,
            "confirmed"
          );
        }
      }
    }

    // Save validation (land uses stage2.validation directly)
    if (isLand && stage2.validation && Array.isArray(stage2.validation)) {
      for (let i = 0; i < stage2.validation.length; i++) {
        saveField(
          "validation",
          `check_${i + 1}`,
          stage2.validation[i],
          0.9,
          "calculated"
        );
      }
    }

    if (fieldCount > 0) {
      await batch.commit();
    }

    // Save brief as pinned note
    const brief = stage1.brief || "";
    if (brief && propertyId) {
      try {
        await db.collection("workspace_notes").add({
          projectId: projectId || "workspace-default",
          propertyId,
          userId,
          noteType: "investment_thesis",
          title: isLand
            ? "First-Pass Land Analysis Brief"
            : "First-Pass Investment Brief",
          content: brief,
          isPinned: true,
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        /* non-blocking */
      }
    }

    // Update parser run
    await runRef.update({
      runStatus: fieldCount > 0 ? "completed" : "completed_with_warnings",
      completedAt: new Date().toISOString(),
      fieldsExtractedCount: fieldCount,
      stage: "complete",
      validationResults: stage2.validation || [],
    });

    // Update property record
    if (propertyId) {
      try {
        const propUpdate: Record<string, any> = {
          parseStatus: fieldCount > 0 ? "parsed" : "needs_review",
          analysisType,
          updatedAt: new Date().toISOString(),
        };

        const propData = stage1.property || {};
        let propName = propData.name;
        const propAddress = propData.address;
        const propCity = propData.city;
        const propState = propData.state;
        const propZip = propData.zip;
        const propBroker = propData.broker;

        // ===== SAFETY NET: Double-check property name (cross-check may have already fixed stage1.property.name) =====
        const nameIsBrokerLike =
          propName &&
          (brokerPatterns.test(propName) ||
            (propBroker &&
              propName.toLowerCase().includes(propBroker.toLowerCase().split(/\s+/)[0])) ||
            (propBroker &&
              propBroker
                .toLowerCase()
                .includes(propName.toLowerCase().split(/\s+/)[0]) &&
              propName.length < 30));

        // If name looks like broker info, replace with address
        if (nameIsBrokerLike && propAddress) {
          console.log(
            `[parser] Cross-check: Property name "${propName}" looks like broker info. Using address: "${propAddress}"`
          );
          propName = propAddress;
        }

        // If no name extracted, try address, then first meaningful line
        if (!propName || propName === "Unknown Property") {
          if (propAddress && propAddress !== "Unknown Address") {
            propName = propAddress;
          } else if (documentText) {
            const firstLine = documentText
              .split("\n")
              .find((line: string) => {
                const trimmed = line.trim();
                return (
                  trimmed.length > 5 &&
                  trimmed.length < 80 &&
                  !trimmed.startsWith("---") &&
                  !trimmed.startsWith("===") &&
                  !brokerPatterns.test(trimmed) &&
                  !/^(confidential|offering|memorandum|prepared|presented|exclusively)/i.test(
                    trimmed
                  )
                );
              });
            if (firstLine) propName = firstLine.trim().substring(0, 100);
          }
        }

        if (propName && propName !== "Unknown Property")
          propUpdate.propertyName = propName;
        if (propAddress && propAddress !== "Unknown Address")
          propUpdate.address1 = propAddress;
        if (propCity && propCity !== "Unknown City") propUpdate.city = propCity;
        if (propState) propUpdate.state = propState;
        if (propZip) propUpdate.zip = propZip;

        if (isLand) {
          if (propData.total_acres) propUpdate.totalAcres = propData.total_acres;
          if (propData.usable_acres)
            propUpdate.usableAcres = propData.usable_acres;
        } else {
          if (propData.gla_sf) propUpdate.buildingSf = propData.gla_sf;
          if (propData.occupancy_pct)
            propUpdate.occupancyPct = propData.occupancy_pct;
          // Save lot size for all asset types (industrial/office often have lot acreage)
          if (propData.land_acres) propUpdate.landAcres = propData.land_acres;
          if (propData.vacancy_status)
            propUpdate.vacancyStatus = propData.vacancy_status;
          if (propData.building_count)
            propUpdate.buildingCount = propData.building_count;
          if (propData.lease_rate) propUpdate.leaseRate = propData.lease_rate;
        }

        await db
          .collection("workspace_properties")
          .doc(propertyId)
          .update(propUpdate);
      } catch (err: any) {
        console.error("Property update failed:", err?.message);
      }
    }

    return {
      success: true,
      runId: runRef.id,
      fieldsExtracted: fieldCount,
      brief: brief,
      fields: isLand
        ? {
            property: stage1.property,
            pricing: { ...(stage1.pricing || {}), ...(stage2.pricing || {}) },
            zoning: stage1.zoning,
            utilities: stage1.utilities,
            access: stage1.access,
            environmental: stage1.environmental,
            site_assessment: stage2.site_assessment,
            signals: stage2.signals,
            validation: stage2.validation,
          }
        : {
            property: stage1.property,
            pricing: { ...(stage1.pricing || {}), ...(stage2.pricing || {}) },
            income: { ...(stage1.income || {}), ...(stage2.income || {}) },
            expenses: {
              ...(stage1.expenses || {}),
              ...(stage2.expenses || {}),
            },
            debt: stage2.debt,
            breakeven: stage2.breakeven,
            exit: stage2.exit,
            tenants: stage1.tenants,
            signals: stage2.signals,
            validation: stage2.validation,
          },
      stages: { extraction: "complete", calculation: "complete" },
    };
  } catch (error: any) {
    console.error("Parser error:", error);
    return {
      success: false,
      runId: "",
      fieldsExtracted: 0,
      brief: "",
      fields: {},
      stages: {},
      error: error.message || "Parser failed. Try again.",
    };
  }
}
