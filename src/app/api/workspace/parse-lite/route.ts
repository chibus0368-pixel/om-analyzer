import { NextRequest, NextResponse } from "next/server";

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
// IDENTICAL to pro version — same prompt, same output shape
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

"signals" - For each: text description + emoji (\u{1F7E2}\u{1F7E1}\u{1F534})
  overall, cap_rate (>8%=\u{1F7E2}, 7-8%=\u{1F7E1}, <7%=\u{1F534}), dscr (>1.35x=\u{1F7E2}, 1.2-1.35x=\u{1F7E1}, <1.2x=\u{1F534}), occupancy (>90%=\u{1F7E2}, 80-90%=\u{1F7E1}, <80%=\u{1F534}), basis (<$120=\u{1F7E2}, $120-170=\u{1F7E1}, >$170=\u{1F534}), tenant_quality, rollover_risk, recommendation

"validation" - array of strings, each a check:
  - "GLA check: [tenant SF sum] vs [stated GLA] \u2014 [PASS/MISMATCH]"
  - "NOI check: EGI - expenses = [calculated] vs stated [stated] \u2014 [PASS/MISMATCH]"
  - "Cap rate check: NOI/price = [calculated]% vs stated [stated]% \u2014 [PASS/MISMATCH]"
  - "DSCR check: NOI/DS = [calculated] \u2014 [PASS/BELOW TARGET]"
  - "Rent/SF check: base_rent/GLA = [calculated] \u2014 [REASONABLE/LOW/HIGH]"

Return valid JSON only. All numbers as plain numbers.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentText, fileName } = body;

    if (!documentText || documentText.trim().length < 50) {
      return NextResponse.json({ error: "Document text too short or missing" }, { status: 400 });
    }

    // ===== STAGE 1: Extract raw facts =====
    console.log("[parse-lite] Stage 1: Extracting facts from", fileName);
    const stage1Response = await callOpenAI([
      { role: "system", content: STAGE1_PROMPT },
      { role: "user", content: `Extract ALL facts from this CRE property document. IMPORTANT: Extract the actual property name and full address. Include EVERY tenant. Return JSON only.\n\n${documentText.substring(0, 40000)}` },
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
    console.log("[parse-lite] Stage 2: Calculating underwriting...");
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
      console.error("[parse-lite] Stage 2 JSON parse failed");
      stage2 = {};
    }

    // ===== Build response — identical shape to pro property page =====
    const prop = stage1.property || {};
    const pricing = { ...(stage1.pricing || {}), ...(stage2.pricing || {}) };
    const income = { ...(stage1.income || {}), ...(stage2.income || {}) };
    const expenses = { ...(stage1.expenses || {}), ...(stage2.expenses || {}) };
    const debt = stage2.debt || {};
    const breakeven = stage2.breakeven || {};
    const exit = stage2.exit || {};
    const signals = stage2.signals || {};
    const validation = stage2.validation || [];

    // Signals come as strings with emoji (🟢🟡🔴) — same as pro
    const formattedSignals: Record<string, string> = {};
    for (const [key, val] of Object.entries(signals)) {
      if (val && typeof val === "object") {
        formattedSignals[key] = (val as any).text || String(val);
      } else if (typeof val === "string") {
        formattedSignals[key] = val;
      }
    }

    // Format tenants
    const tenants = (stage1.tenants || []).map((t: any, i: number) => ({
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

    // Build result in field-group format matching pro property page expectations
    const result = {
      propertyName: prop.name || fileName?.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") || "Property",
      address: prop.address,
      city: prop.city,
      state: prop.state,
      zip: prop.zip,
      county: prop.county,
      assetType: prop.asset_type,
      yearBuilt: prop.year_built,
      renovated: prop.renovated,
      buildingSf: prop.gla_sf,
      landAcres: prop.land_acres,
      occupancyPct: prop.occupancy_pct,
      tenantCount: prop.tenant_count || String(tenants.length),
      wale: prop.wale_years,
      parking: prop.parking,
      traffic: prop.traffic,
      broker: prop.broker,
      brief: stage1.brief || "",

      // Pricing & deal terms
      askingPrice: pricing.asking_price,
      pricePerSf: pricing.price_per_sf,
      capRateOm: pricing.entry_cap_om,
      capRateAdjusted: pricing.entry_cap_adjusted,
      basisSignal: pricing.basis_signal,

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

      // Signals — raw strings with emoji, identical to pro
      signals: formattedSignals,

      // Validation checks
      validation,

      // Tenants — full detail
      tenants,
    };

    console.log("[parse-lite] Complete:", prop.name, "—", tenants.length, "tenants");

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[parse-lite] Error:", error);
    return NextResponse.json({ error: error.message || "Analysis failed" }, { status: 500 });
  }
}
