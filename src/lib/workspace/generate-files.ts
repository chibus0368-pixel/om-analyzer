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
// XLSX GENERATION — Scenario Model Workbook
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
  // SHEET 1: SCENARIO MODEL — the main interactive sheet
  // ================================================================
  if (analysisType !== "land") {
    const ws = wb.addWorksheet("Scenario Model");
    ws.getColumn(1).width = 30; ws.getColumn(2).width = 22; ws.getColumn(3).width = 32;
    let r = 2;

    // Title
    ws.getCell(r, 1).value = `${propertyName}`; ws.getCell(r, 1).font = titleFont; r++;
    ws.getCell(r, 1).value = `${typeLabel} Underwriting — Scenario Model`; ws.getCell(r, 1).font = { ...noteFont, size: 10 }; r++;
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

    const refCam = inputRow(ws, r++, "CAM / Common Area", camExp, camExp > 0 ? "From OM" : "Not in OM — enter if known", "$#,##0");
    const refTax = inputRow(ws, r++, "Real Estate Taxes", propTax, propTax > 0 ? "From OM" : "Not in OM — verify with county", "$#,##0");
    const refIns = inputRow(ws, r++, "Insurance", insurance, insurance > 0 ? "From OM" : "Not in OM — get quote", "$#,##0");
    const refMgmt = inputRow(ws, r++, "Management Fee", mgmtFee, mgmtFee > 0 ? "From OM" : "Not in OM — typically 3-6% EGI", "$#,##0");
    const refReserves = inputRow(ws, r++, "Reserves / CapEx", 0, "Annual reserves — enter your estimate", "$#,##0");
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
    ws.getCell(r, 1).value = "RETURNS — ALL CALCULATED"; ws.getCell(r, 1).font = secFont; r++;
    hdrRow(ws, r, ["Metric", "Value", "Notes"]); r++;

    formulaRow(ws, r++, "Cap Rate", `${refNOI}/${refPrice}`, "0.00%", "NOI ÷ Price", { bold: true });
    formulaRow(ws, r++, "Price / SF", `${refPrice}/${refSf}`, "$#,##0");
    const refCashFlow = formulaRow(ws, r++, "Annual Cash Flow", `${refNOI}-${refDS}`, "$#,##0", "NOI − Debt Service");
    formulaRow(ws, r++, "DSCR", `${refNOI}/${refDS}`, "0.00\"x\"", "NOI ÷ Debt Service — target >1.25x", { bold: true });
    formulaRow(ws, r++, "Cash-on-Cash", `${refCashFlow}/${refEquity}`, "0.00%", "Cash Flow ÷ Equity", { bold: true });
    formulaRow(ws, r++, "Debt Yield", `${refNOI}/${refLoan}`, "0.00%", "NOI ÷ Loan — lender metric");
    formulaRow(ws, r++, "Monthly Cash Flow", `${refCashFlow}/12`, "$#,##0");
    r++;

    // ── SECTION: QUICK SCENARIOS ──
    ws.getCell(r, 1).value = "QUICK SCENARIOS — Change price above to see these update"; ws.getCell(r, 1).font = secFont; r++;
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
    ws2.getCell(r, 1).value = `RENT ROLL — ${propertyName}`; ws2.getCell(r, 1).font = titleFont; r += 2;
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
  // SHEET 3: OM DATA — raw reference from the document
  // ================================================================
  const wsRef = wb.addWorksheet(analysisType === "land" ? "Site Data" : "OM Data");
  let r = 2;
  wsRef.getColumn(1).width = 28; wsRef.getColumn(2).width = 28; wsRef.getColumn(3).width = 30;
  wsRef.getCell(r, 1).value = `${propertyName} — ${analysisType === "land" ? "SITE" : "OM"} REFERENCE DATA`; wsRef.getCell(r, 1).font = titleFont; r++;
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
    wsLand.getCell(lr, 1).value = `LAND PRICING — ${propertyName}`; wsLand.getCell(lr, 1).font = titleFont; lr += 2;
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
    ? "This is a first-pass land analysis based on the provided documents and clearly labeled assumptions. Directional assessment only — not a final acquisition model."
    : "This is a first-pass underwriting screen based on the provided documents and clearly labeled assumptions. Directional assessment only — not a final investment model.";

  // Build HTML document that Word can open
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; max-width: 7.5in; margin: 0.75in auto; line-height: 1.5; }
  h1 { font-size: 18pt; color: #0B1120; border-bottom: 2px solid #C49A3C; padding-bottom: 8px; margin-top: 0; }
  h2 { font-size: 14pt; color: #253352; margin-top: 24px; margin-bottom: 8px; }
  h3 { font-size: 12pt; color: #5A7091; margin-top: 16px; margin-bottom: 6px; }
  p { margin: 6px 0; }
  .subtitle { font-size: 9pt; color: #8899B0; font-style: italic; margin-bottom: 16px; }
  .type-badge { display: inline-block; background: #F0F4FF; color: #3B5998; padding: 4px 12px; border-radius: 4px; font-size: 10pt; font-weight: 600; margin-bottom: 12px; }
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
<h1>${briefTitle}</h1>
<h2>${propertyName}</h2>
<div class="type-badge">${typeLabel} Analysis</div>
<p class="subtitle">${disclaimer}</p>

<h2>Initial Assessment</h2>
<div class="brief-text">${(brief || "No brief generated.").split("\n").map(p => p.trim() ? `<p>${p}</p>` : "").join("")}</div>

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

<p class="subtitle" style="margin-top: 24px;">Generated by Deal Signals — ${typeLabel} Model</p>
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
