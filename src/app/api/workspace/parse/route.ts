import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

// Allow up to 120 seconds for two-stage parsing
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

// ===== STAGE 1: Extract raw facts from document =====
const STAGE1_PROMPT = `You are a CRE document parser. Extract ALL facts from this property document. Return JSON only.

Extract these sections:

"property" - name, address, city, state, zip, county, asset_type, year_built, renovated, gla_sf (integer), land_acres, occupancy_pct (0-100), tenant_count, wale_years, parking, traffic (use HIGHEST count for the property's road — format "XX,XXX AADT on [road name]"), broker

"pricing" - asking_price (integer), price_per_sf

"income" - base_rent, nnn_reimbursements, other_income, total_income

"expenses" - cam, real_estate_taxes, insurance, management_fee_stated, other_expenses, total_expenses_stated, noi_stated

"tenants" - CRITICAL: Include EVERY single tenant. Each needs: name, sf, annual_rent, monthly_rent, rent_per_sf, reimb, lease_type, lease_start, lease_end, extension, status, notes (under 20 words)

"brief" - Write 2 concise paragraphs about THIS property. Direct acquisitions tone.

RULES:
- Extract ONLY what the document states. Do not calculate or assume.
- Numbers as plain numbers (8900000 not "$8,900,000")
- Use null for missing data
- Include EVERY tenant — do not skip or truncate`;

