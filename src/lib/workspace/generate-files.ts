// Client-side file generation for XLSX underwriting and brief downloads
// Uses SheetJS (loaded from CDN) for Excel generation

import type { ExtractedField, Note } from "./types";

let XLSX: any = null;

async function loadSheetJS(): Promise<any> {
  if (XLSX) return XLSX;
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject("Not in browser");
    if ((window as any).XLSX) { XLSX = (window as any).XLSX; return resolve(XLSX); }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => { XLSX = (window as any).XLSX; resolve(XLSX); };
    script.onerror = () => reject("Failed to load SheetJS");
    document.head.appendChild(script);
  });
}

function getField(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

function fmt$(val: any): string {
  if (val === null || val === undefined) return "";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(val: any): string {
  if (val === null || val === undefined) return "";
  return Number(val).toFixed(2) + "%";
}

export async function generateUnderwritingXLSX(propertyName: string, fields: ExtractedField[]): Promise<void> {
  const xlsx = await loadSheetJS();
  const wb = xlsx.utils.book_new();
  const g = (group: string, name: string) => getField(fields, group, name);

  // Helper: use raw numbers where possible so Excel can format them
  const num = (val: any): number | string => {
    if (val === null || val === undefined || val === "") return "";
    const n = Number(val);
    return isNaN(n) ? String(val) : n;
  };
  const pct = (val: any): string => {
    if (!val) return "";
    const n = Number(val);
    return isNaN(n) ? String(val) : (n / 100).toFixed(4);
  };

  // === Sheet 1: Inputs ===
  const inputs = [
    [`${propertyName} — UNDERWRITING`, "", ""],
    [g("property_basics", "address") || "", "", ""],
    ["", "", ""],
    ["PROPERTY INFORMATION", "", "Notes"],
    ["Property Name", propertyName, ""],
    ["Address", g("property_basics", "address") || "", "Confirmed from OM"],
    ["City / State", `${g("property_basics", "city") || ""}, ${g("property_basics", "state") || ""}`, ""],
    ["County", g("property_basics", "county") || "", ""],
    ["Asset Type", g("property_basics", "asset_type") || "", ""],
    ["Year Built", num(g("property_basics", "year_built")), ""],
    ["Renovated", g("property_basics", "renovated") || "", ""],
    ["GLA (SF)", num(g("property_basics", "building_sf")), ""],
    ["Occupancy", num(g("property_basics", "occupancy_pct")) ? num(g("property_basics", "occupancy_pct")) + "%" : "", ""],
    ["Tenants", num(g("property_basics", "tenant_count")), ""],
    ["WALE", g("property_basics", "wale_years") ? g("property_basics", "wale_years") + " years" : "", ""],
    ["Traffic", g("property_basics", "traffic") || "", ""],
    ["Broker", g("property_basics", "broker") || "", ""],
    ["", "", ""],
    ["KEY ASSUMPTIONS", "", "Notes"],
    ["Purchase Price", num(g("pricing_deal_terms", "asking_price")), "Asking price per OM"],
    ["Closing Cost %", "2%", "Assumed 2%"],
    ["Closing Costs", num(g("pricing_deal_terms", "closing_costs")), ""],
    ["Immediate CapEx", num(g("pricing_deal_terms", "capex")) || 0, ""],
    ["Total Basis", "", ""],
    ["Basis / SF", g("pricing_deal_terms", "price_per_sf") ? "$" + Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2) : "", ""],
    ["", "", ""],
    ["FINANCING ASSUMPTIONS", "", "Notes"],
    ["LTV", (num(g("debt_assumptions", "ltv")) || 65) + "%", "Assumed 65%"],
    ["Interest Rate", (num(g("debt_assumptions", "interest_rate")) || 7.25) + "%", "Assumed 7.25%"],
    ["Amortization (Yrs)", num(g("debt_assumptions", "amortization_years")) || 25, "25-yr"],
    ["Loan Amount", num(g("debt_assumptions", "loan_amount")), ""],
    ["Equity Required", num(g("debt_assumptions", "equity_required")), ""],
    ["", "", ""],
    ["EXPENSE ASSUMPTIONS", "", "Notes"],
    ["Management Fee %", (num(g("expenses", "management_pct")) || 6) + "%", "Our standard 6%"],
    ["Reserves ($/SF)", "$" + (num(g("expenses", "reserves_per_sf")) || 0.25), "$0.25/SF"],
    ["Vacancy Allowance %", "5%", "Applied unless stated"],
  ];
  const wsInputs = xlsx.utils.aoa_to_sheet(inputs);
  wsInputs["!cols"] = [{ wch: 25 }, { wch: 30 }, { wch: 30 }];
  xlsx.utils.book_append_sheet(wb, wsInputs, "Inputs");

  // === Sheet 2: Rent Roll ===
  const tenantFields = fields.filter(f => f.fieldGroup === "rent_roll" && f.fieldName.startsWith("tenant_"));
  const tenantMap: Record<string, Record<string, any>> = {};
  for (const f of tenantFields) {
    const match = f.fieldName.match(/^tenant_(\d+)_(.+)$/);
    if (match) {
      const [, num, key] = match;
      if (!tenantMap[num]) tenantMap[num] = {};
      tenantMap[num][key] = f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
    }
  }

  // Calculate totals and metrics
  const tenantList = Object.entries(tenantMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, t]) => t);

  const totalSf = tenantList.reduce((sum, t) => sum + (Number(t.sf) || 0), 0);
  const totalRent = tenantList.reduce((sum, t) => sum + (Number(t.rent) || 0), 0);
  const buildingSf = Number(g("property_basics", "building_sf")) || totalSf;
  const occupancyPct = (totalSf / buildingSf) * 100;
  const avgRentPerSf = totalSf > 0 ? totalRent / totalSf : 0;

  const rentRoll = [
    [`RENT ROLL — ${propertyName}`],
    ["Tenant", "SF", "% GLA", "Monthly Rent", "Annual Rent", "Rent/SF", "Lease Type", "Start", "End", "Extension", "Status"],
  ];

  for (const t of tenantList) {
    const pctGla = buildingSf > 0 ? ((Number(t.sf) || 0) / buildingSf * 100).toFixed(1) : "0";
    const monthlyRent = t.monthly_rent || (Number(t.rent) || 0) / 12;
    rentRoll.push([
      t.name,
      t.sf,
      pctGla + "%",
      fmt$(monthlyRent),
      fmt$(t.rent),
      t.rent_psf ? "$" + Number(t.rent_psf).toFixed(2) : "",
      t.type,
      t.lease_start || "",
      t.lease_end || "",
      t.extension || "",
      t.status || "",
    ]);
  }

  if (tenantList.length === 0) {
    rentRoll.push(["No tenant data extracted"]);
  } else {
    rentRoll.push(["", "", "", "", "", "", "", "", "", "", ""]);
    rentRoll.push(["TOTALS", String(totalSf), occupancyPct.toFixed(1) + "%", fmt$(totalRent / 12), fmt$(totalRent), "$" + avgRentPerSf.toFixed(2), "", "", "", "", ""]);

    rentRoll.push(["", "", "", "", "", "", "", "", "", "", ""]);
    rentRoll.push(["SUMMARY METRICS", "", "", "", "", "", "", "", "", "", ""]);
    rentRoll.push(["Total GLA (SF)", String(totalSf), "", "", "", "", "", "", "", "", ""]);
    rentRoll.push(["Occupancy %", occupancyPct.toFixed(1) + "%", "", "", "", "", "", "", "", "", ""]);
    rentRoll.push(["Total Annual Rent", fmt$(totalRent), "", "", "", "", "", "", "", "", ""]);
    rentRoll.push(["Avg Rent / SF", "$" + avgRentPerSf.toFixed(2), "", "", "", "", "", "", "", "", ""]);
    rentRoll.push(["Price / SF", g("pricing_deal_terms", "price_per_sf") ? "$" + Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2) : "", "", "", "", "", "", "", "", "", ""]);
  }

  const wsRent = xlsx.utils.aoa_to_sheet(rentRoll);
  wsRent["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }];
  xlsx.utils.book_append_sheet(wb, wsRent, "Rent Roll");

  // === Sheet 3: Operating Statement ===
  const opStatement = [
    [`OPERATING STATEMENT — ${propertyName}`],
    ["", ""],
    ["INCOME", ""],
    ["Base Rent", fmt$(g("income", "base_rent"))],
    ["NNN Reimbursements", fmt$(g("income", "nnn_reimbursements"))],
    ["Gross Scheduled Income", fmt$(g("income", "gross_scheduled_income"))],
    ["Vacancy Allowance", fmt$(g("income", "vacancy_allowance"))],
    ["Effective Gross Income (EGI)", fmt$(g("income", "effective_gross_income"))],
    ["", ""],
    ["OPERATING EXPENSES", ""],
    ["Real Estate Taxes", fmt$(g("expenses", "property_taxes"))],
    ["Insurance", fmt$(g("expenses", "insurance"))],
    ["CAM", fmt$(g("expenses", "cam_expenses"))],
    ["Management Fee", fmt$(g("expenses", "management_fee"))],
    ["Reserves", fmt$(g("expenses", "reserves"))],
    ["Total Operating Expenses", fmt$(g("expenses", "total_expenses"))],
    ["", ""],
    ["NET OPERATING INCOME (NOI)", ""],
    ["NOI (OM)", fmt$(g("expenses", "noi_om"))],
    ["NOI (Adjusted)", fmt$(g("expenses", "noi_adjusted"))],
    ["NOI / SF", g("expenses", "noi_per_sf") ? "$" + Number(g("expenses", "noi_per_sf")).toFixed(2) : ""],
    ["", ""],
    ["COMPARISON TO OM", ""],
    ["Variance", fmt$(g("expenses", "noi_adjusted") ? Number(g("expenses", "noi_adjusted")) - Number(g("expenses", "noi_om")) : 0)],
  ];
  const wsOp = xlsx.utils.aoa_to_sheet(opStatement);
  wsOp["!cols"] = [{ wch: 30 }, { wch: 25 }];
  xlsx.utils.book_append_sheet(wb, wsOp, "Operating Statement");

  // === Sheet 4: Debt & Returns ===
  const noi = g("expenses", "noi_adjusted") || g("expenses", "noi_om");
  const dscr = g("debt_assumptions", "dscr_adjusted") || g("debt_assumptions", "dscr_om");
  const debtReturns = [
    [`DEBT & RETURNS — ${propertyName}`],
    ["", ""],
    ["DEBT SERVICE", ""],
    ["Loan Amount", fmt$(g("debt_assumptions", "loan_amount"))],
    ["Interest Rate %", fmtPct(g("debt_assumptions", "interest_rate")) || "7.25%"],
    ["Amortization (Yrs)", g("debt_assumptions", "amortization_years") || "25"],
    ["Annual Debt Service", fmt$(g("debt_assumptions", "annual_debt_service"))],
    ["", ""],
    ["KEY RETURN METRICS", ""],
    ["NOI (Adjusted)", fmt$(noi)],
    ["Annual Cash Flow", fmt$(g("returns", "annual_cash_flow") || (Number(noi) - Number(g("debt_assumptions", "annual_debt_service"))))],
    ["Equity Required", fmt$(g("pricing_deal_terms", "equity_required"))],
    ["DSCR", (dscr ? Number(dscr).toFixed(2) : "") + "x"],
    ["Cash-on-Cash Return %", fmtPct(g("returns", "cash_on_cash_adjusted") || g("returns", "cash_on_cash_om"))],
    ["Debt Yield %", fmtPct(g("debt_assumptions", "debt_yield"))],
    ["Entry Cap Rate %", fmtPct(g("pricing_deal_terms", "cap_rate_adjusted") || g("pricing_deal_terms", "cap_rate_om"))],
    ["", ""],
    ["SIGNAL ASSESSMENT", ""],
    ["Overall Signal", g("signals", "overall_signal")],
    ["Cap Rate Signal", g("signals", "cap_rate_signal")],
    ["DSCR Signal", g("signals", "dscr_signal")],
    ["Occupancy Signal", g("signals", "occupancy_signal")],
    ["Basis Signal", g("signals", "basis_signal")],
    ["Tenant Quality Signal", g("signals", "tenant_quality_signal")],
    ["Recommendation", g("signals", "recommendation")],
  ];
  const wsDebt = xlsx.utils.aoa_to_sheet(debtReturns);
  wsDebt["!cols"] = [{ wch: 30 }, { wch: 25 }];
  xlsx.utils.book_append_sheet(wb, wsDebt, "Debt & Returns");

  // === Sheet 5: Breakeven ===
  const breakeven = [
    [`BREAKEVEN ANALYSIS — ${propertyName}`],
    ["", ""],
    ["BREAKEVEN THRESHOLDS", ""],
    ["NOI Required for 1.0x DSCR", fmt$(g("returns", "noi_for_1x_dscr"))],
    ["NOI Required for 1.2x DSCR", fmt$(g("returns", "noi_for_1_2x_dscr"))],
    ["NOI Required for 1.35x DSCR", fmt$(g("returns", "noi_for_1_35x_dscr"))],
    ["Breakeven Occupancy %", fmtPct(g("returns", "breakeven_occupancy"))],
    ["Breakeven Rent / SF", g("returns", "breakeven_rent_per_sf") ? "$" + Number(g("returns", "breakeven_rent_per_sf")).toFixed(2) : ""],
    ["", ""],
    ["STRESS TEST SCENARIOS", ""],
    ["Occupancy Drop 5%", ""],
    ["  Impact on NOI", fmt$(Number(noi) * 0.05 * -1)],
    ["", ""],
    ["Rent/SF Drop 5%", ""],
    ["  Impact on NOI", fmt$(totalRent * 0.05 * -1)],
    ["", ""],
    ["Interest Rate +1%", ""],
    ["  Impact on Debt Service", fmt$(Number(g("debt_assumptions", "loan_amount")) * 0.01)],
  ];
  const wsBreakeven = xlsx.utils.aoa_to_sheet(breakeven);
  wsBreakeven["!cols"] = [{ wch: 30 }, { wch: 25 }];
  xlsx.utils.book_append_sheet(wb, wsBreakeven, "Breakeven");

  // === Sheet 6: Cap Scenarios ===
  const purchasePrice = Number(g("pricing_deal_terms", "asking_price")) || 0;
  const impliedValue = (noi: number, capRate: number) => capRate > 0 ? noi / (capRate / 100) : 0;
  const buildingSquareFeet = Number(g("property_basics", "building_sf")) || buildingSf || 1;

  const capScenarios = [
    [`CAP RATE SCENARIOS — ${propertyName}`],
    ["Entry Cap Rate %", "Implied Value", "Price / SF", "DSCR", "Cash-on-Cash %", "Signal"],
  ];

  for (let capRate = 7; capRate <= 10; capRate += 0.5) {
    const implied = impliedValue(Number(noi), capRate);
    const pricePerSf = buildingSquareFeet > 0 ? (implied / buildingSquareFeet).toFixed(2) : "0.00";
    const newLoanAmt = implied * 0.65;
    const newDebtService = (newLoanAmt * (g("debt_assumptions", "interest_rate") || 7.25) / 100) / (1 - Math.pow(1 + ((g("debt_assumptions", "interest_rate") || 7.25) / 100) / 12, -12 * (g("debt_assumptions", "amortization_years") || 25)));
    const newDscr = Number(noi) / newDebtService;
    const newCoc = ((Number(noi) - newDebtService) / (implied * (1 - 0.65))).toFixed(2);

    let signal = "🔴";
    if (capRate > 8) signal = "🟢";
    else if (capRate >= 7 && capRate <= 8) signal = "🟡";

    capScenarios.push([
      capRate.toFixed(1) + "%",
      fmt$(implied),
      "$" + pricePerSf,
      newDscr.toFixed(2) + "x",
      Number(newCoc).toFixed(2) + "%",
      signal,
    ]);
  }

  const wsCapScenarios = xlsx.utils.aoa_to_sheet(capScenarios);
  wsCapScenarios["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 10 }];
  xlsx.utils.book_append_sheet(wb, wsCapScenarios, "Cap Scenarios");

  // Download
  const safeName = propertyName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  const filename = `${safeName}-Underwriting.xlsx`;
  try {
    xlsx.writeFile(wb, filename);
  } catch {
    // Fallback: create blob and trigger download manually
    const wbout = xlsx.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export function generateBriefDownload(propertyName: string, brief: string, fields: ExtractedField[]): void {
  const g = (group: string, name: string) => getField(fields, group, name);

  const metrics = [
    ["Asking Price", fmt$(g("pricing_deal_terms", "asking_price"))],
    ["Price / SF", g("pricing_deal_terms", "price_per_sf") ? "$" + Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2) + "/SF" : ""],
    ["GLA", g("property_basics", "building_sf") ? Math.round(Number(g("property_basics", "building_sf"))).toLocaleString() + " SF" : ""],
    ["Occupancy", g("property_basics", "occupancy_pct") ? g("property_basics", "occupancy_pct") + "%" : ""],
    ["NOI (OM)", fmt$(g("expenses", "noi_om"))],
    ["NOI (Adjusted)", fmt$(g("expenses", "noi_adjusted"))],
    ["Entry Cap (OM)", g("pricing_deal_terms", "cap_rate_om") ? Number(g("pricing_deal_terms", "cap_rate_om")).toFixed(2) + "%" : ""],
    ["DSCR (OM)", g("debt_assumptions", "dscr_om") ? Number(g("debt_assumptions", "dscr_om")).toFixed(2) + "x" : ""],
    ["DSCR (Adjusted)", g("debt_assumptions", "dscr_adjusted") ? Number(g("debt_assumptions", "dscr_adjusted")).toFixed(2) + "x" : ""],
    ["Cash-on-Cash (OM)", g("returns", "cash_on_cash_om") ? Number(g("returns", "cash_on_cash_om")).toFixed(2) + "%" : ""],
    ["Breakeven Occupancy", g("returns", "breakeven_occupancy") ? Number(g("returns", "breakeven_occupancy")).toFixed(1) + "%" : ""],
    ["Debt Yield", g("debt_assumptions", "debt_yield") ? Number(g("debt_assumptions", "debt_yield")).toFixed(2) + "%" : ""],
    ["Debt Service", fmt$(g("debt_assumptions", "annual_debt_service"))],
  ].filter(([, v]) => v);

  const signals = [
    ["Overall", g("signals", "overall_signal")],
    ["Cap Rate", g("signals", "cap_rate_signal")],
    ["DSCR", g("signals", "dscr_signal")],
    ["Occupancy", g("signals", "occupancy_signal")],
    ["Basis", g("signals", "basis_signal")],
    ["Tenant Quality", g("signals", "tenant_quality_signal")],
    ["Rollover Risk", g("signals", "rollover_signal")],
    ["Recommendation", g("signals", "recommendation")],
  ].filter(([, v]) => v);

  // Build HTML document that Word can open
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; max-width: 7.5in; margin: 0.75in auto; line-height: 1.5; }
  h1 { font-size: 18pt; color: #0B1120; border-bottom: 2px solid #C49A3C; padding-bottom: 8px; margin-top: 0; }
  h2 { font-size: 14pt; color: #253352; margin-top: 24px; margin-bottom: 8px; }
  h3 { font-size: 12pt; color: #5A7091; margin-top: 16px; margin-bottom: 6px; }
  p { margin: 6px 0; }
  .subtitle { font-size: 9pt; color: #8899B0; font-style: italic; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }
  th { background: #F6F8FB; text-align: left; padding: 6px 10px; border: 1px solid #D8DFE9; font-weight: 600; color: #5A7091; }
  td { padding: 5px 10px; border: 1px solid #D8DFE9; }
  .metric-val { font-weight: 600; }
  .signal-green { color: #059669; }
  .signal-yellow { color: #D97706; }
  .signal-red { color: #DC2626; }
  .brief-text { margin: 12px 0; }
  .brief-text p { margin: 8px 0; line-height: 1.6; }
</style></head><body>
<h1>First-Pass Underwriting Brief</h1>
<h2>${propertyName}</h2>
<p class="subtitle">This is a first-pass underwriting screen based on the provided documents and clearly labeled assumptions. Directional assessment only — not a final investment model.</p>

<h2>Initial Assessment</h2>
<div class="brief-text">${(brief || "No brief generated.").split("\n").map(p => p.trim() ? `<p>${p}</p>` : "").join("")}</div>

<h2>Key Metrics</h2>
<table>
<tr><th>Metric</th><th>Value</th></tr>
${metrics.map(([label, val]) => `<tr><td>${label}</td><td class="metric-val">${val}</td></tr>`).join("\n")}
</table>

<h2>Signal Assessment</h2>
<table>
<tr><th>Category</th><th>Signal</th></tr>
${signals.map(([label, val]) => {
    let cls = "";
    if (String(val).includes("🟢") || String(val).toLowerCase().includes("green")) cls = "signal-green";
    else if (String(val).includes("🟡") || String(val).toLowerCase().includes("yellow")) cls = "signal-yellow";
    else if (String(val).includes("🔴") || String(val).toLowerCase().includes("red")) cls = "signal-red";
    return `<tr><td>${label}</td><td class="${cls}">${val}</td></tr>`;
  }).join("\n")}
</table>

<p class="subtitle" style="margin-top: 24px;">Generated by NNNTripleNet OM Analyzer</p>
</body></html>`;

  // Download as .doc (HTML format that Word opens natively)
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = propertyName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  a.href = url;
  a.download = `${safeName}-First-Pass-Brief.doc`;
  a.click();
  URL.revokeObjectURL(url);
}
