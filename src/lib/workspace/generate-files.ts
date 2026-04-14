// Client-side file generation for XLSX underwriting and brief downloads
// Uses ExcelJS (loaded from CDN) for Excel generation with full styling
// Simplified scenario-model workbook: editable inputs → formula-driven outputs

import type { ExtractedField, Note } from "./types";
import type { AnalysisType } from "./types";

let EJ: any = null;

async function loadExcelJS(): Promise<any> {
  if (EJ) return EJ;
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject("Not in browser");
    if ((window as any).ExcelJS) { EJ = (window as any).ExcelJS; return resolve(EJ); }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    script.onload = () => { EJ = (window as any).ExcelJS; resolve(EJ); };
    script.onerror = () => reject("Failed to load ExcelJS");
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

// ============================================================
// XLSX GENERATION - Scenario Model Workbook
// ============================================================

// Style constants
const navy = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF262C5C" } };
const ltBlue = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFDCE6F1" } };
const yellow = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFCC" } };
const white = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFFF" } };
const ltGreen = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE8F5E9" } };
const hdrFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
const titleFont = { bold: true, color: { argb: "FF262C5C" }, size: 13, name: "Arial" };
const secFont = { bold: true, color: { argb: "FF262C5C" }, size: 10, name: "Arial" };
const labelFont = { bold: false, color: { argb: "FF333333" }, size: 10, name: "Arial" };
const boldLabel = { bold: true, color: { argb: "FF262C5C" }, size: 10, name: "Arial" };
const valFont = { color: { argb: "FF000000" }, size: 10, name: "Arial" };
const inputFont = { bold: true, color: { argb: "FF0000CC" }, size: 10, name: "Arial" };
const noteFont = { color: { argb: "FF888888" }, size: 9, name: "Arial", italic: true };
const redFont = { bold: true, color: { argb: "FFCC0000" }, size: 10, name: "Arial" };
const greenFont = { bold: true, color: { argb: "FF008000" }, size: 10, name: "Arial" };
const thinBorder = { style: "thin" as const, color: { argb: "FFD8DFE9" } };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

// Helper: header row
function hdrRow(ws: any, r: number, vals: string[], widths?: number[]) {
  vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.font = hdrFont; c.fill = navy; c.border = borders; c.alignment = { vertical: "middle" }; });
  if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// Helper: label + value row (static data)
function dataRow(ws: any, r: number, label: string, val: any, note?: string, opts?: { yellow?: boolean; bold?: boolean; red?: boolean; green?: boolean }) {
  const lc = ws.getCell(r, 1); lc.value = label; lc.font = opts?.bold ? boldLabel : labelFont; lc.fill = white; lc.border = borders;
  const vc = ws.getCell(r, 2); vc.value = val ?? ""; vc.font = opts?.red ? redFont : opts?.green ? greenFont : valFont; vc.fill = opts?.yellow ? yellow : ltBlue; vc.border = borders;
  if (note !== undefined) { const nc = ws.getCell(r, 3); nc.value = note; nc.font = noteFont; nc.border = borders; }
}

// Helper: input cell (yellow, editable, returns cell ref like "B5")
function inputRow(ws: any, r: number, label: string, val: any, note?: string, numFmt?: string): string {
  const lc = ws.getCell(r, 1); lc.value = label; lc.font = boldLabel; lc.fill = white; lc.border = borders;
  const vc = ws.getCell(r, 2); vc.value = val; vc.font = inputFont; vc.fill = yellow; vc.border = borders;
  if (numFmt) vc.numFmt = numFmt;
  if (note) { const nc = ws.getCell(r, 3); nc.value = note; nc.font = noteFont; nc.border = borders; }
  return `B${r}`;
}

// Helper: formula cell (light green, computed)
function formulaRow(ws: any, r: number, label: string, formula: string, numFmt: string, note?: string, opts?: { bold?: boolean }): string {
  const lc = ws.getCell(r, 1); lc.value = label; lc.font = opts?.bold ? boldLabel : labelFont; lc.fill = white; lc.border = borders;
  const vc = ws.getCell(r, 2); vc.value = { formula }; vc.font = opts?.bold ? boldLabel : valFont; vc.fill = ltGreen; vc.border = borders;
  if (numFmt) vc.numFmt = numFmt;
  if (note) { const nc = ws.getCell(r, 3); nc.value = note; nc.font = noteFont; nc.border = borders; }
  return `B${r}`;
}