// ===== STAGE 2: Calculate underwriting from extracted facts =====
const STAGE2_PROMPT = `You are a CRE underwriting calculator. Given extracted property facts, calculate a complete first-pass underwriting.

Use these assumptions unless the data states otherwise:
- LTV: 65%, Interest Rate: 7.25%, Amortization: 25 years
- Vacancy allowance: 5% of gross income (unless actual vacancy exists)
- Management fee: 6% of EGI
- Reserves: $0.25/SF
- Exit cap: 8.5%, Hold period: 5 years

Calculate and return JSON with:

"pricing" - price_per_sf (price/gla), entry_cap_om (noi_stated/price*100), entry_cap_adjusted (noi_adjusted/price*100), basis_signal (Green <$120/SF, Yellow $120-170, Red >$170)

"income" - potential_gross_income, vacancy_allowance, effective_gross_income, rent_per_sf (base_rent/gla)

"expenses" - management_fee (6% of EGI), reserves (0.25*gla), total_expenses, noi_om (using stated expenses), noi_adjusted (using our expenses), noi_per_sf

"debt" - loan_amount (price*0.65), equity_required, annual_debt_service, monthly_payment, dscr_om (noi_om/ds), dscr_adjusted (noi_adjusted/ds), debt_yield (noi/loan*100), cash_on_cash_om, cash_on_cash_adjusted

"breakeven" - noi_for_1x_dscr (=debt_service), noi_for_1_2x_dscr, noi_for_1_35x_dscr, breakeven_occupancy, breakeven_rent_per_sf

"exit" - exit_value (noi_adjusted/0.085), exit_cap_rate (8.5), hold_years (5), selling_costs_pct (4)

"signals" - For each: text description + emoji (🟢🟡🔴)
  overall, cap_rate (>8%=🟢, 7-8%=🟡, <7%=🔴), dscr (>1.35x=🟢, 1.2-1.35x=🟡, <1.2x=🔴), occupancy (>90%=🟢, 80-90%=🟡, <80%=🔴), basis (<$120=🟢, $120-170=🟡, >$170=🔴), tenant_quality, rollover_risk, recommendation

"validation" - array of strings, each a check:
  - "GLA check: [tenant SF sum] vs [stated GLA] — [PASS/MISMATCH]"
  - "NOI check: EGI - expenses = [calculated] vs stated [stated] — [PASS/MISMATCH]"
  - "Cap rate check: NOI/price = [calculated]% vs stated [stated]% — [PASS/MISMATCH]"
  - "DSCR check: NOI/DS = [calculated] — [PASS/BELOW TARGET]"
  - "Rent/SF check: base_rent/GLA = [calculated] — [REASONABLE/LOW/HIGH]"

Return valid JSON only. All numbers as plain numbers.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, propertyId, userId, documentText } = body;

    if (!userId || !documentText) {
      return NextResponse.json({ error: "Missing userId or documentText" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = new Date().toISOString();

    // Create parser run
    const runRef = await db.collection("workspace_parser_runs").add({
      projectId: projectId || "workspace-default",
      triggeredByUserId: userId,
      runStatus: "running",
      startedAt: now,
      parserVersion: "5.0-two-stage",
      filesProcessedCount: 1,
      fieldsExtractedCount: 0,
      warningCount: 0,
      errorCount: 0,
      stage: "extracting",
    });

    // ===== STAGE 1: Extract raw facts =====
    console.log("[parser] Stage 1: Extracting facts...");
    const stage1Response = await callOpenAI([
      { role: "system", content: STAGE1_PROMPT },
      { role: "user", content: `Extract ALL facts from this CRE property document. IMPORTANT: Extract the actual property name and full address. Include EVERY tenant. Return JSON only.\n\n${documentText.substring(0, 40000)}` },
    ], 12000);

    let stage1: any;
    try {
      const jsonMatch = stage1Response.match(/\{[\s\S]*\}/);
      stage1 = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(stage1Response);
    } catch {
      console.error("[parser] Stage 1 JSON parse failed:", stage1Response.substring(0, 300));
      stage1 = { brief: stage1Response };
    }

    console.log("[parser] Stage 1 complete:", JSON.stringify({
      name: stage1.property?.name,
      tenants: stage1.tenants?.length || 0,
      hasIncome: !!stage1.income,
      hasExpenses: !!stage1.expenses,
    }));

    // Update run status
    await runRef.update({ stage: "calculating" });

    // ===== STAGE 2: Calculate underwriting =====
    console.log("[parser] Stage 2: Calculating underwriting...");
    const stage2Input = JSON.stringify({
      property: stage1.property,
      pricing: stage1.pricing,
      income: stage1.income,
      expenses: stage1.expenses,
      tenants: stage1.tenants,
    });

    const stage2Response = await callOpenAI([
      { role: "system", content: STAGE2_PROMPT },
      { role: "user", content: `Calculate complete underwriting from these extracted facts:\n\n${stage2Input}` },
    ], 8000);

    let stage2: any;
    try {
      const jsonMatch = stage2Response.match(/\{[\s\S]*\}/);
      stage2 = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(stage2Response);
    } catch {
      console.error("[parser] Stage 2 JSON parse failed:", stage2Response.substring(0, 300));
      stage2 = {};
    }

    console.log("[parser] Stage 2 complete:", JSON.stringify({
      hasDebt: !!stage2.debt,
      hasSignals: !!stage2.signals,
      validationChecks: stage2.validation?.length || 0,
    }));

    // ===== Merge stage 1 + stage 2 =====
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
      brief: stage1.brief || "",
      validation: stage2.validation || [],
    };

    // ===== Save to Firestore =====
    let fieldCount = 0;
    const batch = db.batch();

    function saveField(group: string, name: string, value: any, confidence = 0.8, source = "calculated") {
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
      saveField("property_basics", "parking_count", p.parking, 0.8, "confirmed");
      saveField("property_basics", "traffic", p.traffic, 0.8, "confirmed");
      saveField("property_basics", "wale_years", p.wale_years, 0.85, "calculated");
      saveField("property_basics", "broker", p.broker, 0.9, "confirmed");
    }

    // Save pricing
    if (parsed.pricing) {
      const pr = parsed.pricing;
      saveField("pricing_deal_terms", "asking_price", pr.asking_price, 0.95, "confirmed");
      saveField("pricing_deal_terms", "price_per_sf", pr.price_per_sf, 0.9, "calculated");
      saveField("pricing_deal_terms", "cap_rate_om", pr.entry_cap_om, 0.9, "calculated");
      saveField("pricing_deal_terms", "cap_rate_adjusted", pr.entry_cap_adjusted, 0.85, "calculated");
      saveField("pricing_deal_terms", "basis_signal", pr.basis_signal, 0.8, "calculated");
    }

    // Save income
    if (parsed.income) {
      const inc = parsed.income;
      saveField("income", "base_rent", inc.base_rent, 0.9, "confirmed");
      saveField("income", "nnn_reimbursements", inc.nnn_reimbursements, 0.9, "confirmed");
      saveField("income", "other_income", inc.other_income, 0.85, "confirmed");
      saveField("income", "gross_scheduled_income", inc.potential_gross_income || inc.total_income, 0.9, "calculated");
      saveField("income", "vacancy_allowance", inc.vacancy_allowance, 0.8, "calculated");
      saveField("income", "effective_gross_income", inc.effective_gross_income, 0.85, "calculated");
      saveField("income", "rent_per_sf", inc.rent_per_sf, 0.85, "calculated");
    }

    // Save expenses
    if (parsed.expenses) {
      const exp = parsed.expenses;
      saveField("expenses", "cam_expenses", exp.cam, 0.9, "confirmed");
      saveField("expenses", "property_taxes", exp.real_estate_taxes, 0.9, "confirmed");
      saveField("expenses", "insurance", exp.insurance, 0.9, "confirmed");
      saveField("expenses", "management_fee", exp.management_fee || exp.management_fee_stated, 0.7, "calculated");
      saveField("expenses", "total_expenses", exp.total_expenses || exp.total_expenses_stated, 0.85, "calculated");
      saveField("expenses", "noi_om", exp.noi_om || exp.noi_stated, 0.9, "confirmed");
      saveField("expenses", "noi_adjusted", exp.noi_adjusted, 0.85, "calculated");
      saveField("expenses", "noi", exp.noi_adjusted || exp.noi_om || exp.noi_stated, 0.85, "calculated");
      saveField("expenses", "noi_per_sf", exp.noi_per_sf, 0.85, "calculated");
    }

    // Save debt
    if (parsed.debt) {
      const d = parsed.debt;
      saveField("debt_assumptions", "ltv", d.ltv || 65, 0.7, "assumed");
      saveField("debt_assumptions", "interest_rate", d.interest_rate || 7.25, 0.7, "assumed");
      saveField("debt_assumptions", "amortization_years", d.amort_years || 25, 0.7, "assumed");
      saveField("debt_assumptions", "loan_amount", d.loan_amount, 0.8, "calculated");
      saveField("debt_assumptions", "equity_required", d.equity_required, 0.8, "calculated");
      saveField("debt_assumptions", "annual_debt_service", d.annual_debt_service, 0.8, "calculated");
      saveField("debt_assumptions", "dscr_om", d.dscr_om, 0.8, "calculated");
      saveField("debt_assumptions", "dscr_adjusted", d.dscr_adjusted, 0.8, "calculated");
      saveField("debt_assumptions", "dscr", d.dscr_om || d.dscr_adjusted, 0.8, "calculated");
      saveField("debt_assumptions", "debt_yield", d.debt_yield, 0.8, "calculated");
      saveField("returns", "cash_on_cash_om", d.cash_on_cash_om, 0.8, "calculated");
      saveField("returns", "cash_on_cash_adjusted", d.cash_on_cash_adjusted, 0.8, "calculated");
      saveField("returns", "cash_on_cash", d.cash_on_cash_om || d.cash_on_cash_adjusted, 0.8, "calculated");
    }

    // Save breakeven
    if (parsed.breakeven) {
      const b = parsed.breakeven;
      saveField("returns", "breakeven_occupancy", b.breakeven_occupancy, 0.8, "calculated");
      saveField("returns", "breakeven_rent_per_sf", b.breakeven_rent_per_sf, 0.8, "calculated");
      saveField("returns", "noi_for_1x_dscr", b.noi_for_1x_dscr, 0.8, "calculated");
      saveField("returns", "noi_for_1_35x_dscr", b.noi_for_1_35x_dscr, 0.8, "calculated");
    }

    // Save signals
    if (parsed.signals) {
      const s = parsed.signals;
      saveField("signals", "overall_signal", `${s.overall_emoji || ""} ${s.overall || ""}`.trim(), 0.8);
      saveField("signals", "cap_rate_signal", `${s.cap_rate_emoji || ""} ${s.cap_rate || ""}`.trim(), 0.8);
      saveField("signals", "dscr_signal", `${s.dscr_emoji || ""} ${s.dscr || ""}`.trim(), 0.8);
      saveField("signals", "occupancy_signal", `${s.occupancy_emoji || ""} ${s.occupancy || ""}`.trim(), 0.8);
      saveField("signals", "basis_signal", `${s.basis_emoji || ""} ${s.basis || ""}`.trim(), 0.8);
      saveField("signals", "tenant_quality_signal", `${s.tenant_quality_emoji || ""} ${s.tenant_quality || ""}`.trim(), 0.8);
      saveField("signals", "rollover_signal", `${s.rollover_emoji || ""} ${s.rollover_risk || ""}`.trim(), 0.8);
      saveField("signals", "recommendation", s.recommendation, 0.8);
    }

    // Save validation results
    if (parsed.validation && Array.isArray(parsed.validation)) {
      for (let i = 0; i < parsed.validation.length; i++) {
        saveField("validation", `check_${i + 1}`, parsed.validation[i], 0.9, "calculated");
      }
    }

    // Save tenant data
    if (parsed.tenants && Array.isArray(parsed.tenants)) {
      for (let i = 0; i < parsed.tenants.length; i++) {
        const t = parsed.tenants[i];
        saveField("rent_roll", `tenant_${i + 1}_name`, t.name, 0.9, "confirmed");
        saveField("rent_roll", `tenant_${i + 1}_sf`, t.sf, 0.9, "confirmed");
        saveField("rent_roll", `tenant_${i + 1}_rent`, t.annual_rent, 0.9, "confirmed");
        saveField("rent_roll", `tenant_${i + 1}_monthly_rent`, t.monthly_rent, 0.85, "calculated");
        saveField("rent_roll", `tenant_${i + 1}_rent_psf`, t.rent_per_sf, 0.85, "calculated");
        saveField("rent_roll", `tenant_${i + 1}_lease_start`, t.lease_start, 0.9, "confirmed");
        saveField("rent_roll", `tenant_${i + 1}_lease_end`, t.lease_end, 0.9, "confirmed");
        saveField("rent_roll", `tenant_${i + 1}_extension`, t.extension, 0.85, "confirmed");
        saveField("rent_roll", `tenant_${i + 1}_type`, t.lease_type, 0.9, "confirmed");
        saveField("rent_roll", `tenant_${i + 1}_status`, t.status, 0.85, "confirmed");
      }
      if (parsed.tenants[0]) {
        saveField("rent_roll", "anchor_tenant", parsed.tenants[0].name, 0.9, "confirmed");
        saveField("rent_roll", "num_tenants", parsed.tenants.length, 0.9, "confirmed");
      }
    }

    if (fieldCount > 0) {
      await batch.commit();
    }

    // Save brief as pinned note
    if (parsed.brief && propertyId) {
      try {
        await db.collection("workspace_notes").add({
          projectId: projectId || "workspace-default",
          propertyId,
          userId,
          noteType: "investment_thesis",
          title: "First-Pass Investment Brief",
          content: parsed.brief,
          isPinned: true,
          createdAt: now,
          updatedAt: now,
        });
      } catch { /* non-blocking */ }
    }

    // Update parser run
    await runRef.update({
      runStatus: fieldCount > 0 ? "completed" : "completed_with_warnings",
      completedAt: new Date().toISOString(),
      fieldsExtractedCount: fieldCount,
      stage: "complete",
      validationResults: parsed.validation || [],
    });

    // Update property
    if (propertyId) {
      try {
        const propUpdate: Record<string, any> = {
          parseStatus: fieldCount > 0 ? "parsed" : "needs_review",
          updatedAt: new Date().toISOString(),
        };

        const propName = parsed.property?.name;
        const propAddress = parsed.property?.address;
        const propCity = parsed.property?.city;
        const propState = parsed.property?.state;
        const propZip = parsed.property?.zip;
        const propSf = parsed.property?.gla_sf;
        const propOcc = parsed.property?.occupancy_pct;

        if (!propName && documentText) {
          const firstLine = documentText.split("\n").find((line: string) =>
            line.trim().length > 5 && !line.startsWith("---") && !line.startsWith("===")
          );
          if (firstLine) propUpdate.propertyName = firstLine.trim().substring(0, 100);
        }

        if (propName && propName !== "Unknown Property") propUpdate.propertyName = propName;
        if (propAddress && propAddress !== "Unknown Address") propUpdate.address1 = propAddress;
        if (propCity && propCity !== "Unknown City") propUpdate.city = propCity;
        if (propState) propUpdate.state = propState;
        if (propZip) propUpdate.zip = propZip;
        if (propSf) propUpdate.buildingSf = propSf;
        if (propOcc) propUpdate.occupancyPct = propOcc;

        await db.collection("workspace_properties").doc(propertyId).update(propUpdate);
      } catch (err: any) {
        console.error("Property update failed:", err?.message);
      }
    }

    return NextResponse.json({
      success: true,
      runId: runRef.id,
      fieldsExtracted: fieldCount,
      brief: parsed.brief || "",
      fields: parsed,
      validation: parsed.validation || [],
      stages: { extraction: "complete", calculation: "complete" },
    });
  } catch (error: any) {
    console.error("Parser error:", error);
    return NextResponse.json({ error: error.message || "Parser failed. Try again." }, { status: 500 });
  }
}