export async function generateUnderwritingXLSX(
  propertyName: string,
  fields: ExtractedField[],
  analysisType: AnalysisType = "retail"
): Promise<void> {
  const exceljs = await loadExcelJS();
  const wb = new exceljs.Workbook();
  const g = (group: string, name: string) => getField(fields, group, name);

  const typeLabel = analysisType === "retail" ? "Retail" : analysisType === "industrial" ? "Industrial" : analysisType === "office" ? "Office" : "Land";
  const loc = [g("property_basics", "address"), g("property_basics", "city"), g("property_basics", "state")].filter(Boolean).join(", ");

  // ================================================================
  // SHEET 1: SCENARIO MODEL - the main interactive sheet
  // ================================================================
  if (analysisType !== "land") {
    const ws = wb.addWorksheet("Scenario Model");
    ws.getColumn(1).width = 30; ws.getColumn(2).width = 22; ws.getColumn(3).width = 32;
    let r = 2;

    // Title
    ws.getCell(r, 1).value = `${propertyName}`; ws.getCell(r, 1).font = titleFont; r++;
    ws.getCell(r, 1).value = `${typeLabel} Underwriting - Scenario Model`; ws.getCell(r, 1).font = { ...noteFont, size: 10 }; r++;
    ws.getCell(r, 1).value = loc; ws.getCell(r, 1).font = noteFont; r++;
    ws.getCell(r, 1).value = "Yellow cells = your inputs. Green cells = formulas (auto-update)."; ws.getCell(r, 1).font = { ...noteFont, bold: true, color: { argb: "FF0000CC" } }; r += 2;

    // ── SECTION: DEAL INPUTS ──
    ws.getCell(r, 1).value = "DEAL INPUTS"; ws.getCell(r, 1).font = secFont; r++;
    hdrRow(ws, r, ["Item", "Value", "Notes"]); r++;

    const askPrice = Number(g("pricing_deal_terms", "asking_price")) || 0;
    const buildSf = Number(g("property_basics", "building_sf")) || 1;
    const noiOm = Number(g("expenses", "noi_om")) || 0;
    const baseRent = Number(g("income", "base_rent")) || 0;
    const nnnReimb = Number(g("income", "nnn_reimbursements")) || 0;
    const camExp = Number(g("expenses", "cam_expenses")) || 0;
    const propTax = Number(g("expenses", "property_taxes")) || 0;
    const insurance = Number(g("expenses", "insurance")) || 0;
    const mgmtFee = Number(g("expenses", "management_fee")) || 0;

    const refPrice = inputRow(ws, r++, "Purchase Price", askPrice, "Change to model scenarios", "$#,##0");
    const refSf = inputRow(ws, r++, "Building SF (GLA)", buildSf, "From OM", "#,##0");
    r++;

    // ── SECTION: INCOME (from OM) ──
    ws.getCell(r, 1).value = "INCOME (from OM)"; ws.getCell(r, 1).font = secFont; r++;
    hdrRow(ws, r, ["Item", "Value", "Notes"]); r++;

    const refBaseRent = inputRow(ws, r++, "Base Rent (Annual)", baseRent, "From OM rent roll", "$#,##0");
    const refReimb = inputRow(ws, r++, "NNN Reimbursements", nnnReimb, "CAM/Tax/Ins reimbursements from OM", "$#,##0");
    const refOtherInc = inputRow(ws, r++, "Other Income", Number(g("income", "other_income")) || 0, "Parking, late fees, etc.", "$#,##0");
    const refVacPct = inputRow(ws, r++, "Vacancy %", 0.05, "Change to stress-test occupancy", "0.0%");
    const refPGI = formulaRow(ws, r++, "Potential Gross Income", `${refBaseRent}+${refReimb}+${refOtherInc}`, "$#,##0", "", { bold: true });
    const refVacancy = formulaRow(ws, r++, "Less: Vacancy", `-${refPGI}*${refVacPct}`, "$#,##0");
    const refEGI = formulaRow(ws, r++, "Effective Gross Income", `${refPGI}+${refVacancy}`, "$#,##0", "", { bold: true });
    r++;

    // ── SECTION: EXPENSES ──
    ws.getCell(r, 1).value = "EXPENSES"; ws.getCell(r, 1).font = secFont; r++;
    hdrRow(ws, r, ["Item", "Value", "Notes"]); r++;

    const refCam = inputRow(ws, r++, "CAM / Common Area", camExp, camExp > 0 ? "From OM" : "Not in OM - enter if known", "$#,##0");
    const refTax = inputRow(ws, r++, "Real Estate Taxes", propTax, propTax > 0 ? "From OM" : "Not in OM - verify with county", "$#,##0");
    const refIns = inputRow(ws, r++, "Insurance", insurance, insurance > 0 ? "From OM" : "Not in OM - get quote", "$#,##0");
    const refMgmt = inputRow(ws, r++, "Management Fee", mgmtFee, mgmtFee > 0 ? "From OM" : "Not in OM - typically 3-6% EGI", "$#,##0");
    const refReserves = inputRow(ws, r++, "Reserves / CapEx", 0, "Annual reserves - enter your estimate", "$#,##0");
    const refOtherExp = inputRow(ws, r++, "Other Expenses", Number(g("expenses", "other_expenses")) || 0, "", "$#,##0");
    const refTotalExp = formulaRow(ws, r++, "Total Expenses", `${refCam}+${refTax}+${refIns}+${refMgmt}+${refReserves}+${refOtherExp}`, "$#,##0", "", { bold: true });
    r++;

    // ── SECTION: NOI ──
    ws.getCell(r, 1).value = "NET OPERATING INCOME"; ws.getCell(r, 1).font = secFont; r++;
    hdrRow(ws, r, ["Item", "Value", "Notes"]); r++;

    dataRow(ws, r++, "NOI (from OM)", noiOm, "What the OM states", { bold: true });
    const refNOI = formulaRow(ws, r++, "NOI (Your Model)", `${refEGI}-${refTotalExp}`, "$#,##0", "Based on your inputs above", { bold: true });
    formulaRow(ws, r++, "NOI / SF", `${refNOI}/${refSf}`, "$#,##0.00");
    r++;

    // ── SECTION: FINANCING ──
    ws.getCell(r, 1).value = "FINANCING"; ws.getCell(r, 1).font = secFont; r++;
    hdrRow(ws, r, ["Item", "Value", "Notes"]); r++;

    const refLTV = inputRow(ws, r++, "LTV %", (Number(g("debt_assumptions", "ltv")) || 65) / 100, "Loan-to-value ratio", "0.0%");
    const refRate = inputRow(ws, r++, "Interest Rate", (Number(g("debt_assumptions", "interest_rate")) || 7.25) / 100, "Annual rate", "0.00%");
    const refAmort = inputRow(ws, r++, "Amortization (Years)", Number(g("debt_assumptions", "amortization_years")) || 25, "", "0");
    const refClosingPct = inputRow(ws, r++, "Closing Cost %", 0.02, "Typically 1.5-3%", "0.0%");

    const refLoan = formulaRow(ws, r++, "Loan Amount", `${refPrice}*${refLTV}`, "$#,##0", "", { bold: true });
    const refClosing = formulaRow(ws, r++, "Closing Costs", `${refPrice}*${refClosingPct}`, "$#,##0");
    const refEquity = formulaRow(ws, r++, "Total Equity Required", `${refPrice}-${refLoan}+${refClosing}`, "$#,##0", "Down payment + closing", { bold: true });
    // Annual debt service: =PMT(rate/12, amort*12, -loan)*12
    const refDS = formulaRow(ws, r++, "Annual Debt Service", `PMT(${refRate}/12,${refAmort}*12,-${refLoan})*12`, "$#,##0", "", { bold: true });
    r++;

    // ── SECTION: RETURNS (all formulas) ──
    ws.getCell(r, 1).value = "RETURNS - ALL CALCULATED"; ws.getCell(r, 1).font = secFont; r++;
    hdrRow(ws, r, ["Metric", "Value", "Notes"]); r++;

    formulaRow(ws, r++, "Cap Rate", `${refNOI}/${refPrice}`, "0.00%", "NOI ÷ Price", { bold: true });
    formulaRow(ws, r++, "Price / SF", `${refPrice}/${refSf}`, "$#,##0");
    const refCashFlow = formulaRow(ws, r++, "Annual Cash Flow", `${refNOI}-${refDS}`, "$#,##0", "NOI − Debt Service");
    formulaRow(ws, r++, "DSCR", `${refNOI}/${refDS}`, "0.00\"x\"", "NOI ÷ Debt Service - target >1.25x", { bold: true });
    formulaRow(ws, r++, "Cash-on-Cash", `${refCashFlow}/${refEquity}`, "0.00%", "Cash Flow ÷ Equity", { bold: true });
    formulaRow(ws, r++, "Debt Yield", `${refNOI}/${refLoan}`, "0.00%", "NOI ÷ Loan - lender metric");
    formulaRow(ws, r++, "Monthly Cash Flow", `${refCashFlow}/12`, "$#,##0");
    r++;

    // ── SECTION: QUICK SCENARIOS ──
    ws.getCell(r, 1).value = "QUICK SCENARIOS - Change price above to see these update"; ws.getCell(r, 1).font = secFont; r++;
    ws.getCell(r, 1).value = "Or reference the discount table below for a quick comparison."; ws.getCell(r, 1).font = noteFont; r++;
    hdrRow(ws, r, ["Discount", "Price", "Cap Rate", "DSCR", "Cash-on-Cash"], [14, 18, 14, 14, 16]); r++;
    ws.getColumn(3).width = Math.max(ws.getColumn(3).width || 0, 14);
    ws.getColumn(4).width = Math.max(ws.getColumn(4).width || 0, 14);
    ws.getColumn(5).width = Math.max(ws.getColumn(5).width || 0, 16);

    for (const pct of [0, 5, 10, 15, 20]) {
      const discPrice = askPrice * (1 - pct / 100);
      const discLoan = discPrice * 0.65;
      const discEquity = discPrice * 0.35 + discPrice * 0.02;
      const mRate = (7.25 / 100) / 12;
      const discDS = discLoan > 0 ? (discLoan * mRate) / (1 - Math.pow(1 + mRate, -300)) * 12 : 0;
      const discCap = discPrice > 0 ? (noiOm / discPrice) * 100 : 0;
      const discDSCR = discDS > 0 ? noiOm / discDS : 0;
      const discCoC = discEquity > 0 ? ((noiOm - discDS) / discEquity) * 100 : 0;

      const vals = [
        pct === 0 ? "Asking" : `−${pct}%`,
        fmt$(discPrice),
        discCap.toFixed(2) + "%",
        discDSCR.toFixed(2) + "x",
        discCoC.toFixed(1) + "%"
      ];
      vals.forEach((v, i) => {
        const c = ws.getCell(r, i + 1); c.value = v; c.border = borders;
        c.font = pct === 0 ? boldLabel : valFont;
        c.fill = pct === 0 ? ltBlue : white;
      });
      r++;
    }
    r++;
    ws.getCell(r, 1).value = "Note: Quick scenarios use OM NOI with default 65% LTV / 7.25% rate. Your model inputs above may differ.";
    ws.getCell(r, 1).font = noteFont;

    // Freeze title rows for better navigation
    ws.views = [{ state: "frozen", ySplit: 5 }];

    // ================================================================
    // NEW SHEET: SENSITIVITY ANALYSIS (price × exit cap matrix)
    // ================================================================
    const wsSens = wb.addWorksheet("Sensitivity");
    let sr = 2;
    wsSens.getColumn(1).width = 26;
    for (let c = 2; c <= 8; c++) wsSens.getColumn(c).width = 14;
    wsSens.getCell(sr, 1).value = `${propertyName} - Sensitivity Analysis`; wsSens.getCell(sr, 1).font = titleFont; sr++;
    wsSens.getCell(sr, 1).value = "Tests how returns change across price and exit cap assumptions."; wsSens.getCell(sr, 1).font = noteFont; sr++;
    wsSens.getCell(sr, 1).value = "Green = strong IRR. Yellow = marginal. Red = below hurdle."; wsSens.getCell(sr, 1).font = noteFont; sr += 2;

    // Assumptions block (local inputs so sheet stands on its own)
    wsSens.getCell(sr, 1).value = "ASSUMPTIONS"; wsSens.getCell(sr, 1).font = secFont; sr++;
    const sensHoldYrs = inputRow(wsSens, sr++, "Hold Period (Years)", 7, "Typical CRE hold", "0");
    const sensNoiGrowth = inputRow(wsSens, sr++, "NOI Growth / Yr", 0.025, "Rent + reimbursement inflation", "0.0%");
    const sensRate = inputRow(wsSens, sr++, "Loan Rate", 0.0725, "", "0.00%");
    const sensAmort = inputRow(wsSens, sr++, "Amort (Years)", 25, "", "0");
    const sensLTV = inputRow(wsSens, sr++, "LTV", 0.65, "", "0.0%");
    const sensSellCosts = inputRow(wsSens, sr++, "Selling Costs % of Exit", 0.025, "Broker fees + closing", "0.0%");
    const sensBaseNOI = inputRow(wsSens, sr++, "Year-1 NOI", noiOm || 0, "From OM or your model", "$#,##0");
    sr += 2;

    // IRR sensitivity table: Price (rows) × Exit Cap (cols)
    wsSens.getCell(sr, 1).value = "10-YEAR UNLEVERED IRR (Price × Exit Cap)"; wsSens.getCell(sr, 1).font = secFont; sr++;
    wsSens.getCell(sr, 1).value = "Find the cell where your assumptions land, then ask: can we live with that IRR?"; wsSens.getCell(sr, 1).font = noteFont; sr++;

    const exitCaps = [0.060, 0.065, 0.070, 0.075, 0.080, 0.085, 0.090];
    const priceMultipliers = [0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10];

    // Header row for exit caps
    const hdrR = sr;
    wsSens.getCell(hdrR, 1).value = "Price \\ Exit Cap"; wsSens.getCell(hdrR, 1).font = hdrFont; wsSens.getCell(hdrR, 1).fill = navy; wsSens.getCell(hdrR, 1).border = borders;
    exitCaps.forEach((cap, i) => {
      const c = wsSens.getCell(hdrR, i + 2);
      c.value = cap; c.numFmt = "0.00%"; c.font = hdrFont; c.fill = navy; c.border = borders;
    });
    sr++;

    // Body rows: one per price multiplier
    for (const pm of priceMultipliers) {
      const discPrice = askPrice * pm;
      wsSens.getCell(sr, 1).value = `${pm === 1.0 ? "Asking" : (pm > 1 ? "+" : "") + Math.round((pm - 1) * 100) + "%"} (${fmt$(discPrice)})`;
      wsSens.getCell(sr, 1).font = pm === 1.0 ? boldLabel : labelFont;
      wsSens.getCell(sr, 1).fill = pm === 1.0 ? ltBlue : white;
      wsSens.getCell(sr, 1).border = borders;

      exitCaps.forEach((cap, i) => {
        const c = wsSens.getCell(sr, i + 2);
        // Approximate IRR formula: ((exit_value / purchase)^(1/yrs) - 1) + yield approximation
        // exit_value = NOI_yr_N / cap * (1 - selling_costs), where NOI_yr_N = NOI * (1+growth)^(yrs-1)
        // Annual unlevered yield = NOI / purchase
        // Simplified unlevered IRR = yield + (exit_value/purchase)^(1/yrs) - 1
        const formula = `(${sensBaseNOI}/${discPrice})+((${sensBaseNOI}*(1+${sensNoiGrowth})^(${sensHoldYrs}-1)/${cap}*(1-${sensSellCosts}))/${discPrice})^(1/${sensHoldYrs})-1`;
        c.value = { formula };
        c.numFmt = "0.0%";
        c.border = borders;
        // Can't conditional-fill with formula values in ExcelJS — leave default fill, user sees % directly
        c.font = valFont;
        c.fill = white;
      });
      sr++;
    }
    sr += 2;
    wsSens.getCell(sr, 1).value = "Formula approximates unlevered IRR using yield + capital appreciation. Levered IRR will be higher with positive leverage.";
    wsSens.getCell(sr, 1).font = noteFont; sr++;
    wsSens.getCell(sr, 1).value = "Industry hurdles: Core ~8-10%, Core+ ~10-13%, Value-Add ~13-18%, Opportunistic 18%+.";
    wsSens.getCell(sr, 1).font = noteFont;

    wsSens.views = [{ state: "frozen", ySplit: 3, xSplit: 1 }];

    // ================================================================
    // NEW SHEET: 10-YEAR CASH FLOW PROJECTION with IRR
    // ================================================================
    const wsCF = wb.addWorksheet("10-Yr Cash Flow");
    let cr = 2;
    wsCF.getColumn(1).width = 32;
    for (let c = 2; c <= 13; c++) wsCF.getColumn(c).width = 14;
    wsCF.getCell(cr, 1).value = `${propertyName} - 10-Year Cash Flow Projection`; wsCF.getCell(cr, 1).font = titleFont; cr++;
    wsCF.getCell(cr, 1).value = "Year-by-year pro forma with exit at Year 10. Yellow cells = inputs. Green cells = formulas."; wsCF.getCell(cr, 1).font = noteFont; cr += 2;

    // Assumptions block
    wsCF.getCell(cr, 1).value = "ASSUMPTIONS"; wsCF.getCell(cr, 1).font = secFont; cr++;
    const cfYrNOI = inputRow(wsCF, cr++, "Year-1 NOI", noiOm || 0, "From your Scenario Model", "$#,##0");
    const cfPrice = inputRow(wsCF, cr++, "Purchase Price", askPrice, "", "$#,##0");
    const cfRentGr = inputRow(wsCF, cr++, "Rent Growth / Yr", 0.025, "Typical CRE 2-3%", "0.0%");
    const cfExpGr = inputRow(wsCF, cr++, "Expense Growth / Yr", 0.030, "Typically outpaces rent growth", "0.0%");
    const cfYr1Exp = inputRow(wsCF, cr++, "Year-1 Operating Expenses", 0, "Leave 0 if NOI is net of expenses", "$#,##0");
    const cfLTV = inputRow(wsCF, cr++, "LTV", 0.65, "", "0.0%");
    const cfRate = inputRow(wsCF, cr++, "Loan Rate", 0.0725, "", "0.00%");
    const cfAmort = inputRow(wsCF, cr++, "Amortization (Yrs)", 25, "", "0");
    const cfExitCap = inputRow(wsCF, cr++, "Exit Cap Rate", 0.075, "Typically 25-50 bps above entry", "0.00%");
    const cfSellCost = inputRow(wsCF, cr++, "Selling Cost % at Exit", 0.025, "Broker + closing", "0.0%");
    const cfClosing = inputRow(wsCF, cr++, "Closing Costs at Purchase", 0.02, "% of price", "0.0%");

    const cfLoan = formulaRow(wsCF, cr++, "Loan Amount", `${cfPrice}*${cfLTV}`, "$#,##0");
    const cfEquity = formulaRow(wsCF, cr++, "Total Equity at Close", `${cfPrice}-${cfLoan}+${cfPrice}*${cfClosing}`, "$#,##0", "Down + closing costs", { bold: true });
    const cfDS = formulaRow(wsCF, cr++, "Annual Debt Service", `PMT(${cfRate}/12,${cfAmort}*12,-${cfLoan})*12`, "$#,##0");
    cr += 2;

    // Year-by-year table
    wsCF.getCell(cr, 1).value = "ANNUAL PROJECTION"; wsCF.getCell(cr, 1).font = secFont; cr++;
    const cfHdr = cr;
    wsCF.getCell(cfHdr, 1).value = "Metric"; wsCF.getCell(cfHdr, 1).font = hdrFont; wsCF.getCell(cfHdr, 1).fill = navy; wsCF.getCell(cfHdr, 1).border = borders;
    for (let y = 0; y <= 10; y++) {
      const c = wsCF.getCell(cfHdr, y + 2);
      c.value = y === 0 ? "Year 0" : `Yr ${y}`;
      c.font = hdrFont; c.fill = navy; c.border = borders; c.alignment = { horizontal: "center" };
    }
    cr++;

    // Year 0 = purchase year (equity outflow only)
    // Years 1-10 = NOI - debt service
    // Year 10 exit = NOI_10/exitCap*(1-sellCost) - loan_balance_10

    // NOI row (grows with cfRentGr)
    const noiR = cr;
    wsCF.getCell(noiR, 1).value = "Net Operating Income"; wsCF.getCell(noiR, 1).font = boldLabel; wsCF.getCell(noiR, 1).border = borders; wsCF.getCell(noiR, 1).fill = white;
    wsCF.getCell(noiR, 2).value = ""; wsCF.getCell(noiR, 2).border = borders; // Year 0
    for (let y = 1; y <= 10; y++) {
      const col = y + 2;
      const c = wsCF.getCell(noiR, col);
      c.value = { formula: `${cfYrNOI}*(1+${cfRentGr})^(${y - 1})` };
      c.numFmt = "$#,##0"; c.fill = ltGreen; c.border = borders;
    }
    cr++;

    // Debt Service row (constant)
    const dsR = cr;
    wsCF.getCell(dsR, 1).value = "Debt Service"; wsCF.getCell(dsR, 1).font = labelFont; wsCF.getCell(dsR, 1).border = borders; wsCF.getCell(dsR, 1).fill = white;
    wsCF.getCell(dsR, 2).value = ""; wsCF.getCell(dsR, 2).border = borders;
    for (let y = 1; y <= 10; y++) {
      const col = y + 2;
      const c = wsCF.getCell(dsR, col);
      c.value = { formula: cfDS };
      c.numFmt = "$#,##0"; c.fill = ltGreen; c.border = borders;
    }
    cr++;

    // Operating Cash Flow (NOI - DS)
    const cashR = cr;
    wsCF.getCell(cashR, 1).value = "Operating Cash Flow"; wsCF.getCell(cashR, 1).font = boldLabel; wsCF.getCell(cashR, 1).border = borders; wsCF.getCell(cashR, 1).fill = white;
    wsCF.getCell(cashR, 2).value = { formula: `-${cfEquity}` }; wsCF.getCell(cashR, 2).numFmt = "$#,##0"; wsCF.getCell(cashR, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }; wsCF.getCell(cashR, 2).border = borders; wsCF.getCell(cashR, 2).font = redFont;
    for (let y = 1; y <= 10; y++) {
      const col = y + 2;
      const c = wsCF.getCell(cashR, col);
      const noiCol = String.fromCharCode(65 + col - 1); // e.g., C, D, ...
      const dsCellA1 = wsCF.getCell(dsR, col).address;
      const noiCellA1 = wsCF.getCell(noiR, col).address;
      c.value = { formula: `${noiCellA1}-${dsCellA1}` };
      c.numFmt = "$#,##0"; c.fill = ltGreen; c.border = borders; c.font = boldLabel;
    }
    cr++;

    // Exit proceeds row (only Year 10)
    const exitR = cr;
    wsCF.getCell(exitR, 1).value = "Exit Proceeds (Year 10)"; wsCF.getCell(exitR, 1).font = boldLabel; wsCF.getCell(exitR, 1).border = borders; wsCF.getCell(exitR, 1).fill = white;
    for (let y = 0; y <= 10; y++) {
      const col = y + 2;
      const c = wsCF.getCell(exitR, col);
      if (y === 10) {
        const noiY11A1 = wsCF.getCell(noiR, col).address;
        // Approximate remaining loan balance at year 10 for 25-yr amort
        const balFormula = `(PMT(${cfRate}/12,${cfAmort}*12,-${cfLoan})*(1-(1+${cfRate}/12)^(-(${cfAmort}*12-120))))/(${cfRate}/12)`;
        c.value = { formula: `${noiY11A1}*(1+${cfRentGr})/${cfExitCap}*(1-${cfSellCost})-${balFormula}` };
        c.numFmt = "$#,##0"; c.fill = ltGreen; c.border = borders; c.font = greenFont;
      } else {
        c.value = ""; c.border = borders;
      }
    }
    cr++;

    // Total cash flow per year (operating + exit)
    const totR = cr;
    wsCF.getCell(totR, 1).value = "Total Cash Flow"; wsCF.getCell(totR, 1).font = { ...boldLabel, color: { argb: "FF253352" } }; wsCF.getCell(totR, 1).border = borders; wsCF.getCell(totR, 1).fill = ltBlue;
    for (let y = 0; y <= 10; y++) {
      const col = y + 2;
      const c = wsCF.getCell(totR, col);
      const cashA1 = wsCF.getCell(cashR, col).address;
      const exitA1 = wsCF.getCell(exitR, col).address;
      c.value = { formula: `${cashA1}+IFERROR(${exitA1},0)` };
      c.numFmt = "$#,##0"; c.fill = ltBlue; c.border = borders; c.font = boldLabel;
    }
    cr += 2;

    // IRR
    wsCF.getCell(cr, 1).value = "Levered IRR (10-Year Hold)"; wsCF.getCell(cr, 1).font = secFont; wsCF.getCell(cr, 1).border = borders;
    const firstCol = wsCF.getCell(totR, 2).address;
    const lastCol = wsCF.getCell(totR, 12).address;
    wsCF.getCell(cr, 2).value = { formula: `IRR(${firstCol}:${lastCol})` };
    wsCF.getCell(cr, 2).numFmt = "0.00%"; wsCF.getCell(cr, 2).font = { ...greenFont, size: 12 }; wsCF.getCell(cr, 2).fill = ltGreen; wsCF.getCell(cr, 2).border = borders;
    cr++;
    wsCF.getCell(cr, 1).value = "Equity Multiple"; wsCF.getCell(cr, 1).font = secFont; wsCF.getCell(cr, 1).border = borders;
    wsCF.getCell(cr, 2).value = { formula: `SUM(${wsCF.getCell(cashR, 3).address}:${wsCF.getCell(cashR, 12).address})/${cfEquity}+${wsCF.getCell(exitR, 12).address}/${cfEquity}+1` };
    wsCF.getCell(cr, 2).numFmt = "0.00\"x\""; wsCF.getCell(cr, 2).font = { ...greenFont, size: 12 }; wsCF.getCell(cr, 2).fill = ltGreen; wsCF.getCell(cr, 2).border = borders;
    cr += 2;
    wsCF.getCell(cr, 1).value = "Note: IRR includes equity outflow at Year 0, 10 years of cash flow, and exit proceeds at Year 10.";
    wsCF.getCell(cr, 1).font = noteFont;

    wsCF.views = [{ state: "frozen", ySplit: cfHdr, xSplit: 1 }];

    // ================================================================
    // NEW SHEET: OFFER LADDER - multi-offer strategy
    // ================================================================
    const wsOffer = wb.addWorksheet("Offer Ladder");
    let or = 2;
    wsOffer.getColumn(1).width = 28;
    for (let c = 2; c <= 5; c++) wsOffer.getColumn(c).width = 22;
    wsOffer.getCell(or, 1).value = `${propertyName} - Offer Ladder`; wsOffer.getCell(or, 1).font = titleFont; or++;
    wsOffer.getCell(or, 1).value = "Four offer levels to consider, with expected returns at each price point."; wsOffer.getCell(or, 1).font = noteFont; or += 2;

    const offerPcts = [0.85, 0.90, 0.95, 1.00];
    const offerLabels = ["Walk-Away", "Below Fair", "Target", "Stretch"];

    // Header
    hdrRow(wsOffer, or, ["Metric", ...offerLabels]); or++;

    // Price row
    const priceR = or;
    wsOffer.getCell(priceR, 1).value = "Offer Price"; wsOffer.getCell(priceR, 1).font = boldLabel; wsOffer.getCell(priceR, 1).fill = white; wsOffer.getCell(priceR, 1).border = borders;
    offerPcts.forEach((pct, i) => {
      const c = wsOffer.getCell(priceR, i + 2);
      c.value = askPrice * pct; c.numFmt = "$#,##0"; c.font = boldLabel; c.border = borders;
      c.fill = yellow; // editable
    });
    or++;

    // % of ask row
    wsOffer.getCell(or, 1).value = "% of Asking"; wsOffer.getCell(or, 1).font = labelFont; wsOffer.getCell(or, 1).fill = white; wsOffer.getCell(or, 1).border = borders;
    offerPcts.forEach((pct, i) => {
      const c = wsOffer.getCell(or, i + 2);
      const priceCell = wsOffer.getCell(priceR, i + 2).address;
      c.value = { formula: `${priceCell}/${askPrice}` };
      c.numFmt = "0.0%"; c.font = valFont; c.border = borders; c.fill = ltGreen;
    });
    or++;

    // Implied cap at OM NOI
    wsOffer.getCell(or, 1).value = "Implied Cap Rate (OM NOI)"; wsOffer.getCell(or, 1).font = labelFont; wsOffer.getCell(or, 1).fill = white; wsOffer.getCell(or, 1).border = borders;
    offerPcts.forEach((_, i) => {
      const c = wsOffer.getCell(or, i + 2);
      const priceCell = wsOffer.getCell(priceR, i + 2).address;
      c.value = { formula: `${noiOm}/${priceCell}` };
      c.numFmt = "0.00%"; c.font = valFont; c.border = borders; c.fill = ltGreen;
    });
    or++;

    // DSCR at 65/7.25/25
    wsOffer.getCell(or, 1).value = "DSCR (at 65% LTV / 7.25%)"; wsOffer.getCell(or, 1).font = labelFont; wsOffer.getCell(or, 1).fill = white; wsOffer.getCell(or, 1).border = borders;
    offerPcts.forEach((_, i) => {
      const c = wsOffer.getCell(or, i + 2);
      const priceCell = wsOffer.getCell(priceR, i + 2).address;
      c.value = { formula: `${noiOm}/(PMT(0.0725/12,25*12,-${priceCell}*0.65)*12)` };
      c.numFmt = "0.00\"x\""; c.font = valFont; c.border = borders; c.fill = ltGreen;
    });
    or++;

    // Cash-on-Cash
    wsOffer.getCell(or, 1).value = "Cash-on-Cash (Yr 1)"; wsOffer.getCell(or, 1).font = labelFont; wsOffer.getCell(or, 1).fill = white; wsOffer.getCell(or, 1).border = borders;
    offerPcts.forEach((_, i) => {
      const c = wsOffer.getCell(or, i + 2);
      const priceCell = wsOffer.getCell(priceR, i + 2).address;
      c.value = { formula: `(${noiOm}-PMT(0.0725/12,25*12,-${priceCell}*0.65)*12)/(${priceCell}*0.37)` };
      c.numFmt = "0.00%"; c.font = valFont; c.border = borders; c.fill = ltGreen;
    });
    or++;

    // Equity check
    wsOffer.getCell(or, 1).value = "Equity Required"; wsOffer.getCell(or, 1).font = labelFont; wsOffer.getCell(or, 1).fill = white; wsOffer.getCell(or, 1).border = borders;
    offerPcts.forEach((_, i) => {
      const c = wsOffer.getCell(or, i + 2);
      const priceCell = wsOffer.getCell(priceR, i + 2).address;
      c.value = { formula: `${priceCell}*0.37` };
      c.numFmt = "$#,##0"; c.font = valFont; c.border = borders; c.fill = ltGreen;
    });
    or += 2;

    // Strategy notes per column
    const stratNotes: [string, string][] = [
      ["Walk-Away", "Final price. If seller won't meet this, pass. Below this, the math doesn't work."],
      ["Below Fair", "Opening bid. Test seller motivation. If they counter aggressively, move up."],
      ["Target", "Where you expect to land after negotiation. Most likely settlement price."],
      ["Stretch", "Maximum acceptable. Only go here for unique, irreplaceable assets or uncontested deals."],
    ];
    hdrRow(wsOffer, or, ["Strategy", "Purpose"]); or++;
    for (const [label, note] of stratNotes) {
      const c1 = wsOffer.getCell(or, 1); c1.value = label; c1.font = boldLabel; c1.fill = white; c1.border = borders;
      const c2 = wsOffer.getCell(or, 2); c2.value = note; c2.font = valFont; c2.fill = white; c2.border = borders; c2.alignment = { wrapText: true };
      wsOffer.mergeCells(or, 2, or, 5);
      or++;
    }
    or += 2;
    wsOffer.getCell(or, 1).value = "All price cells are editable. DSCR target >1.25x; Cash-on-Cash target >6% for market-rate deals.";
    wsOffer.getCell(or, 1).font = noteFont;
  }

  // ================================================================
  // SHEET 2: RENT ROLL
  // ================================================================
  if (analysisType !== "land") {
    const tenantFields = fields.filter(f => f.fieldGroup === "rent_roll" && f.fieldName.startsWith("tenant_"));
    const tenantMap: Record<string, Record<string, any>> = {};
    for (const f of tenantFields) {
      const match = f.fieldName.match(/^tenant_(\d+)_(.+)$/);
      if (match) {
        const [, idx, key] = match;
        if (!tenantMap[idx]) tenantMap[idx] = {};
        tenantMap[idx][key] = f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
      }
    }
    const tenantList = Object.entries(tenantMap).sort(([a], [b]) => Number(a) - Number(b)).map(([, t]) => t);
    const totalSf = tenantList.reduce((sum, t) => sum + (Number(t.sf) || 0), 0);
    const totalRent = tenantList.reduce((sum, t) => sum + (Number(t.rent) || 0), 0);
    const buildingSf = Number(g("property_basics", "building_sf")) || totalSf;

    const ws2 = wb.addWorksheet("Rent Roll");
    let r = 2;
    ws2.getCell(r, 1).value = `RENT ROLL - ${propertyName}`; ws2.getCell(r, 1).font = titleFont; r += 2;
    hdrRow(ws2, r, ["Tenant", "SF", "Annual Rent", "Rent/SF", "Lease Type", "Lease End", "Status"], [24, 10, 14, 10, 13, 12, 12]); r++;

    for (const t of tenantList) {
      const isExpired = String(t.status || "").toLowerCase().includes("expir") || String(t.status || "").toLowerCase().includes("mtm") || String(t.status || "").toLowerCase().includes("vacant");
      const rowVals = [t.name, Number(t.sf) || "", Number(t.rent) || "", t.rent_psf ? Number(t.rent_psf) : "", t.type || "", t.lease_end || "", t.status || ""];
      rowVals.forEach((v, i) => {
        const c = ws2.getCell(r, i + 1); c.value = v; c.border = borders; c.fill = white;
        c.font = i === 0 ? { ...labelFont, bold: true } : (isExpired ? redFont : valFont);
        if (i === 1) c.numFmt = "#,##0";
        if (i === 2) c.numFmt = "$#,##0";
        if (i === 3) c.numFmt = "$#,##0.00";
      }); r++;
    }

    if (tenantList.length > 0) {
      r++;
      const c1 = ws2.getCell(r, 1); c1.value = "TOTALS"; c1.font = boldLabel; c1.fill = ltBlue; c1.border = borders;
      const c2 = ws2.getCell(r, 2); c2.value = totalSf; c2.font = boldLabel; c2.fill = ltBlue; c2.border = borders; c2.numFmt = "#,##0";
      const c3 = ws2.getCell(r, 3); c3.value = totalRent; c3.font = boldLabel; c3.fill = ltBlue; c3.border = borders; c3.numFmt = "$#,##0";
      const c4 = ws2.getCell(r, 4); c4.value = totalSf > 0 ? totalRent / totalSf : 0; c4.font = boldLabel; c4.fill = ltBlue; c4.border = borders; c4.numFmt = "$#,##0.00";
    }
  }

  // ================================================================
  // SHEET 3: OM DATA - raw reference from the document
  // ================================================================
  const wsRef = wb.addWorksheet(analysisType === "land" ? "Site Data" : "OM Data");
  let r = 2;
  wsRef.getColumn(1).width = 28; wsRef.getColumn(2).width = 28; wsRef.getColumn(3).width = 30;
  wsRef.getCell(r, 1).value = `${propertyName} - ${analysisType === "land" ? "SITE" : "OM"} REFERENCE DATA`; wsRef.getCell(r, 1).font = titleFont; r++;
  wsRef.getCell(r, 1).value = "This is what was extracted from the OM/flyer. For reference only."; wsRef.getCell(r, 1).font = noteFont; r += 2;

  // Property info
  wsRef.getCell(r, 1).value = "PROPERTY"; wsRef.getCell(r, 1).font = secFont; r++;
  hdrRow(wsRef, r, ["Field", "Value", "Source"]); r++;
  dataRow(wsRef, r++, "Address", g("property_basics", "address") || "", "OM");
  dataRow(wsRef, r++, "City, State", [g("property_basics", "city"), g("property_basics", "state")].filter(Boolean).join(", "), "OM");
  dataRow(wsRef, r++, "Year Built", g("property_basics", "year_built") || "", "OM");
  if (analysisType === "land") {
    dataRow(wsRef, r++, "Acreage", g("property_basics", "lot_acres") || g("property_basics", "usable_acres") || "", "OM");
    dataRow(wsRef, r++, "Zoning", g("land_zoning", "current_zoning") || g("land_addons", "zoning") || "", "OM");
    dataRow(wsRef, r++, "Planned Use", g("land_zoning", "planned_use") || g("land_addons", "planned_use") || "", "OM");
    dataRow(wsRef, r++, "Frontage", g("property_basics", "frontage_ft") || g("land_addons", "frontage_signal") || "", "OM");
    dataRow(wsRef, r++, "Access", g("land_access", "road_access") || g("land_addons", "access_signal") || "", "OM");
    dataRow(wsRef, r++, "Utilities", g("land_addons", "utilities_signal") || "", "OM");
    dataRow(wsRef, r++, "Asking Price", fmt$(g("pricing_deal_terms", "asking_price")), "OM");
    dataRow(wsRef, r++, "Price / Acre", g("pricing_deal_terms", "price_per_acre") || "", "OM");
  } else {
    dataRow(wsRef, r++, "GLA (SF)", g("property_basics", "building_sf") || "", "OM");
    dataRow(wsRef, r++, "Occupancy", g("property_basics", "occupancy_pct") ? g("property_basics", "occupancy_pct") + "%" : "", "OM");
    dataRow(wsRef, r++, "Tenants", g("property_basics", "tenant_count") || "", "OM");
    dataRow(wsRef, r++, "WALE", g("property_basics", "wale_years") ? g("property_basics", "wale_years") + " yrs" : "", "OM");
    dataRow(wsRef, r++, "Broker", g("property_basics", "broker") || "", "OM");
    if (analysisType === "industrial") {
      dataRow(wsRef, r++, "Clear Height", g("industrial_addons", "clear_height") || "", "OM");
      dataRow(wsRef, r++, "Loading", g("industrial_addons", "loading_type") || "", "OM");
      dataRow(wsRef, r++, "Dock Count", g("industrial_addons", "loading_count") || "", "OM");
    }
    if (analysisType === "office") {
      dataRow(wsRef, r++, "Suite Count", g("office_addons", "suite_count") || "", "OM");
      dataRow(wsRef, r++, "Parking Ratio", g("office_addons", "parking_ratio") || "", "OM");
    }
    r++;

    // Financial data from OM
    wsRef.getCell(r, 1).value = "FINANCIALS (from OM)"; wsRef.getCell(r, 1).font = secFont; r++;
    hdrRow(wsRef, r, ["Field", "Value", "Notes"]); r++;
    dataRow(wsRef, r++, "Asking Price", fmt$(g("pricing_deal_terms", "asking_price")), "OM");
    dataRow(wsRef, r++, "Price / SF", g("pricing_deal_terms", "price_per_sf") ? "$" + Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2) : "", "OM");
    dataRow(wsRef, r++, "Cap Rate (OM)", g("pricing_deal_terms", "cap_rate_om") ? Number(g("pricing_deal_terms", "cap_rate_om")).toFixed(2) + "%" : "", "OM stated");
    dataRow(wsRef, r++, "Base Rent", fmt$(g("income", "base_rent")), "OM");
    dataRow(wsRef, r++, "NNN Reimbursements", fmt$(g("income", "nnn_reimbursements")), g("income", "nnn_reimbursements") ? "OM" : "Not stated");
    dataRow(wsRef, r++, "CAM Charges", fmt$(g("expenses", "cam_expenses")), g("expenses", "cam_expenses") ? "OM" : "Not stated");
    dataRow(wsRef, r++, "Real Estate Taxes", fmt$(g("expenses", "property_taxes")), g("expenses", "property_taxes") ? "OM" : "Not stated");
    dataRow(wsRef, r++, "Insurance", fmt$(g("expenses", "insurance")), g("expenses", "insurance") ? "OM" : "Not stated");
    dataRow(wsRef, r++, "Management Fee", fmt$(g("expenses", "management_fee")), g("expenses", "management_fee") ? "OM" : "Not stated");
    dataRow(wsRef, r++, "Total Expenses", fmt$(g("expenses", "total_expenses")), g("expenses", "total_expenses") ? "OM" : "Not stated");
    dataRow(wsRef, r++, "NOI (OM)", fmt$(g("expenses", "noi_om")), "OM stated NOI", { bold: true });
    dataRow(wsRef, r++, "EGI", fmt$(g("income", "effective_gross_income")), g("income", "effective_gross_income") ? "OM" : "Not stated");
  }

  // Signals
  r++;
  wsRef.getCell(r, 1).value = "AI SIGNAL ASSESSMENT"; wsRef.getCell(r, 1).font = secFont; r++;
  hdrRow(wsRef, r, ["Signal", "Assessment"]); r++;
  const sigPairs = analysisType === "land" ? [
    ["Overall", g("signals", "overall_signal")],
    ["Pricing", g("signals", "pricing_signal")],
    ["Location", g("signals", "location_signal")],
    ["Zoning", g("signals", "zoning_signal")],
    ["Utilities", g("signals", "utilities_signal")],
  ] : [
    ["Overall", g("signals", "overall_signal")],
    ["Cap Rate", g("signals", "cap_rate_signal")],
    ["DSCR", g("signals", "dscr_signal")],
    ["Occupancy", g("signals", "occupancy_signal")],
    ["Basis / Price", g("signals", "basis_signal")],
    ["Tenant Quality", g("signals", "tenant_quality_signal")],
  ];
  for (const [label, val] of sigPairs) {
    if (!val) continue;
    const isRed = String(val).toLowerCase().includes("red") || String(val).toLowerCase().includes("sell");
    const isGreen = String(val).toLowerCase().includes("green") || String(val).toLowerCase().includes("buy");
    dataRow(wsRef, r++, label, val, "", isRed ? { red: true } : isGreen ? { green: true } : undefined);
  }
  const rec = g("signals", "recommendation");
  if (rec) dataRow(wsRef, r++, "Recommendation", rec, "", { bold: true });

  // ================================================================
  // LAND-specific: simple inputs sheet (no scenario model for land)
  // ================================================================
  if (analysisType === "land") {
    const wsLand = wb.addWorksheet("Pricing Analysis");
    let lr = 2;
    wsLand.getColumn(1).width = 28; wsLand.getColumn(2).width = 28;
    wsLand.getCell(lr, 1).value = `LAND PRICING - ${propertyName}`; wsLand.getCell(lr, 1).font = titleFont; lr += 2;
    hdrRow(wsLand, lr, ["Field", "Value"]); lr++;
    dataRow(wsLand, lr++, "Asking Price", fmt$(g("pricing_deal_terms", "asking_price")));
    dataRow(wsLand, lr++, "Acreage", g("property_basics", "lot_acres") || g("property_basics", "usable_acres") || "");
    dataRow(wsLand, lr++, "Price / Acre", g("pricing_deal_terms", "price_per_acre") || "");
    dataRow(wsLand, lr++, "Zoning", g("land_zoning", "current_zoning") || g("land_addons", "zoning") || "");
  }

  // Download
  const safeName = propertyName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  const suffix = analysisType !== "retail" ? `-${typeLabel}` : "";
  const filename = `${safeName}${suffix}-Underwriting.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// ============================================================
// STRATEGY-LENS XLSX (Pro+ only)
// Core / Core+ / Value-Add / Opportunistic analysis tabs
// ============================================================

interface StrategyProfile {
  name: string;
  description: string;
  minCap: number;
  targetCap: number;
  maxCap: number;
  minDSCR: number;
  targetDSCR: number;
  minOccupancy: number;
  minWALE: number;
  maxExpenseRatio: number;
  riskLabel: string;
  holdPeriod: string;
  targetIRR: string;
  exitCapSpread: number; // bps above entry
  verdictFn: (metrics: DealMetrics) => { verdict: string; reasons: string[] };
}

interface DealMetrics {
  capRate: number | null;
  noi: number | null;
  askingPrice: number | null;
  occupancy: number | null;
  wale: number | null;
  dscr: number | null;
  expenseRatio: number | null;
  pricePerSF: number | null;
  pricePerUnit: number | null;
  yearBuilt: number | null;
  buildingSF: number | null;
  unitCount: number | null;
  tenantCount: number | null;
  noiPerSF: number | null;
}

const STRATEGIES: Record<string, StrategyProfile> = {
  core: {
    name: "Core",
    description: "Stabilized, institutional-quality assets with predictable income. Low risk, lowest return.",
    minCap: 4.5, targetCap: 5.5, maxCap: 7.0,
    minDSCR: 1.30, targetDSCR: 1.50,
    minOccupancy: 93, minWALE: 5,
    maxExpenseRatio: 45,
    riskLabel: "Low",
    holdPeriod: "7-10 years",
    targetIRR: "6-9%",
    exitCapSpread: 25,
    verdictFn: (m) => {
      const reasons: string[] = [];
      let pass = true;
      if (m.capRate !== null && m.capRate < 4.5) { reasons.push(`Cap rate ${m.capRate.toFixed(1)}% below 4.5% floor`); pass = false; }
      if (m.occupancy !== null && m.occupancy < 93) { reasons.push(`Occupancy ${m.occupancy.toFixed(0)}% below 93% threshold`); pass = false; }
      if (m.dscr !== null && m.dscr < 1.30) { reasons.push(`DSCR ${m.dscr.toFixed(2)}x below 1.30x minimum`); pass = false; }
      if (m.wale !== null && m.wale < 5) { reasons.push(`WALE ${m.wale.toFixed(1)}yr below 5yr minimum`); pass = false; }
      if (m.capRate !== null && m.capRate >= 5.0 && m.occupancy !== null && m.occupancy >= 95) reasons.push("Strong stabilized yield with high occupancy");
      if (m.dscr !== null && m.dscr >= 1.50) reasons.push("Excellent debt coverage");
      return { verdict: pass ? (reasons.length > 2 ? "STRONG FIT" : "QUALIFIES") : "DOES NOT FIT", reasons };
    },
  },
  core_plus: {
    name: "Core+",
    description: "Near-stabilized with minor lease-up or light value-add. Moderate risk, moderate return.",
    minCap: 5.0, targetCap: 6.5, maxCap: 8.0,
    minDSCR: 1.20, targetDSCR: 1.35,
    minOccupancy: 85, minWALE: 3,
    maxExpenseRatio: 50,
    riskLabel: "Low-Moderate",
    holdPeriod: "5-7 years",
    targetIRR: "9-13%",
    exitCapSpread: 25,
    verdictFn: (m) => {
      const reasons: string[] = [];
      let pass = true;
      if (m.occupancy !== null && m.occupancy < 85) { reasons.push(`Occupancy ${m.occupancy.toFixed(0)}% below 85% threshold`); pass = false; }
      if (m.dscr !== null && m.dscr < 1.20) { reasons.push(`DSCR ${m.dscr.toFixed(2)}x below 1.20x minimum`); pass = false; }
      if (m.capRate !== null && m.capRate >= 6.0) reasons.push("Attractive entry cap for Core+");
      if (m.occupancy !== null && m.occupancy >= 85 && m.occupancy < 93) reasons.push("Lease-up upside potential");
      return { verdict: pass ? "QUALIFIES" : "DOES NOT FIT", reasons };
    },
  },
  value_add: {
    name: "Value-Add",
    description: "Below-market rents, renovation potential, lease-up opportunity. Higher risk, higher return.",
    minCap: 6.0, targetCap: 7.5, maxCap: 10.0,
    minDSCR: 1.00, targetDSCR: 1.25,
    minOccupancy: 70, minWALE: 1,
    maxExpenseRatio: 60,
    riskLabel: "Moderate-High",
    holdPeriod: "3-5 years",
    targetIRR: "13-18%",
    exitCapSpread: 50,
    verdictFn: (m) => {
      const reasons: string[] = [];
      let pass = true;
      if (m.dscr !== null && m.dscr < 1.00) { reasons.push(`DSCR ${m.dscr.toFixed(2)}x below 1.00x - negative leverage`); pass = false; }
      if (m.capRate !== null && m.capRate >= 7.0) reasons.push("High entry cap supports value-add returns");
      if (m.occupancy !== null && m.occupancy < 85) reasons.push("Significant lease-up / renovation upside");
      if (m.expenseRatio !== null && m.expenseRatio > 50) reasons.push("Expense reduction opportunity");
      return { verdict: pass ? "QUALIFIES" : "RISKY", reasons };
    },
  },
  opportunistic: {
    name: "Opportunistic",
    description: "Distressed, vacant, redevelopment, or ground-up. Highest risk, highest return potential.",
    minCap: 7.0, targetCap: 9.0, maxCap: 15.0,
    minDSCR: 0, targetDSCR: 1.00,
    minOccupancy: 0, minWALE: 0,
    maxExpenseRatio: 75,
    riskLabel: "High",
    holdPeriod: "2-4 years",
    targetIRR: "18%+",
    exitCapSpread: 75,
    verdictFn: (m) => {
      const reasons: string[] = [];
      if (m.capRate !== null && m.capRate >= 8.0) reasons.push("Distressed entry cap offers high upside");
      if (m.occupancy !== null && m.occupancy < 70) reasons.push("Significant vacancy - full repositioning play");
      if (m.yearBuilt !== null && (2026 - m.yearBuilt) > 40) reasons.push("Aging asset may warrant redevelopment");
      return { verdict: reasons.length > 0 ? "POTENTIAL FIT" : "EVALUATE FURTHER", reasons };
    },
  },
};

export async function generateStrategyLensXLSX(
  propertyName: string,
  fields: ExtractedField[],
  analysisType: AnalysisType = "retail"
): Promise<void> {
  const exceljs = await loadExcelJS();
  const wb = new exceljs.Workbook();
  const g = (group: string, name: string) => getField(fields, group, name);

  // ── Extract deal metrics ──
  const metrics: DealMetrics = {
    capRate: Number(g("pricing_deal_terms", "cap_rate_actual") || g("pricing_deal_terms", "cap_rate_asking") || g("pricing_deal_terms", "cap_rate_om")) || null,
    noi: Number(g("expenses", "noi") || g("expenses", "noi_om") || g("expenses", "noi_adjusted") || g("expenses", "net_operating_income")) || null,
    askingPrice: Number(g("pricing_deal_terms", "asking_price") || g("pricing_deal_terms", "purchase_price")) || null,
    occupancy: Number(g("property_basics", "occupancy_pct") || g("property_basics", "occupancy")) || null,
    wale: Number(g("rent_roll", "weighted_avg_lease_term") || g("property_basics", "wale_years") || g("rent_roll", "wale") || g("lease_data", "wale_years")) || null,
    dscr: Number(g("debt_assumptions", "dscr") || g("debt_assumptions", "dscr_om") || g("debt_assumptions", "dscr_adjusted")) || null,
    expenseRatio: Number(g("expenses", "expense_ratio") || g("multifamily", "expense_ratio")) || null,
    pricePerSF: Number(g("pricing_deal_terms", "price_per_sf") || g("pricing_deal_terms", "price_per_sqft")) || null,
    pricePerUnit: Number(g("pricing_deal_terms", "price_per_unit")) || null,
    yearBuilt: Number(g("property_basics", "year_built")) || null,
    buildingSF: Number(g("property_basics", "building_sf") || g("property_basics", "rentable_area")) || null,
    unitCount: Number(g("property_basics", "unit_count") || g("multifamily", "unit_count")) || null,
    tenantCount: Number(g("rent_roll", "tenant_count") || g("property_basics", "suite_count")) || null,
    noiPerSF: null,
  };
  if (metrics.noi && metrics.buildingSF && metrics.buildingSF > 0) {
    metrics.noiPerSF = metrics.noi / metrics.buildingSF;
  }

  const loc = [g("property_basics", "address"), g("property_basics", "city"), g("property_basics", "state")].filter(Boolean).join(", ");
  const typeLabel = { retail: "Retail", industrial: "Industrial", office: "Office", land: "Land", multifamily: "Multifamily" }[analysisType] || analysisType;

  // ── Sheet 1: Deal Summary (common reference) ──
  const wsSummary = wb.addWorksheet("Deal Summary");
  wsSummary.getColumn(1).width = 26;
  wsSummary.getColumn(2).width = 22;
  wsSummary.getColumn(3).width = 32;
  let r = 2;
  wsSummary.getCell(r, 1).value = `${propertyName} - Strategy Analysis`;
  wsSummary.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
  r++;
  wsSummary.getCell(r, 1).value = loc; wsSummary.getCell(r, 1).font = { size: 10, color: { argb: "FF6B7280" } };
  r++;
  wsSummary.getCell(r, 1).value = `Asset Type: ${typeLabel}`; wsSummary.getCell(r, 1).font = { size: 10, color: { argb: "FF6B7280" } };
  r += 2;

  hdrRow(wsSummary, r, ["Metric", "Value", "Notes"]); r++;
  const summaryRows: [string, string, string][] = [
    ["Asking Price", metrics.askingPrice ? `$${metrics.askingPrice.toLocaleString()}` : "-", ""],
    ["Cap Rate", metrics.capRate ? `${metrics.capRate.toFixed(2)}%` : "-", "Entry cap rate"],
    ["NOI", metrics.noi ? `$${metrics.noi.toLocaleString()}` : "-", "In-place / adjusted"],
    ["DSCR", metrics.dscr ? `${metrics.dscr.toFixed(2)}x` : "-", "Debt service coverage"],
    ["Occupancy", metrics.occupancy ? `${metrics.occupancy.toFixed(1)}%` : "-", ""],
    ["WALE", metrics.wale ? `${metrics.wale.toFixed(1)} yrs` : "-", "Weighted avg lease term"],
    ["Expense Ratio", metrics.expenseRatio ? `${metrics.expenseRatio.toFixed(1)}%` : "-", ""],
    ["Price / SF", metrics.pricePerSF ? `$${metrics.pricePerSF.toFixed(0)}` : "-", ""],
    ["NOI / SF", metrics.noiPerSF ? `$${metrics.noiPerSF.toFixed(2)}` : "-", ""],
    ["Year Built", metrics.yearBuilt ? `${metrics.yearBuilt}` : "-", ""],
    ["Building SF", metrics.buildingSF ? `${metrics.buildingSF.toLocaleString()}` : "-", ""],
  ];
  if (metrics.unitCount) summaryRows.push(["Units", `${metrics.unitCount}`, ""]);
  if (metrics.pricePerUnit) summaryRows.push(["Price / Unit", `$${metrics.pricePerUnit.toLocaleString()}`, ""]);
  for (const [label, val, note] of summaryRows) {
    dataRow(wsSummary, r, label, val);
    if (note) { wsSummary.getCell(r, 3).value = note; wsSummary.getCell(r, 3).font = noteFont; wsSummary.getCell(r, 3).border = borders; }
    r++;
  }

  // ── One sheet per strategy ──
  for (const [key, strat] of Object.entries(STRATEGIES)) {
    const ws = wb.addWorksheet(strat.name);
    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 20;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 36;
    let sr = 2;

    // Title
    ws.getCell(sr, 1).value = `${strat.name} Strategy Analysis`;
    ws.getCell(sr, 1).font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
    sr++;
    ws.getCell(sr, 1).value = strat.description;
    ws.getCell(sr, 1).font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
    sr += 2;

    // Strategy parameters
    hdrRow(ws, sr, ["Strategy Parameter", "Threshold", "This Deal", "Assessment"]); sr++;

    const checkMetric = (label: string, threshold: string, value: string | null, passFn: () => boolean | null): void => {
      const lc = ws.getCell(sr, 1); lc.value = label; lc.font = labelFont; lc.border = borders; lc.fill = white;
      const tc = ws.getCell(sr, 2); tc.value = threshold; tc.font = valFont; tc.border = borders; tc.fill = white;
      const vc = ws.getCell(sr, 3); vc.value = value || "-"; vc.font = valFont; vc.border = borders;
      const result = value ? passFn() : null;
      if (result === true) {
        vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
        ws.getCell(sr, 4).value = "✓ Meets threshold"; ws.getCell(sr, 4).font = { size: 10, color: { argb: "FF059669" } };
      } else if (result === false) {
        vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
        ws.getCell(sr, 4).value = "✗ Below threshold"; ws.getCell(sr, 4).font = { size: 10, color: { argb: "FFDC2626" } };
      } else {
        vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
        ws.getCell(sr, 4).value = "- No data"; ws.getCell(sr, 4).font = { size: 10, color: { argb: "FF92400E" } };
      }
      ws.getCell(sr, 4).border = borders;
      sr++;
    };

    checkMetric("Min Cap Rate", `≥ ${strat.minCap}%`, metrics.capRate ? `${metrics.capRate.toFixed(2)}%` : null,
      () => metrics.capRate !== null ? metrics.capRate >= strat.minCap : null);
    checkMetric("Target Cap Rate", `${strat.targetCap}%`, metrics.capRate ? `${metrics.capRate.toFixed(2)}%` : null,
      () => metrics.capRate !== null ? metrics.capRate >= strat.targetCap : null);
    checkMetric("Min DSCR", `≥ ${strat.minDSCR}x`, metrics.dscr ? `${metrics.dscr.toFixed(2)}x` : null,
      () => metrics.dscr !== null ? metrics.dscr >= strat.minDSCR : null);
    checkMetric("Min Occupancy", `≥ ${strat.minOccupancy}%`, metrics.occupancy ? `${metrics.occupancy.toFixed(1)}%` : null,
      () => metrics.occupancy !== null ? metrics.occupancy >= strat.minOccupancy : null);
    checkMetric("Min WALE", `≥ ${strat.minWALE} yrs`, metrics.wale ? `${metrics.wale.toFixed(1)} yrs` : null,
      () => metrics.wale !== null ? metrics.wale >= strat.minWALE : null);
    checkMetric("Max Expense Ratio", `≤ ${strat.maxExpenseRatio}%`, metrics.expenseRatio ? `${metrics.expenseRatio.toFixed(1)}%` : null,
      () => metrics.expenseRatio !== null ? metrics.expenseRatio <= strat.maxExpenseRatio : null);

    sr++;

    // Return profile
    hdrRow(ws, sr, ["Return Profile", "Value", "", ""]); sr++;
    dataRow(ws, sr++, "Risk Level", strat.riskLabel);
    dataRow(ws, sr++, "Target Hold Period", strat.holdPeriod);
    dataRow(ws, sr++, "Target IRR", strat.targetIRR);
    dataRow(ws, sr++, "Exit Cap Spread", `+${strat.exitCapSpread} bps above entry`);

    // Exit cap scenario
    if (metrics.noi && metrics.capRate) {
      sr++;
      hdrRow(ws, sr, ["Exit Scenario", "Exit Cap", "Implied Value", ""]); sr++;
      const exitCaps = [strat.minCap, strat.targetCap, strat.maxCap];
      for (const ec of exitCaps) {
        const impliedValue = metrics.noi / (ec / 100);
        dataRow(ws, sr, `Exit at ${ec.toFixed(1)}%`, `$${Math.round(impliedValue).toLocaleString()}`);
        if (metrics.askingPrice) {
          const delta = ((impliedValue - metrics.askingPrice) / metrics.askingPrice * 100);
          ws.getCell(sr, 3).value = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs purchase`;
          ws.getCell(sr, 3).font = { size: 10, color: { argb: delta >= 0 ? "FF059669" : "FFDC2626" } };
          ws.getCell(sr, 3).border = borders;
        }
        sr++;
      }
    }

    // Verdict
    sr++;
    const verdict = strat.verdictFn(metrics);
    const verdictColor = verdict.verdict.includes("FIT") || verdict.verdict === "QUALIFIES" || verdict.verdict === "STRONG FIT" ? "FF059669" :
      verdict.verdict === "DOES NOT FIT" ? "FFDC2626" : "FF92400E";
    ws.getCell(sr, 1).value = "VERDICT";
    ws.getCell(sr, 1).font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
    ws.getCell(sr, 2).value = verdict.verdict;
    ws.getCell(sr, 2).font = { bold: true, size: 12, color: { argb: verdictColor } };
    sr++;
    for (const reason of verdict.reasons) {
      ws.getCell(sr, 1).value = `  • ${reason}`;
      ws.getCell(sr, 1).font = { size: 10, color: { argb: "FF374151" } };
      sr++;
    }
  }

  // ── Comparison matrix sheet ──
  const wsComp = wb.addWorksheet("Strategy Comparison");
  wsComp.getColumn(1).width = 24;
  wsComp.getColumn(2).width = 18;
  wsComp.getColumn(3).width = 18;
  wsComp.getColumn(4).width = 18;
  wsComp.getColumn(5).width = 18;
  let cr = 2;
  wsComp.getCell(cr, 1).value = "Strategy Comparison Matrix";
  wsComp.getCell(cr, 1).font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
  cr += 2;

  hdrRow(wsComp, cr, ["Metric", "Core", "Core+", "Value-Add", "Opportunistic"]); cr++;

  const compRows: [string, ...string[]][] = [
    ["Min Cap Rate", ...Object.values(STRATEGIES).map(s => `${s.minCap}%`)],
    ["Target Cap Rate", ...Object.values(STRATEGIES).map(s => `${s.targetCap}%`)],
    ["Min DSCR", ...Object.values(STRATEGIES).map(s => `${s.minDSCR}x`)],
    ["Min Occupancy", ...Object.values(STRATEGIES).map(s => `${s.minOccupancy}%`)],
    ["Min WALE", ...Object.values(STRATEGIES).map(s => `${s.minWALE} yrs`)],
    ["Risk Level", ...Object.values(STRATEGIES).map(s => s.riskLabel)],
    ["Hold Period", ...Object.values(STRATEGIES).map(s => s.holdPeriod)],
    ["Target IRR", ...Object.values(STRATEGIES).map(s => s.targetIRR)],
    ["This Deal", ...Object.values(STRATEGIES).map(s => s.verdictFn(metrics).verdict)],
  ];

  for (const row of compRows) {
    for (let c = 0; c < row.length; c++) {
      const cell = wsComp.getCell(cr, c + 1);
      cell.value = row[c];
      cell.font = c === 0 ? labelFont : valFont;
      cell.border = borders;
      cell.fill = white;
      // Color the verdict row
      if (row[0] === "This Deal" && c > 0) {
        const v = row[c];
        if (v.includes("FIT") || v === "QUALIFIES" || v === "STRONG FIT") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
          cell.font = { size: 10, bold: true, color: { argb: "FF059669" } };
        } else if (v === "DOES NOT FIT") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          cell.font = { size: 10, bold: true, color: { argb: "FFDC2626" } };
        } else {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
          cell.font = { size: 10, bold: true, color: { argb: "FF92400E" } };
        }
      }
    }
    cr++;
  }

  // Download
  const safeName = propertyName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  const filename = `${safeName}-Strategy-Analysis.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// ============================================================
// DOCX (Word Brief) GENERATION
// ============================================================

export function generateBriefDownload(
  propertyName: string,
  brief: string,
  fields: ExtractedField[],
  analysisType: AnalysisType = "retail"
): void {
  const g = (group: string, name: string) => getField(fields, group, name);
  const typeLabel = analysisType === "retail" ? "Retail" : analysisType === "industrial" ? "Industrial" : analysisType === "office" ? "Office" : "Land";

  // === Build metrics table based on asset type ===
  let metrics: [string, string][];

  if (analysisType === "land") {
    metrics = [
      ["Asking Price", fmt$(g("pricing_deal_terms", "asking_price"))],
      ["Price / Acre", g("pricing_deal_terms", "price_per_acre") || (g("pricing_deal_terms", "price_per_sf") ? "$" + Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2) + "/SF" : "")],
      ["Usable Acres", g("property_basics", "usable_acres") || g("land_addons", "usable_acres") || ""],
      ["Zoning", g("land_zoning", "current_zoning") || g("land_addons", "zoning") || ""],
      ["Planned Use", g("land_zoning", "planned_use") || g("land_addons", "planned_use") || ""],
      ["Frontage", g("property_basics", "frontage_ft") || g("land_addons", "frontage_signal") || ""],
      ["Access", g("land_access", "road_access") || g("land_addons", "access_signal") || ""],
      ["Utilities", g("land_addons", "utilities_signal") || ""],
      ["Power Proximity", g("land_utilities", "power_proximity") || g("land_addons", "power_proximity_signal") || ""],
    ].filter(([, v]) => v) as [string, string][];
  } else if (analysisType === "industrial") {
    metrics = [
      ["Asking Price", fmt$(g("pricing_deal_terms", "asking_price"))],
      ["Price / SF", g("pricing_deal_terms", "price_per_sf") ? "$" + Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2) + "/SF" : ""],
      ["GLA", g("property_basics", "building_sf") ? Math.round(Number(g("property_basics", "building_sf"))).toLocaleString() + " SF" : ""],
      ["Occupancy", g("property_basics", "occupancy_pct") ? g("property_basics", "occupancy_pct") + "%" : ""],
      ["Clear Height", g("industrial_addons", "clear_height") || ""],
      ["Loading Type", g("industrial_addons", "loading_type") || ""],
      ["Dock / Door Count", g("industrial_addons", "loading_count") || ""],
      ["Trailer Parking", g("industrial_addons", "trailer_parking") || ""],
      ["Office Finish %", g("industrial_addons", "office_finish_pct") || ""],
      ["Tenant Type", g("industrial_addons", "industrial_tenant_type") || ""],
      ["NOI (OM)", fmt$(g("expenses", "noi_om"))],
      ["NOI (Adjusted)", fmt$(g("expenses", "noi_adjusted"))],
      ["Entry Cap (OM)", g("pricing_deal_terms", "cap_rate_om") ? Number(g("pricing_deal_terms", "cap_rate_om")).toFixed(2) + "%" : ""],
      ["DSCR (OM)", g("debt_assumptions", "dscr_om") ? Number(g("debt_assumptions", "dscr_om")).toFixed(2) + "x" : ""],
      ["DSCR (Adjusted)", g("debt_assumptions", "dscr_adjusted") ? Number(g("debt_assumptions", "dscr_adjusted")).toFixed(2) + "x" : ""],
      ["Cash-on-Cash (OM)", g("returns", "cash_on_cash_om") ? Number(g("returns", "cash_on_cash_om")).toFixed(2) + "%" : ""],
      ["Debt Yield", g("debt_assumptions", "debt_yield") ? Number(g("debt_assumptions", "debt_yield")).toFixed(2) + "%" : ""],
    ].filter(([, v]) => v) as [string, string][];
  } else if (analysisType === "office") {
    metrics = [
      ["Asking Price", fmt$(g("pricing_deal_terms", "asking_price"))],
      ["Price / SF", g("pricing_deal_terms", "price_per_sf") ? "$" + Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2) + "/SF" : ""],
      ["GLA", g("property_basics", "building_sf") ? Math.round(Number(g("property_basics", "building_sf"))).toLocaleString() + " SF" : ""],
      ["Occupancy", g("property_basics", "occupancy_pct") ? g("property_basics", "occupancy_pct") + "%" : ""],
      ["Suite Count", g("office_addons", "suite_count") || ""],
      ["Medical Office", g("office_addons", "medical_flag") === true ? "Yes" : g("office_addons", "medical_flag") === false ? "No" : ""],
      ["Major Tenant Mix", g("office_addons", "major_tenant_mix") || ""],
      ["Parking Ratio", g("office_addons", "parking_ratio") || ""],
      ["TI/LC Signal", g("office_addons", "ti_lc_signal") || ""],
      ["Near-Term Expirations", g("office_addons", "lease_expirations_near_term") || ""],
      ["NOI (OM)", fmt$(g("expenses", "noi_om"))],
      ["NOI (Adjusted)", fmt$(g("expenses", "noi_adjusted"))],
      ["Entry Cap (OM)", g("pricing_deal_terms", "cap_rate_om") ? Number(g("pricing_deal_terms", "cap_rate_om")).toFixed(2) + "%" : ""],
      ["DSCR (OM)", g("debt_assumptions", "dscr_om") ? Number(g("debt_assumptions", "dscr_om")).toFixed(2) + "x" : ""],
      ["DSCR (Adjusted)", g("debt_assumptions", "dscr_adjusted") ? Number(g("debt_assumptions", "dscr_adjusted")).toFixed(2) + "x" : ""],
      ["Cash-on-Cash (OM)", g("returns", "cash_on_cash_om") ? Number(g("returns", "cash_on_cash_om")).toFixed(2) + "%" : ""],
      ["Breakeven Occupancy", g("returns", "breakeven_occupancy") ? Number(g("returns", "breakeven_occupancy")).toFixed(1) + "%" : ""],
    ].filter(([, v]) => v) as [string, string][];
  } else {
    // Retail (unchanged)
    metrics = [
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
    ].filter(([, v]) => v) as [string, string][];
  }

  // === Build signals table based on asset type ===
  let signals: [string, string][];

  if (analysisType === "land") {
    signals = [
      ["Overall", g("signals", "overall_signal")],
      ["Pricing", g("signals", "pricing_signal") || g("signals", "cap_rate_signal")],
      ["Location", g("signals", "location_signal") || g("signals", "occupancy_signal")],
      ["Zoning / Entitlement", g("signals", "zoning_signal")],
      ["Utilities / Power", g("signals", "utilities_signal")],
      ["Access / Frontage", g("signals", "access_signal")],
      ["Recommendation", g("signals", "recommendation")],
    ].filter(([, v]) => v) as [string, string][];
  } else if (analysisType === "industrial") {
    signals = [
      ["Overall", g("signals", "overall_signal")],
      ["Cap Rate", g("signals", "cap_rate_signal")],
      ["DSCR", g("signals", "dscr_signal")],
      ["Occupancy", g("signals", "occupancy_signal")],
      ["Basis", g("signals", "basis_signal")],
      ["Functionality", g("signals", "functionality_signal") || g("signals", "tenant_quality_signal")],
      ["Income Quality", g("signals", "income_quality_signal")],
      ["Recommendation", g("signals", "recommendation")],
    ].filter(([, v]) => v) as [string, string][];
  } else if (analysisType === "office") {
    signals = [
      ["Overall", g("signals", "overall_signal")],
      ["Cap Rate", g("signals", "cap_rate_signal")],
      ["DSCR", g("signals", "dscr_signal")],
      ["Occupancy Stability", g("signals", "occupancy_signal")],
      ["Tenant Mix", g("signals", "tenant_mix_signal") || g("signals", "tenant_quality_signal")],
      ["Lease Rollover", g("signals", "rollover_signal")],
      ["Capital Exposure", g("signals", "capital_exposure_signal")],
      ["Recommendation", g("signals", "recommendation")],
    ].filter(([, v]) => v) as [string, string][];
  } else {
    signals = [
      ["Overall", g("signals", "overall_signal")],
      ["Cap Rate", g("signals", "cap_rate_signal")],
      ["DSCR", g("signals", "dscr_signal")],
      ["Occupancy", g("signals", "occupancy_signal")],
      ["Basis", g("signals", "basis_signal")],
      ["Tenant Quality", g("signals", "tenant_quality_signal")],
      ["Rollover Risk", g("signals", "rollover_signal")],
      ["Recommendation", g("signals", "recommendation")],
    ].filter(([, v]) => v) as [string, string][];
  }

  // === Build type-specific addon section ===
  let addonSection = "";

  if (analysisType === "industrial") {
    const addonRows = [
      ["Clear Height", g("industrial_addons", "clear_height")],
      ["Loading Type", g("industrial_addons", "loading_type")],
      ["Dock / Door Count", g("industrial_addons", "loading_count")],
      ["Trailer Parking", g("industrial_addons", "trailer_parking")],
      ["Office Finish %", g("industrial_addons", "office_finish_pct")],
      ["Tenant Type", g("industrial_addons", "industrial_tenant_type")],
      ["Notes", g("industrial_addons", "industrial_notes")],
    ].filter(([, v]) => v);

    if (addonRows.length > 0) {
      addonSection = `
<h2>Industrial Property Details</h2>
<table>
<tr><th>Attribute</th><th>Value</th></tr>
${addonRows.map(([label, val]) => `<tr><td>${label}</td><td class="metric-val">${val}</td></tr>`).join("\n")}
</table>`;
    }
  } else if (analysisType === "office") {
    const addonRows = [
      ["Suite Count", g("office_addons", "suite_count")],
      ["Medical Office", g("office_addons", "medical_flag") === true ? "Yes" : g("office_addons", "medical_flag") === false ? "No" : null],
      ["Major Tenant Mix", g("office_addons", "major_tenant_mix")],
      ["Parking Ratio", g("office_addons", "parking_ratio")],
      ["TI/LC Signal", g("office_addons", "ti_lc_signal")],
      ["Near-Term Expirations", g("office_addons", "lease_expirations_near_term")],
      ["Notes", g("office_addons", "office_notes")],
    ].filter(([, v]) => v);

    if (addonRows.length > 0) {
      addonSection = `
<h2>Office Property Details</h2>
<table>
<tr><th>Attribute</th><th>Value</th></tr>
${addonRows.map(([label, val]) => `<tr><td>${label}</td><td class="metric-val">${val}</td></tr>`).join("\n")}
</table>`;
    }
  } else if (analysisType === "land") {
    const addonRows = [
      ["Usable Acres", g("land_addons", "usable_acres")],
      ["Zoning", g("land_addons", "zoning")],
      ["Planned Use", g("land_addons", "planned_use")],
      ["Frontage", g("land_addons", "frontage_signal")],
      ["Access", g("land_addons", "access_signal")],
      ["Utilities", g("land_addons", "utilities_signal")],
      ["Power Proximity", g("land_addons", "power_proximity_signal")],
      ["Notes", g("land_addons", "land_notes")],
    ].filter(([, v]) => v);

    if (addonRows.length > 0) {
      addonSection = `
<h2>Site Characteristics</h2>
<table>
<tr><th>Attribute</th><th>Value</th></tr>
${addonRows.map(([label, val]) => `<tr><td>${label}</td><td class="metric-val">${val}</td></tr>`).join("\n")}
</table>`;
    }
  }

  // === Build the brief title based on type ===
  const briefTitle = analysisType === "land"
    ? "First-Pass Land Analysis Brief"
    : `First-Pass ${typeLabel} Underwriting Brief`;

  const disclaimer = analysisType === "land"
    ? "This is a first-pass land analysis based on the provided documents and clearly labeled assumptions. Directional assessment only - not a final acquisition model."
    : "This is a first-pass underwriting screen based on the provided documents and clearly labeled assumptions. Directional assessment only - not a final investment model.";

  // Build brief section HTML (supports structured JSON or legacy plain text)
  let briefSectionHtml = "";
  try {
    const briefObj = JSON.parse(brief);
    if (briefObj && typeof briefObj.overview === "string") {
      briefSectionHtml = `<div class="brief-text"><p>${briefObj.overview}</p></div>`;
      if (briefObj.strengths?.length) {
        briefSectionHtml += `<h3>Key Strengths</h3>`;
        briefSectionHtml += briefObj.strengths.map((s: string) => `<div class="strength-item"><span class="strength-mark">✓</span>${s}</div>`).join("");
      }
      if (briefObj.concerns?.length) {
        briefSectionHtml += `<h3>Primary Concerns</h3>`;
        briefSectionHtml += briefObj.concerns.map((c: string) => `<div class="concern-item"><span class="concern-mark">△</span>${c}</div>`).join("");
      }
    }
  } catch {
    // Legacy plain text brief
    briefSectionHtml = `<div class="brief-text">${(brief || "No brief generated.").split("\n").map(p => p.trim() ? `<p>${p}</p>` : "").join("")}</div>`;
  }
  if (!briefSectionHtml) {
    briefSectionHtml = `<div class="brief-text">${(brief || "No brief generated.").split("\n").map(p => p.trim() ? `<p>${p}</p>` : "").join("")}</div>`;
  }

  // ==========================================================
  // EXTENDED MEMO SECTIONS - derived from parsed fields
  // ==========================================================

  const briefAskPrice = Number(g("pricing_deal_terms", "asking_price")) || 0;
  const briefNOI = Number(g("expenses", "noi_om")) || 0;
  const briefNOIAdj = Number(g("expenses", "noi_adjusted")) || 0;
  const briefCap = Number(g("pricing_deal_terms", "cap_rate_om")) || 0;
  const briefOcc = Number(g("property_basics", "occupancy_pct")) || 0;
  const briefWale = Number(g("property_basics", "wale_years")) || Number(g("rent_roll", "weighted_avg_lease_term")) || 0;
  const briefSF = Number(g("property_basics", "building_sf")) || 0;
  const briefYear = Number(g("property_basics", "year_built")) || 0;
  const briefTenants = Number(g("property_basics", "tenant_count")) || 0;
  const briefCity = g("property_basics", "city") || "";
  const briefState = g("property_basics", "state") || "";
  const briefLoc = [briefCity, briefState].filter(Boolean).join(", ");

  // Categorize the deal for thesis framing
  const isStabilized = briefOcc >= 90 && briefWale >= 3;
  const isLeaseUp = briefOcc > 0 && briefOcc < 85;
  const isValueAdd = briefOcc >= 85 && briefOcc < 93 && briefCap >= 7;
  const dealCategory = analysisType === "land" ? "Development" : isStabilized ? "Stabilized Core / Core-Plus" : isLeaseUp ? "Lease-Up / Value-Add" : isValueAdd ? "Value-Add" : "Transitional";

  // Investment Thesis paragraph
  let thesisHtml = "";
  if (analysisType === "land") {
    thesisHtml = `<p>This is a land transaction. The investment return will be driven by entitlement, infrastructure, and market absorption rather than in-place cash flow. Key value creation levers are zoning, utility availability, and proximity to demand drivers. Exit strategy assumes sale to a vertical developer or end-user once the site is entitled and shovel-ready.</p>`;
  } else {
    thesisHtml = `<p>This is a ${dealCategory.toLowerCase()} ${typeLabel.toLowerCase()} opportunity${briefLoc ? " in " + briefLoc : ""}. `;
    if (briefAskPrice > 0 && briefNOI > 0) {
      thesisHtml += `At the asking price of ${fmt$(briefAskPrice)}, the OM NOI of ${fmt$(briefNOI)} implies a ${briefCap > 0 ? briefCap.toFixed(2) + "%" : "cap rate derived from the OM"}. `;
    }
    if (isStabilized) {
      thesisHtml += `With ${briefOcc}% occupancy and a ${briefWale.toFixed(1)}-year WALE, cash flow is predictable and the investment case rests on holding quality in-place income, capturing modest rent growth, and exiting into a stabilized market. `;
    } else if (isLeaseUp) {
      thesisHtml += `Occupancy of ${briefOcc}% represents meaningful lease-up upside — the investment case depends on executing a lease-up plan within 12–24 months and re-underwriting the property at stabilized NOI before refinancing or exit. `;
    } else if (isValueAdd) {
      thesisHtml += `This sits in classic value-add territory — ${briefOcc}% occupancy with modest rent and expense optimization opportunity. Investor returns require execution on both operational lifts and modest capital investment. `;
    }
    thesisHtml += `A typical hold period of ${isStabilized ? "7–10 years" : isLeaseUp ? "3–5 years" : "5–7 years"} is appropriate for this profile.</p>`;
  }

  // Market Context
  let marketContext = "";
  if (analysisType === "retail") {
    marketContext = `<p>Retail cap rates have widened 75–125 bps since 2022 as interest rates repriced debt. Neighborhood centers with necessity-based tenants (grocery, pharmacy, service retail) have held up better than discretionary retail. Evaluate this property's anchor stability, co-tenancy protections, and tenant sales performance relative to national chain averages. Rent growth in strong retail submarkets is running 2–4% per year; weak submarkets are flat to down.</p>`;
  } else if (analysisType === "industrial") {
    marketContext = `<p>Industrial remains the strongest-performing CRE sector, though cap rates have moved 50–100 bps off 2022 lows. Class A distribution with modern specs (32'+ clear, cross-dock, trailer parking) continues to command premiums. Class B product with lower clears, limited loading, or functional obsolescence is facing cap rate widening. Rent growth varies dramatically by submarket — port markets and major distribution hubs outperform secondary logistics nodes. Underwrite conservative rent growth unless you have submarket-specific evidence.</p>`;
  } else if (analysisType === "office") {
    marketContext = `<p>Office remains the most challenging sector post-pandemic. Sublease space is elevated in most markets, and tenant TI requirements have increased materially as tenants downsize. Medical office and government / mission-critical occupied office has held value; traditional multi-tenant office has experienced both occupancy and rent softening. Verify current submarket vacancy, TI packages being offered on new deals, and the building's competitive positioning against newer or recently renovated product.</p>`;
  } else if (analysisType === "land") {
    marketContext = `<p>Land values have been volatile as capital markets repriced development risk. Entitled and shovel-ready land with utilities in place retains value; raw or speculatively-zoned land has widened significantly. Evaluate realistic entitlement timeline, political risk in the jurisdiction, and absorption for the intended use. Development land pricing should be back-solved from residual value analysis: projected stabilized value minus hard costs, soft costs, financing, and required developer profit.</p>`;
  } else if (analysisType === "multifamily") {
    marketContext = `<p>Multifamily cap rates widened significantly in 2023–2024 and have stabilized. New deliveries in high-growth markets have created short-term rent softness, but longer-term fundamentals remain supported by household formation and for-sale affordability pressures. Evaluate concession trends, lease-trade-out performance, and forward supply pipeline. Underwrite realistic rent growth — typically 2–3% per year in stabilized markets.</p>`;
  }

  // Financing Strategy
  const financingHtml = analysisType === "land"
    ? `<p>Land typically does not support conventional permanent financing. Expect all-cash or short-term land loans at 55–65% LTV, rates 150–250 bps above permanent debt, and 1–3 year terms. If the seller is willing to carry, land deals are a classic use case — 25–40% down with a 2–5 year balloon is common.</p>`
    : `<p>A ${typeLabel.toLowerCase()} property of this profile typically finances at 60–70% LTV with a 25-year amortization. Current market rates are 6.75–7.75% for conventional CMBS / agency debt. If the seller has a below-market existing loan, a loan assumption may be the most attractive structure — ask the broker explicitly about assumption terms. Alternatively, bridge-to-perm or HUD 221(d)(4) may apply depending on the specific property and sponsor. For a full menu of structures, review the accompanying Creative Deal Structuring document.</p>`;

  // Exit Strategy
  let exitHtml = "";
  if (analysisType === "land") {
    exitHtml = `<p>Primary exit: sale to a vertical developer or end-user after entitlements are in place. Secondary exit: JV with a developer retaining participation. Tertiary: hold as long-term land bank. Target an all-in cost basis that leaves at least a 20% margin to the pro forma residual value at stabilization.</p>`;
  } else if (briefNOI > 0) {
    const yr5NOI = briefNOI * Math.pow(1.025, 5);
    const yr10NOI = briefNOI * Math.pow(1.025, 10);
    const exit5 = yr5NOI / 0.075;
    const exit10 = yr10NOI / 0.075;
    exitHtml = `<p>At a 7.5% exit cap (approximately 25 bps above entry), the implied exit values are ${fmt$(Math.round(exit5))} at Year 5 and ${fmt$(Math.round(exit10))} at Year 10, assuming 2.5% annual NOI growth. These are directional — tighten the exit cap 25–50 bps for stronger-than-expected performance or widen 50–100 bps for softer execution. See the 10-Year Cash Flow tab in the Workbook for full levered IRR calculation.</p>`;
  } else {
    exitHtml = `<p>Exit analysis requires a normalized NOI assumption. See the Workbook for scenario-based exit value modeling.</p>`;
  }

  // Value Creation Opportunities — derived from signals and metrics
  const valueLevers: string[] = [];
  if (isLeaseUp) valueLevers.push(`<strong>Lease-up to stabilization.</strong> At ${briefOcc}% occupancy, bringing the property to a market-stabilized level (typically 92–95% for ${typeLabel.toLowerCase()}) is the primary lever. Quantify the NOI lift and the capital required to achieve it.`);
  if (briefWale > 0 && briefWale < 4) valueLevers.push(`<strong>Mark rents to market on rollover.</strong> With a ${briefWale.toFixed(1)}-year WALE, there's opportunity to re-lease at current market rates as tenants roll. Verify current market rates vs. in-place rents before underwriting the bump.`);
  if (briefYear > 0 && 2026 - briefYear > 15) valueLevers.push(`<strong>Selective capital investment.</strong> A ${2026 - briefYear}-year-old building may benefit from modest capital modernization (signage, lighting, common area refresh) that attracts better tenants and supports rent premiums.`);
  if (analysisType === "retail") valueLevers.push(`<strong>Out-parcel or pad development.</strong> Confirm with the broker whether any out-parcels are developable under current zoning and not encumbered by tenant exclusives.`);
  if (analysisType === "office") valueLevers.push(`<strong>Convert vacant floors to a competitive spec suite program.</strong> Pre-built move-in-ready suites capture smaller tenants quickly and justify premium rents.`);
  if (analysisType === "industrial") valueLevers.push(`<strong>Right-size trailer parking or add yard space.</strong> Industrial tenants will pay premiums for incremental trailer parking or secured yard — quantify capacity and demand.`);
  if (valueLevers.length === 0) valueLevers.push(`<strong>Operating efficiency.</strong> Benchmark in-place expenses against comparable properties — even a 5% expense reduction compounds meaningfully at the exit cap.`);

  const valueLeversHtml = `<ul>${valueLevers.map(v => `<li>${v}</li>`).join("")}</ul>`;

  // Key Risks
  const risks: string[] = [];
  const capSig = String(g("signals", "cap_rate_signal") || "").toLowerCase();
  const dscrSig = String(g("signals", "dscr_signal") || "").toLowerCase();
  const occSig = String(g("signals", "occupancy_signal") || "").toLowerCase();
  const rollSig = String(g("signals", "rollover_signal") || "").toLowerCase();
  const tenSig = String(g("signals", "tenant_quality_signal") || "").toLowerCase();
  if (capSig.includes("red") || capSig.includes("yellow")) risks.push(`<strong>Entry cap rate pressure.</strong> The stated cap rate was flagged during the OM review. Pressure test against recent submarket comps before finalizing the offer.`);
  if (dscrSig.includes("red") || dscrSig.includes("yellow")) risks.push(`<strong>Financeability.</strong> The projected debt service coverage is tight for current debt markets. If the deal cannot support lender DSCR minimums, equity requirements will increase.`);
  if (occSig.includes("red") || occSig.includes("yellow") || isLeaseUp) risks.push(`<strong>Occupancy risk.</strong> Current occupancy introduces lease-up execution risk. Every month of delayed lease-up meaningfully impacts IRR at typical hold periods.`);
  if (rollSig.includes("red") || rollSig.includes("yellow")) risks.push(`<strong>Rollover concentration.</strong> Near-term lease expirations create retention and re-tenanting risk. Build a tenant-by-tenant renewal probability and required TI/LC reserve.`);
  if (tenSig.includes("red") || tenSig.includes("yellow")) risks.push(`<strong>Tenant credit.</strong> Tenant credit quality was flagged. Confirm which tenants have corporate vs. personal guaranties and obtain recent financials on non-credit tenants.`);
  if (analysisType === "office") risks.push(`<strong>Sector headwinds.</strong> Office faces structural demand softness in most markets. Underwrite conservative rent growth and longer-than-historical lease-up assumptions.`);
  if (risks.length === 0) risks.push(`<strong>Interest rate and cap rate risk.</strong> Every CRE deal faces the possibility of cap rate widening at exit. Stress test the IRR at an exit cap 100 bps wider than entry and confirm the deal still meets your minimum return hurdle.`);

  const risksHtml = `<ul>${risks.map(r => `<li>${r}</li>`).join("")}</ul>`;

  // Next Steps
  const nextSteps = [
    `Submit LOI at ${briefAskPrice > 0 ? fmt$(Math.round(briefAskPrice * 0.95)) + " (approximately 95% of ask)" : "an appropriate opening offer price"} with 30-day DD and 60-day close — see accompanying LOI draft.`,
    `Send the broker the Broker Questions document — prioritize the red-flag questions first.`,
    `Engage legal counsel for PSA negotiation assuming LOI is accepted.`,
    `Order preliminary title report and Phase I environmental as soon as PSA is executed.`,
    `Obtain at least two debt quotes during the DD period; verify the DSCR and LTV assumptions hold at quoted terms.`,
    `For creative structures (seller financing, assumption, JV), review the Creative Deal Structuring document before the first broker call.`,
  ];

  const nextStepsHtml = `<ol>${nextSteps.map(s => `<li>${s}</li>`).join("")}</ol>`;

  // Determine whether to show extended memo sections (skip if briefNOI and briefAskPrice both 0)
  const showExtended = briefAskPrice > 0 || analysisType === "land";

  // Build HTML document that Word can open
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; max-width: 7.5in; margin: 0.75in auto; line-height: 1.5; }
  h1 { font-size: 18pt; color: #0B1120; border-bottom: 2px solid #C49A3C; padding-bottom: 8px; margin-top: 0; }
  h2 { font-size: 14pt; color: #253352; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; }
  h3 { font-size: 12pt; color: #5A7091; margin-top: 16px; margin-bottom: 6px; }
  p { margin: 6px 0; }
  .subtitle { font-size: 9pt; color: #8899B0; font-style: italic; margin-bottom: 16px; }
  .type-badge { display: inline-block; background: #F0F4FF; color: #3B5998; padding: 4px 12px; border-radius: 4px; font-size: 10pt; font-weight: 600; margin-bottom: 12px; }
  .deal-cat-badge { display: inline-block; background: #FEF3C7; color: #92400E; padding: 4px 12px; border-radius: 4px; font-size: 10pt; font-weight: 600; margin-bottom: 12px; margin-left: 6px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }
  th { background: #F6F8FB; text-align: left; padding: 6px 10px; border: 1px solid #D8DFE9; font-weight: 600; color: #5A7091; }
  td { padding: 5px 10px; border: 1px solid #D8DFE9; }
  .metric-val { font-weight: 600; }
  .signal-green { color: #059669; }
  .signal-yellow { color: #D97706; }
  .signal-red { color: #DC2626; }
  .brief-text { margin: 12px 0; }
  .brief-text p { margin: 8px 0; line-height: 1.6; }
  .strength-item, .concern-item { margin: 6px 0; line-height: 1.5; }
  .strength-mark { color: #059669; font-weight: 700; margin-right: 6px; }
  .concern-mark { color: #D97706; font-weight: 700; margin-right: 6px; }
  ul, ol { margin: 8px 0 8px 22px; }
  li { margin: 6px 0; }
  .callout { background: #FFFBEB; border-left: 3px solid #D97706; padding: 10px 14px; margin: 14px 0; font-size: 10pt; }
  .callout-info { background: #EFF6FF; border-left: 3px solid #2563EB; padding: 10px 14px; margin: 14px 0; font-size: 10pt; }
  .memo-toc { background: #F9FAFB; border: 1px solid #E5E7EB; padding: 10px 14px; font-size: 10pt; margin-bottom: 18px; }
  .memo-toc strong { color: #253352; }
  .deal-category { color: #92400E; font-weight: 600; }
</style></head><body>
<h1>${briefTitle}</h1>
<h2 style="border: none; margin-top: 4px;">${propertyName}</h2>
<div class="type-badge">${typeLabel} Analysis</div>${showExtended ? `<div class="deal-cat-badge">${dealCategory}</div>` : ""}
<p class="subtitle">${disclaimer}</p>

${showExtended ? `<div class="memo-toc">
<strong>Contents:</strong> Executive Summary &middot; Investment Thesis &middot; Key Metrics &middot; Signal Assessment &middot; Market Context &middot; Financing Strategy &middot; Exit Strategy &middot; Value Creation &middot; Key Risks &middot; Next Steps
</div>` : ""}

<h2>Executive Summary</h2>
${briefSectionHtml}

${showExtended ? `<h2>Investment Thesis</h2>
${thesisHtml}` : ""}

${addonSection}

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
    if (String(val).includes("Green") || String(val).includes("green") || String(val).includes("🟢")) cls = "signal-green";
    else if (String(val).includes("Yellow") || String(val).includes("yellow") || String(val).includes("🟡")) cls = "signal-yellow";
    else if (String(val).includes("Red") || String(val).includes("red") || String(val).includes("🔴")) cls = "signal-red";
    return `<tr><td>${label}</td><td class="${cls}">${val}</td></tr>`;
  }).join("\n")}
</table>

${showExtended ? `<h2>Market Context</h2>
${marketContext}

<h2>Financing Strategy</h2>
${financingHtml}

<h2>Exit Strategy</h2>
${exitHtml}

<h2>Value Creation Opportunities</h2>
${valueLeversHtml}

<h2>Key Risks</h2>
${risksHtml}

<h2>Next Steps</h2>
${nextStepsHtml}

<div class="callout-info">
<strong>Accompanying documents.</strong> This Brief is one part of a complete deal package. See also: <em>Underwriting Workbook</em> (scenario model, sensitivity, 10-year cash flow), <em>LOI Draft</em> (ready-to-send opening offer), <em>Broker Questions</em> (red-flag-prioritized diligence list), and <em>Creative Deal Structuring</em> (six alternative structures with deal-specific fit analysis).
</div>` : ""}

<p class="subtitle" style="margin-top: 24px;">Generated by Deal Signals - ${typeLabel} Model</p>
</body></html>`;

  // Download as .doc (HTML format that Word opens natively)
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = propertyName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  const suffix = analysisType !== "retail" ? `-${typeLabel}` : "";
  a.href = url;
  a.download = `${safeName}${suffix}-First-Pass-Brief.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

