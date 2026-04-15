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
// XLSX GENERATION - Institutional Underwriting Workbook
// ============================================================
// Design principles:
//   - ONE source of truth for every assumption (the Assumptions sheet).
//     Every downstream sheet references those cells — no duplicated inputs.
//   - Clean banner section dividers, full-bleed title bars, hidden gridlines.
//   - All numbers are stored as numbers with proper numFmt (never as strings).
//   - Consistent color coding: blue text = hardcoded input, black = formula,
//     green = cross-sheet link, yellow fill = editable assumption.

// Palette
const C_NAVY   = "FF0F172A";
const C_NAVY2  = "FF1E293B";
const C_ACCENT = "FF84CC16";
const C_LINE   = "FFE5E7EB";
const C_SUBTLE = "FFF8FAFC";
const C_YELLOW = "FFFFF4C2";
const C_INPUT  = "FF0000CC";
const C_LINK   = "FF008000";
const C_RED    = "FFB91C1C";
const C_GRN    = "FF15803D";
const C_MUTED  = "FF64748B";

const navy    = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: C_NAVY } };
const navy2   = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: C_NAVY2 } };
const ltBlue  = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFEFF3FA" } };
const yellow  = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: C_YELLOW } };
const white   = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFFF" } };
const subtle  = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF8FAFC" } };
const ltGreen = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF0FDF4" } };

const hdrFont    = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
const titleFont  = { bold: true, color: { argb: "FFFFFFFF" }, size: 16, name: "Arial" };
const subTitleFont = { bold: false, color: { argb: "FFCBD5E1" }, size: 10, name: "Arial", italic: true };
const secFont    = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
const labelFont  = { bold: false, color: { argb: "FF1F2937" }, size: 10, name: "Arial" };
const boldLabel  = { bold: true, color: { argb: C_NAVY }, size: 10, name: "Arial" };
const valFont    = { color: { argb: "FF000000" }, size: 10, name: "Arial" };
const linkFont   = { color: { argb: C_LINK }, size: 10, name: "Arial" }; // cross-sheet link
const inputFont  = { bold: true, color: { argb: C_INPUT }, size: 10, name: "Arial" };
const noteFont   = { color: { argb: C_MUTED }, size: 9, name: "Arial", italic: true };
const redFont    = { bold: true, color: { argb: C_RED }, size: 10, name: "Arial" };
const greenFont  = { bold: true, color: { argb: C_GRN }, size: 10, name: "Arial" };
const bigMetric  = { bold: true, color: { argb: C_NAVY }, size: 20, name: "Arial" };

const thinBorder = { style: "thin" as const, color: { argb: C_LINE } };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

// Number format presets (zero renders as "-" so empty data doesn't shout $0)
const FMT_MONEY = '_-"$"* #,##0_-;_-"$"* (#,##0);_-"$"* "-"_-;_-@_-';
const FMT_MONEY_D = '_-"$"* #,##0.00_-;_-"$"* (#,##0.00);_-"$"* "-"_-;_-@_-';
const FMT_PCT = '0.00%;(0.00%);"-"';
const FMT_PCT1 = '0.0%;(0.0%);"-"';
const FMT_NUM = '#,##0;(#,##0);"-"';
const FMT_MULT = '0.00"x";(0.00"x");"-"';
const FMT_YEAR = '0';

// Helper: full-width sheet title banner (row height 32, merged, navy bg)
function sheetTitleBanner(ws: any, r: number, title: string, subtitle: string, colSpan: number): number {
  ws.mergeCells(r, 1, r, colSpan);
  const c = ws.getCell(r, 1);
  c.value = title;
  c.font = titleFont;
  c.fill = navy;
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(r).height = 30;
  r++;
  if (subtitle) {
    ws.mergeCells(r, 1, r, colSpan);
    const s = ws.getCell(r, 1);
    s.value = subtitle;
    s.font = subTitleFont;
    s.fill = navy;
    s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(r).height = 20;
    r++;
  }
  // Accent strip
  ws.mergeCells(r, 1, r, colSpan);
  const a = ws.getCell(r, 1);
  a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_ACCENT } };
  ws.getRow(r).height = 3;
  return r + 2; // leave one blank row after banner
}

// Helper: full-width section header band (merged, dark navy, 22px row)
function sectionBand(ws: any, r: number, label: string, colSpan: number): number {
  ws.mergeCells(r, 1, r, colSpan);
  const c = ws.getCell(r, 1);
  c.value = label.toUpperCase();
  c.font = { ...secFont, size: 10 };
  c.fill = navy2;
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  c.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  ws.getRow(r).height = 22;
  return r + 1;
}

// Helper: column header row
function hdrRow(ws: any, r: number, vals: string[], widths?: number[]) {
  vals.forEach((v, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = v;
    c.font = hdrFont;
    c.fill = navy2;
    c.border = borders;
    c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right", indent: i === 0 ? 1 : 0 };
  });
  ws.getRow(r).height = 20;
  if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// Helper: zebra-stripe a data row based on index
function zebraFill(idx: number) {
  return idx % 2 === 0 ? white : subtle;
}

// Helper: label + value row (static data, number or string)
function dataRow(ws: any, r: number, label: string, val: any, note?: string, opts?: { bold?: boolean; red?: boolean; green?: boolean; numFmt?: string; zebra?: number }) {
  const zf = opts?.zebra !== undefined ? zebraFill(opts.zebra) : white;
  const lc = ws.getCell(r, 1); lc.value = label; lc.font = opts?.bold ? boldLabel : labelFont; lc.fill = zf; lc.border = borders;
  lc.alignment = { vertical: "middle", indent: 1 };
  const vc = ws.getCell(r, 2); vc.value = val ?? ""; vc.font = opts?.red ? redFont : opts?.green ? greenFont : (opts?.bold ? boldLabel : valFont); vc.fill = zf; vc.border = borders;
  vc.alignment = { vertical: "middle", horizontal: "right" };
  if (opts?.numFmt) vc.numFmt = opts.numFmt;
  if (note !== undefined) { const nc = ws.getCell(r, 3); nc.value = note; nc.font = noteFont; nc.fill = zf; nc.border = borders; nc.alignment = { vertical: "middle", wrapText: true, indent: 1 }; }
}

// Helper: editable yellow input cell (returns absolute cross-sheet ref, e.g., 'Assumptions!$B$5')
function inputRow(
  ws: any, r: number, label: string, val: any, note?: string, numFmt?: string, opts?: { sheetName?: string; zebra?: number }
): string {
  const zf = opts?.zebra !== undefined ? zebraFill(opts.zebra) : white;
  const lc = ws.getCell(r, 1); lc.value = label; lc.font = boldLabel; lc.fill = zf; lc.border = borders;
  lc.alignment = { vertical: "middle", indent: 1 };
  const vc = ws.getCell(r, 2); vc.value = val; vc.font = inputFont; vc.fill = yellow; vc.border = borders;
  vc.alignment = { vertical: "middle", horizontal: "right" };
  if (numFmt) vc.numFmt = numFmt;
  if (note) { const nc = ws.getCell(r, 3); nc.value = note; nc.font = noteFont; nc.fill = zf; nc.border = borders; nc.alignment = { vertical: "middle", wrapText: true, indent: 1 }; }
  const sheetPrefix = opts?.sheetName ? `'${opts.sheetName}'!` : "";
  return `${sheetPrefix}$B$${r}`;
}

// Helper: formula cell (light green fill, computed)
function formulaRow(ws: any, r: number, label: string, formula: string, numFmt: string, note?: string, opts?: { bold?: boolean; sheetName?: string; cross?: boolean; zebra?: number }): string {
  const zf = opts?.zebra !== undefined ? zebraFill(opts.zebra) : white;
  const lc = ws.getCell(r, 1); lc.value = label; lc.font = opts?.bold ? boldLabel : labelFont; lc.fill = zf; lc.border = borders;
  lc.alignment = { vertical: "middle", indent: 1 };
  const vc = ws.getCell(r, 2); vc.value = { formula }; vc.font = opts?.bold ? boldLabel : (opts?.cross ? linkFont : valFont); vc.fill = ltGreen; vc.border = borders;
  vc.alignment = { vertical: "middle", horizontal: "right" };
  if (numFmt) vc.numFmt = numFmt;
  if (note) { const nc = ws.getCell(r, 3); nc.value = note; nc.font = noteFont; nc.fill = zf; nc.border = borders; nc.alignment = { vertical: "middle", wrapText: true, indent: 1 }; }
  const sheetPrefix = opts?.sheetName ? `'${opts.sheetName}'!` : "";
  return `${sheetPrefix}$B$${r}`;
}

export async function generateUnderwritingXLSX(
  propertyName: string,
  fields: ExtractedField[],
  analysisType: AnalysisType = "retail",
  options?: { returnBlob?: boolean }
): Promise<void | { blob: Blob; filename: string }> {
  const exceljs = await loadExcelJS();
  const wb = new exceljs.Workbook();
  wb.creator = "Deal Signals";
  wb.company = "Deal Signals";
  wb.created = new Date();
  const g = (group: string, name: string) => getField(fields, group, name);

  const typeLabel =
    analysisType === "retail" ? "Retail" :
    analysisType === "industrial" ? "Industrial" :
    analysisType === "office" ? "Office" :
    analysisType === "multifamily" ? "Multifamily" : "Land";
  const addr = g("property_basics", "address") || "";
  const city = g("property_basics", "city") || "";
  const state = g("property_basics", "state") || "";
  const loc = [addr, city, state].filter(Boolean).join(", ");

  // ─────────────────────────────────────────────────────────────
  // LAND path — single Summary sheet (no income/expense model)
  // ─────────────────────────────────────────────────────────────
  if (analysisType === "land") {
    const wsS = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
    wsS.getColumn(1).width = 30; wsS.getColumn(2).width = 26; wsS.getColumn(3).width = 42;
    let r = 1;
    r = sheetTitleBanner(wsS, r, propertyName, loc ? `${loc} · ${typeLabel}` : typeLabel, 3);
    r = sectionBand(wsS, r, "Site Facts", 3);
    hdrRow(wsS, r++, ["Field", "Value", "Source"]);
    const rows: Array<[string, any, string | undefined, string | undefined]> = [
      ["Asking Price", Number(g("pricing_deal_terms", "asking_price")) || null, FMT_MONEY, "OM"],
      ["Acreage", Number(g("property_basics", "lot_acres")) || Number(g("property_basics", "usable_acres")) || null, '#,##0.00" ac"', "OM"],
      ["Price / Acre", Number(g("pricing_deal_terms", "price_per_acre")) || null, FMT_MONEY, "OM"],
      ["Zoning", g("land_zoning", "current_zoning") || g("land_addons", "zoning") || "", undefined, "OM"],
      ["Planned Use", g("land_zoning", "planned_use") || g("land_addons", "planned_use") || "", undefined, "OM"],
      ["Frontage", g("property_basics", "frontage_ft") || g("land_addons", "frontage_signal") || "", undefined, "OM"],
      ["Road Access", g("land_access", "road_access") || g("land_addons", "access_signal") || "", undefined, "OM"],
      ["Utilities", g("land_addons", "utilities_signal") || "", undefined, "OM"],
      ["Year Built", Number(g("property_basics", "year_built")) || null, FMT_YEAR, "OM"],
    ];
    rows.forEach(([label, val, fmt, note], i) => {
      dataRow(wsS, r++, label, val === null ? "" : val, note, { numFmt: fmt, zebra: i });
    });

    // Signals block
    r++;
    r = sectionBand(wsS, r, "AI Signals", 3);
    hdrRow(wsS, r++, ["Signal", "Assessment", ""]);
    const sigPairs: Array<[string, any]> = [
      ["Overall", g("signals", "overall_signal")],
      ["Pricing", g("signals", "pricing_signal")],
      ["Location", g("signals", "location_signal")],
      ["Zoning", g("signals", "zoning_signal")],
      ["Utilities", g("signals", "utilities_signal")],
    ];
    let si = 0;
    for (const [label, val] of sigPairs) {
      if (!val) continue;
      const isRed = String(val).toLowerCase().includes("red") || String(val).toLowerCase().includes("sell");
      const isGreen = String(val).toLowerCase().includes("green") || String(val).toLowerCase().includes("buy");
      dataRow(wsS, r++, label, val, "", { red: isRed, green: isGreen, zebra: si++ });
    }
    const rec = g("signals", "recommendation");
    if (rec) { r++; dataRow(wsS, r++, "Recommendation", rec, "", { bold: true }); }

    const safeName = propertyName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
    const filename = `${safeName}-Land-Underwriting.xlsx`;
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (options?.returnBlob) return { blob, filename };
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // INCOME-PRODUCING path (retail / industrial / office / multifamily)
  // ─────────────────────────────────────────────────────────────

  const askPrice    = Number(g("pricing_deal_terms", "asking_price")) || 0;
  const buildSfRaw  = Number(g("property_basics", "building_sf")) || 0;
  const noiOm       = Number(g("expenses", "noi_om")) || 0;
  const baseRent    = Number(g("income", "base_rent")) || 0;
  const nnnReimb    = Number(g("income", "nnn_reimbursements")) || 0;
  const otherInc    = Number(g("income", "other_income")) || 0;
  const camExp      = Number(g("expenses", "cam_expenses")) || 0;
  const propTax     = Number(g("expenses", "property_taxes")) || 0;
  const insurance   = Number(g("expenses", "insurance")) || 0;
  const mgmtFee     = Number(g("expenses", "management_fee")) || 0;
  const otherExp    = Number(g("expenses", "other_expenses")) || 0;
  const ltvStart    = (Number(g("debt_assumptions", "ltv")) || 65) / 100;
  const rateStart   = (Number(g("debt_assumptions", "interest_rate")) || 7.25) / 100;
  const amortStart  = Number(g("debt_assumptions", "amortization_years")) || 25;

  // ================================================================
  // SHEET: Assumptions — SINGLE SOURCE OF TRUTH for every input
  // ================================================================
  const wsA = wb.addWorksheet("Assumptions", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  const ASM = "Assumptions";
  wsA.getColumn(1).width = 32; wsA.getColumn(2).width = 18; wsA.getColumn(3).width = 44;
  let ar = 1;
  ar = sheetTitleBanner(wsA, ar, "Assumptions", "Every yellow cell is editable. All other sheets reference these values.", 3);

  // Section: Deal / Property
  ar = sectionBand(wsA, ar, "Deal & Property", 3);
  hdrRow(wsA, ar++, ["Input", "Value", "Notes"]);
  const aPrice   = inputRow(wsA, ar++, "Purchase Price", askPrice, "Editable — change to test scenarios", FMT_MONEY, { sheetName: ASM, zebra: 0 });
  const aBldgSf  = inputRow(wsA, ar++, "Building SF (GLA)", buildSfRaw || 1, "From OM", FMT_NUM, { sheetName: ASM, zebra: 1 });
  const aClosing = inputRow(wsA, ar++, "Closing Cost %", 0.02, "Typically 1.5% – 3.0%", FMT_PCT1, { sheetName: ASM, zebra: 2 });

  // Section: Income
  ar++;
  ar = sectionBand(wsA, ar, "Income", 3);
  hdrRow(wsA, ar++, ["Input", "Value", "Notes"]);
  const aBaseRent = inputRow(wsA, ar++, "Base Rent (Annual)", baseRent, "From OM rent roll", FMT_MONEY, { sheetName: ASM, zebra: 0 });
  const aReimb    = inputRow(wsA, ar++, "NNN Reimbursements", nnnReimb, "CAM + Tax + Insurance recoveries", FMT_MONEY, { sheetName: ASM, zebra: 1 });
  const aOther    = inputRow(wsA, ar++, "Other Income", otherInc, "Parking, late fees, percentage rent, etc.", FMT_MONEY, { sheetName: ASM, zebra: 2 });
  const aVacancy  = inputRow(wsA, ar++, "Vacancy & Credit Loss", 0.05, "Stress-test occupancy", FMT_PCT1, { sheetName: ASM, zebra: 3 });

  // Section: Operating Expenses
  ar++;
  ar = sectionBand(wsA, ar, "Operating Expenses", 3);
  hdrRow(wsA, ar++, ["Input", "Value", "Notes"]);
  const aCam      = inputRow(wsA, ar++, "CAM / Common Area", camExp, camExp ? "From OM" : "Not in OM — enter if known", FMT_MONEY, { sheetName: ASM, zebra: 0 });
  const aTax      = inputRow(wsA, ar++, "Real Estate Taxes", propTax, propTax ? "From OM" : "Verify with county assessor", FMT_MONEY, { sheetName: ASM, zebra: 1 });
  const aIns      = inputRow(wsA, ar++, "Insurance", insurance, insurance ? "From OM" : "Get broker quote", FMT_MONEY, { sheetName: ASM, zebra: 2 });
  const aMgmt     = inputRow(wsA, ar++, "Management Fee", mgmtFee, mgmtFee ? "From OM" : "Typically 3% – 6% of EGI", FMT_MONEY, { sheetName: ASM, zebra: 3 });
  const aReserves = inputRow(wsA, ar++, "Reserves / CapEx", 0, "Annual — $0.25 / SF is a common floor", FMT_MONEY, { sheetName: ASM, zebra: 4 });
  const aOtherExp = inputRow(wsA, ar++, "Other Expenses", otherExp, "", FMT_MONEY, { sheetName: ASM, zebra: 5 });

  // Section: Financing
  ar++;
  ar = sectionBand(wsA, ar, "Financing", 3);
  hdrRow(wsA, ar++, ["Input", "Value", "Notes"]);
  const aLTV   = inputRow(wsA, ar++, "LTV", ltvStart, "Loan-to-value", FMT_PCT1, { sheetName: ASM, zebra: 0 });
  const aRate  = inputRow(wsA, ar++, "Interest Rate", rateStart, "Annual", FMT_PCT, { sheetName: ASM, zebra: 1 });
  const aAmort = inputRow(wsA, ar++, "Amortization (Years)", amortStart, "", FMT_YEAR, { sheetName: ASM, zebra: 2 });

  // Section: Exit / Growth
  ar++;
  ar = sectionBand(wsA, ar, "Exit & Growth", 3);
  hdrRow(wsA, ar++, ["Input", "Value", "Notes"]);
  const aRentGr  = inputRow(wsA, ar++, "Rent Growth / Year", 0.025, "Typical CRE 2% – 3%", FMT_PCT1, { sheetName: ASM, zebra: 0 });
  const aExpGr   = inputRow(wsA, ar++, "Expense Growth / Year", 0.030, "Often outpaces rent growth", FMT_PCT1, { sheetName: ASM, zebra: 1 });
  const aExitCap = inputRow(wsA, ar++, "Exit Cap Rate", 0.075, "Typically 25 – 50 bps above entry", FMT_PCT, { sheetName: ASM, zebra: 2 });
  const aSellC   = inputRow(wsA, ar++, "Selling Costs at Exit", 0.025, "Broker + closing", FMT_PCT1, { sheetName: ASM, zebra: 3 });
  const aHold    = inputRow(wsA, ar++, "Hold Period (Years)", 10, "Used for IRR calculation", FMT_YEAR, { sheetName: ASM, zebra: 4 });

  // Section: OM Reference (read-only — what the OM states)
  ar++;
  ar = sectionBand(wsA, ar, "OM Reference (read-only)", 3);
  hdrRow(wsA, ar++, ["Metric", "Value", "Source"]);
  const omNoiRow = ar;
  dataRow(wsA, ar++, "NOI (as stated in OM)", noiOm || null, "From OM", { numFmt: FMT_MONEY, zebra: 0 });
  dataRow(wsA, ar++, "Cap Rate (as stated in OM)", Number(g("pricing_deal_terms", "cap_rate_om")) ? Number(g("pricing_deal_terms", "cap_rate_om")) / 100 : null, "From OM", { numFmt: FMT_PCT, zebra: 1 });
  dataRow(wsA, ar++, "EGI (as stated in OM)", Number(g("income", "effective_gross_income")) || null, "From OM", { numFmt: FMT_MONEY, zebra: 2 });
  dataRow(wsA, ar++, "Total Expenses (as stated in OM)", Number(g("expenses", "total_expenses")) || null, "From OM", { numFmt: FMT_MONEY, zebra: 3 });

  // ================================================================
  // SHEET: Underwriting — formulas only; ties to Assumptions
  // ================================================================
  const wsU = wb.addWorksheet("Underwriting", { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }] });
  const UW = "Underwriting";
  wsU.getColumn(1).width = 32; wsU.getColumn(2).width = 18; wsU.getColumn(3).width = 44;
  let ur = 1;
  ur = sheetTitleBanner(wsU, ur, `Underwriting — ${propertyName}`, loc ? `${loc} · ${typeLabel}` : typeLabel, 3);

  // Income block
  ur = sectionBand(wsU, ur, "Income", 3);
  hdrRow(wsU, ur++, ["Line Item", "Amount", "Notes"]);
  const uPGI = formulaRow(wsU, ur++, "Potential Gross Income", `${aBaseRent}+${aReimb}+${aOther}`, FMT_MONEY, "Base Rent + Reimbursements + Other", { bold: true, sheetName: UW });
  const uVac = formulaRow(wsU, ur++, "Less: Vacancy & Credit Loss", `-${uPGI}*${aVacancy}`, FMT_MONEY, "", { sheetName: UW });
  const uEGI = formulaRow(wsU, ur++, "Effective Gross Income", `${uPGI}+${uVac}`, FMT_MONEY, "PGI − Vacancy", { bold: true, sheetName: UW });

  // Expense block
  ur++;
  ur = sectionBand(wsU, ur, "Operating Expenses", 3);
  hdrRow(wsU, ur++, ["Line Item", "Amount", "Notes"]);
  formulaRow(wsU, ur++, "CAM / Common Area",     `${aCam}`,      FMT_MONEY, "", { cross: true });
  formulaRow(wsU, ur++, "Real Estate Taxes",     `${aTax}`,      FMT_MONEY, "", { cross: true });
  formulaRow(wsU, ur++, "Insurance",             `${aIns}`,      FMT_MONEY, "", { cross: true });
  formulaRow(wsU, ur++, "Management Fee",        `${aMgmt}`,     FMT_MONEY, "", { cross: true });
  formulaRow(wsU, ur++, "Reserves / CapEx",      `${aReserves}`, FMT_MONEY, "", { cross: true });
  formulaRow(wsU, ur++, "Other Expenses",        `${aOtherExp}`, FMT_MONEY, "", { cross: true });
  const uTotalExp = formulaRow(wsU, ur++, "Total Operating Expenses", `${aCam}+${aTax}+${aIns}+${aMgmt}+${aReserves}+${aOtherExp}`, FMT_MONEY, "", { bold: true, sheetName: UW });

  // NOI block
  ur++;
  ur = sectionBand(wsU, ur, "Net Operating Income", 3);
  hdrRow(wsU, ur++, ["Metric", "Value", "Notes"]);
  const uNOI    = formulaRow(wsU, ur++, "NOI (modeled)", `${uEGI}-${uTotalExp}`, FMT_MONEY, "EGI − Total Expenses", { bold: true, sheetName: UW });
  formulaRow(wsU, ur++, "NOI / SF", `${uNOI}/${aBldgSf}`, FMT_MONEY_D, "");
  formulaRow(wsU, ur++, "Δ vs. OM NOI", `${uNOI}-'Assumptions'!$B$${omNoiRow}`, FMT_MONEY, "How your model differs from the OM");

  // Financing block
  ur++;
  ur = sectionBand(wsU, ur, "Financing", 3);
  hdrRow(wsU, ur++, ["Metric", "Value", "Notes"]);
  const uLoan    = formulaRow(wsU, ur++, "Loan Amount", `${aPrice}*${aLTV}`, FMT_MONEY, "", { bold: true, sheetName: UW });
  const uClosing = formulaRow(wsU, ur++, "Closing Costs", `${aPrice}*${aClosing}`, FMT_MONEY, "", { sheetName: UW });
  const uEquity  = formulaRow(wsU, ur++, "Total Equity Required", `${aPrice}-${uLoan}+${uClosing}`, FMT_MONEY, "Down payment + closing", { bold: true, sheetName: UW });
  const uDS      = formulaRow(wsU, ur++, "Annual Debt Service", `PMT(${aRate}/12,${aAmort}*12,-${uLoan})*12`, FMT_MONEY, "", { bold: true, sheetName: UW });

  // Returns block
  ur++;
  ur = sectionBand(wsU, ur, "Returns", 3);
  hdrRow(wsU, ur++, ["Metric", "Value", "Notes"]);
  formulaRow(wsU, ur++, "Cap Rate",          `${uNOI}/${aPrice}`,         FMT_PCT,   "NOI ÷ Price", { bold: true });
  formulaRow(wsU, ur++, "Price / SF",        `${aPrice}/${aBldgSf}`,      FMT_MONEY, "");
  const uCF = formulaRow(wsU, ur++, "Annual Cash Flow (Levered)", `${uNOI}-${uDS}`, FMT_MONEY, "NOI − Debt Service", { bold: true, sheetName: UW });
  formulaRow(wsU, ur++, "DSCR",              `${uNOI}/${uDS}`,            FMT_MULT,  "Target > 1.25x", { bold: true });
  formulaRow(wsU, ur++, "Cash-on-Cash",      `${uCF}/${uEquity}`,         FMT_PCT,   "Cash Flow ÷ Equity", { bold: true });
  formulaRow(wsU, ur++, "Debt Yield",        `${uNOI}/${uLoan}`,          FMT_PCT,   "NOI ÷ Loan — lender metric");
  formulaRow(wsU, ur++, "Monthly Cash Flow", `${uCF}/12`,                 FMT_MONEY, "");

  // ================================================================
  // SHEET: Pro Forma — 10-year cash flow, levered IRR & equity multiple
  // ================================================================
  const wsCF = wb.addWorksheet("Pro Forma", { views: [{ showGridLines: false, state: "frozen", ySplit: 4, xSplit: 1 }] });
  wsCF.getColumn(1).width = 30;
  for (let c = 2; c <= 13; c++) wsCF.getColumn(c).width = 14;
  let cr = 1;
  cr = sheetTitleBanner(wsCF, cr, `Pro Forma — ${propertyName}`, "Year 0 = equity outflow. Years 1–10 = cash flow. Year 10 includes exit proceeds.", 13);

  cr = sectionBand(wsCF, cr, "Annual Projection", 13);
  const cfHdr = cr;
  const headers: string[] = ["Metric"];
  for (let y = 0; y <= 10; y++) headers.push(y === 0 ? "Year 0" : `Yr ${y}`);
  hdrRow(wsCF, cfHdr, headers);
  cr++;

  // NOI row
  const noiR = cr;
  const lNoi = wsCF.getCell(noiR, 1); lNoi.value = "Net Operating Income"; lNoi.font = boldLabel; lNoi.fill = white; lNoi.border = borders; lNoi.alignment = { vertical: "middle", indent: 1 };
  const y0noi = wsCF.getCell(noiR, 2); y0noi.value = ""; y0noi.fill = white; y0noi.border = borders;
  for (let y = 1; y <= 10; y++) {
    const col = y + 2;
    const c = wsCF.getCell(noiR, col);
    c.value = { formula: `${uNOI}*(1+${aRentGr})^(${y - 1})` };
    c.numFmt = FMT_MONEY; c.fill = ltGreen; c.border = borders; c.font = valFont;
    c.alignment = { vertical: "middle", horizontal: "right" };
  }
  cr++;

  // Debt service row (constant)
  const dsR = cr;
  const lDs = wsCF.getCell(dsR, 1); lDs.value = "Debt Service"; lDs.font = labelFont; lDs.fill = white; lDs.border = borders; lDs.alignment = { vertical: "middle", indent: 1 };
  wsCF.getCell(dsR, 2).fill = white; wsCF.getCell(dsR, 2).border = borders;
  for (let y = 1; y <= 10; y++) {
    const col = y + 2;
    const c = wsCF.getCell(dsR, col);
    c.value = { formula: `${uDS}` };
    c.numFmt = FMT_MONEY; c.fill = ltGreen; c.border = borders; c.font = valFont;
    c.alignment = { vertical: "middle", horizontal: "right" };
  }
  cr++;

  // Operating Cash Flow row
  const cashR = cr;
  const lCF = wsCF.getCell(cashR, 1); lCF.value = "Operating Cash Flow"; lCF.font = boldLabel; lCF.fill = white; lCF.border = borders; lCF.alignment = { vertical: "middle", indent: 1 };
  const y0 = wsCF.getCell(cashR, 2);
  y0.value = { formula: `-${uEquity}` };
  y0.numFmt = FMT_MONEY; y0.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }; y0.border = borders; y0.font = redFont;
  y0.alignment = { vertical: "middle", horizontal: "right" };
  for (let y = 1; y <= 10; y++) {
    const col = y + 2;
    const c = wsCF.getCell(cashR, col);
    const noiA1 = wsCF.getCell(noiR, col).address;
    const dsA1  = wsCF.getCell(dsR, col).address;
    c.value = { formula: `${noiA1}-${dsA1}` };
    c.numFmt = FMT_MONEY; c.fill = ltGreen; c.border = borders; c.font = boldLabel;
    c.alignment = { vertical: "middle", horizontal: "right" };
  }
  cr++;

  // Exit proceeds row
  const exitR = cr;
  const lEx = wsCF.getCell(exitR, 1); lEx.value = "Exit Proceeds"; lEx.font = labelFont; lEx.fill = white; lEx.border = borders; lEx.alignment = { vertical: "middle", indent: 1 };
  for (let y = 0; y <= 10; y++) {
    const col = y + 2;
    const c = wsCF.getCell(exitR, col);
    c.border = borders; c.numFmt = FMT_MONEY; c.fill = white;
    c.alignment = { vertical: "middle", horizontal: "right" };
    if (y === 10) {
      const noi10 = wsCF.getCell(noiR, col).address;
      // Loan balance @ end of year 10 from remaining PMT schedule
      const bal = `(PMT(${aRate}/12,${aAmort}*12,-${uLoan})*(1-(1+${aRate}/12)^(-(${aAmort}*12-120))))/(${aRate}/12)`;
      c.value = { formula: `${noi10}*(1+${aRentGr})/${aExitCap}*(1-${aSellC})-${bal}` };
      c.fill = ltGreen; c.font = greenFont;
    }
  }
  cr++;

  // Total cash flow row (operating + exit)
  const totR = cr;
  const lT = wsCF.getCell(totR, 1); lT.value = "Total Cash Flow"; lT.font = { ...boldLabel, color: { argb: "FFFFFFFF" } }; lT.fill = navy2; lT.border = borders; lT.alignment = { vertical: "middle", indent: 1 };
  for (let y = 0; y <= 10; y++) {
    const col = y + 2;
    const c = wsCF.getCell(totR, col);
    const cA1 = wsCF.getCell(cashR, col).address;
    const eA1 = wsCF.getCell(exitR, col).address;
    c.value = { formula: `${cA1}+N(${eA1})` };
    c.numFmt = FMT_MONEY; c.fill = ltBlue; c.border = borders; c.font = boldLabel;
    c.alignment = { vertical: "middle", horizontal: "right" };
  }
  cr += 2;

  // IRR / Equity Multiple
  cr = sectionBand(wsCF, cr, "Returns (10-Year Levered)", 13);
  const firstT = wsCF.getCell(totR, 2).address;
  const lastT  = wsCF.getCell(totR, 12).address;
  const lirr = wsCF.getCell(cr, 1); lirr.value = "Levered IRR"; lirr.font = boldLabel; lirr.fill = white; lirr.border = borders; lirr.alignment = { vertical: "middle", indent: 1 };
  const cirr = wsCF.getCell(cr, 2); cirr.value = { formula: `IRR(${firstT}:${lastT})` }; cirr.numFmt = FMT_PCT; cirr.font = { ...greenFont, size: 12 }; cirr.fill = ltGreen; cirr.border = borders; cirr.alignment = { vertical: "middle", horizontal: "right" };
  cr++;
  const lem = wsCF.getCell(cr, 1); lem.value = "Equity Multiple"; lem.font = boldLabel; lem.fill = white; lem.border = borders; lem.alignment = { vertical: "middle", indent: 1 };
  const firstCash = wsCF.getCell(cashR, 3).address;
  const lastCash  = wsCF.getCell(cashR, 12).address;
  const y10Exit   = wsCF.getCell(exitR, 12).address;
  const cem = wsCF.getCell(cr, 2); cem.value = { formula: `(SUM(${firstCash}:${lastCash})+${y10Exit})/${uEquity}+1` }; cem.numFmt = FMT_MULT; cem.font = { ...greenFont, size: 12 }; cem.fill = ltGreen; cem.border = borders; cem.alignment = { vertical: "middle", horizontal: "right" };

  // ================================================================
  // SHEET: Sensitivity — IRR matrix (Price × Exit Cap)
  // ================================================================
  const wsSens = wb.addWorksheet("Sensitivity", { views: [{ showGridLines: false, state: "frozen", ySplit: 4, xSplit: 1 }] });
  // Wider first column so the row labels fit the dollar price + delta.
  wsSens.getColumn(1).width = 30;
  for (let c = 2; c <= 8; c++) wsSens.getColumn(c).width = 14;
  let sr = 1;
  sr = sheetTitleBanner(
    wsSens,
    sr,
    "Sensitivity",
    "How the 10-year unlevered IRR changes if you pay more or less than asking, and if the market exit cap shifts. Rows = purchase price. Columns = exit cap rate.",
    8,
  );

  sr = sectionBand(wsSens, sr, "Unlevered IRR at Each Price / Exit Cap", 8);
  const exitCaps = [0.060, 0.065, 0.070, 0.075, 0.080, 0.085, 0.090];
  const priceMultipliers = [0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10];

  const sHdr = sr;
  // Clearer corner label — two lines so users immediately see what each
  // axis represents without having to read the banner.
  const sh0 = wsSens.getCell(sHdr, 1);
  sh0.value = "Purchase Price  ↓   /   Exit Cap  →";
  sh0.font = hdrFont; sh0.fill = navy2; sh0.border = borders;
  sh0.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  exitCaps.forEach((cap, i) => {
    const c = wsSens.getCell(sHdr, i + 2);
    c.value = cap; c.numFmt = FMT_PCT; c.font = hdrFont; c.fill = navy2; c.border = borders;
    c.alignment = { vertical: "middle", horizontal: "right" };
  });
  wsSens.getRow(sHdr).height = 24;
  sr++;

  priceMultipliers.forEach((pm, rowIdx) => {
    const rowFill = pm === 1.0 ? ltBlue : (rowIdx % 2 === 0 ? white : subtle);
    const lc = wsSens.getCell(sr, 1);
    // Show the ACTUAL dollar price for each row, not just the %-delta from
    // asking. Previously the labels read "−20%, −15%, ... Asking, +5%,
    // +10%" which forced the reader to do math to figure out what price
    // each row represented. Now each row shows "$1,234,000 (−20%)" etc.,
    // tied to the live Asking Price cell so edits to the Assumptions
    // sheet flow through here automatically.
    const deltaLabel =
      pm === 1.0
        ? "Asking"
        : pm > 1
        ? `+${Math.round((pm - 1) * 100)}%`
        : `−${Math.round((1 - pm) * 100)}%`;
    lc.value = { formula: `TEXT(${aPrice}*${pm},"$#,##0")&"  (${deltaLabel})"` };
    lc.font = pm === 1.0 ? boldLabel : labelFont; lc.fill = rowFill; lc.border = borders;
    lc.alignment = { vertical: "middle", indent: 1 };
    exitCaps.forEach((cap, i) => {
      const c = wsSens.getCell(sr, i + 2);
      const priceRef = `(${aPrice}*${pm})`;
      // Unlevered IRR = (NOI/Price) yield + ((ExitValue/Price)^(1/N) - 1) capital appreciation component
      const formula = `(${uNOI}/${priceRef})+((${uNOI}*(1+${aRentGr})^(${aHold}-1)/${cap}*(1-${aSellC}))/${priceRef})^(1/${aHold})-1`;
      c.value = { formula };
      c.numFmt = FMT_PCT1; c.border = borders; c.fill = rowFill; c.font = pm === 1.0 ? boldLabel : valFont;
      c.alignment = { vertical: "middle", horizontal: "right" };
    });
    sr++;
  });
  sr++;
  // How-to-read note makes the table self-explanatory for anyone opening
  // it without the banner context (e.g. a partner opening the XLS cold).
  const sRead = wsSens.getCell(sr, 1);
  sRead.value = "How to read: each cell is the unlevered IRR you'd earn if you bought at the price on the left and sold 10 years later at the cap rate on top. Higher exit caps (right) = lower exit value = lower IRR.";
  sRead.font = noteFont; sRead.alignment = { wrapText: true, vertical: "top" };
  wsSens.mergeCells(sr, 1, sr, 8);
  wsSens.getRow(sr).height = 32;
  sr++;
  const sNote = wsSens.getCell(sr, 1);
  sNote.value = "Industry hurdles: Core ~8-10% · Core+ ~10-13% · Value-Add ~13-18% · Opportunistic 18%+";
  sNote.font = noteFont;
  wsSens.mergeCells(sr, 1, sr, 8);

  // ================================================================
  // SHEET: Offer Ladder
  // ================================================================
  const wsO = wb.addWorksheet("Offer Ladder", { views: [{ showGridLines: false, state: "frozen", ySplit: 4, xSplit: 1 }] });
  wsO.getColumn(1).width = 30;
  for (let c = 2; c <= 5; c++) wsO.getColumn(c).width = 18;
  wsO.getColumn(6).width = 44;
  let or = 1;
  or = sheetTitleBanner(wsO, or, "Offer Ladder", "Four buyer offer levels and the returns each produces at current OM NOI. Read left → right as low → high.", 6);

  or = sectionBand(wsO, or, "Offers", 6);
  // Buyer-perspective ladder anchored around the seller's asking price.
  // Low = lowball test. Under Asking = realistic first offer below ask.
  // Asking Price = full ask, your typical ceiling. Stretch = modest
  // premium you'd only pay in a competitive bid or to win a unique asset.
  hdrRow(wsO, or++, ["Metric", "Low", "Under Asking", "Asking Price", "Stretch", "Notes"]);
  const offerPcts = [0.85, 0.95, 1.00, 1.05];
  const priceR = or;
  const opl = wsO.getCell(priceR, 1); opl.value = "Offer Price"; opl.font = boldLabel; opl.fill = white; opl.border = borders; opl.alignment = { vertical: "middle", indent: 1 };
  offerPcts.forEach((pct, i) => {
    const c = wsO.getCell(priceR, i + 2);
    c.value = Math.round(askPrice * pct); c.numFmt = FMT_MONEY; c.font = inputFont; c.fill = yellow; c.border = borders;
    c.alignment = { vertical: "middle", horizontal: "right" };
  });
  or++;
  const addOfferRow = (label: string, build: (priceCell: string) => string, fmt: string, note?: string) => {
    const l = wsO.getCell(or, 1); l.value = label; l.font = labelFont; l.fill = white; l.border = borders; l.alignment = { vertical: "middle", indent: 1 };
    offerPcts.forEach((_, i) => {
      const c = wsO.getCell(or, i + 2);
      const priceCell = wsO.getCell(priceR, i + 2).address;
      c.value = { formula: build(priceCell) };
      c.numFmt = fmt; c.font = valFont; c.fill = ltGreen; c.border = borders;
      c.alignment = { vertical: "middle", horizontal: "right" };
    });
    if (note) { const nc = wsO.getCell(or, 6); nc.value = note; nc.font = noteFont; nc.fill = white; nc.border = borders; nc.alignment = { vertical: "middle", wrapText: true, indent: 1 }; }
    or++;
  };
  addOfferRow("% of Asking",           (pc) => `${pc}/${askPrice}`, FMT_PCT1);
  addOfferRow("Implied Cap (OM NOI)",  (pc) => `${noiOm}/${pc}`, FMT_PCT, "Based on stated OM NOI");
  addOfferRow("DSCR (OM NOI)",         (pc) => `${noiOm}/(PMT(${aRate}/12,${aAmort}*12,-${pc}*${aLTV})*12)`, FMT_MULT, "Lender comfort test");
  addOfferRow("Cash-on-Cash (Yr 1)",   (pc) => `(${noiOm}-PMT(${aRate}/12,${aAmort}*12,-${pc}*${aLTV})*12)/(${pc}*(1-${aLTV})+${pc}*${aClosing})`, FMT_PCT);
  addOfferRow("Equity Required",       (pc) => `${pc}*(1-${aLTV})+${pc}*${aClosing}`, FMT_MONEY);
  or += 2;

  // Strategy notes
  or = sectionBand(wsO, or, "Strategy Notes", 6);
  const notes: Array<[string, string]> = [
    ["Low", "Lowball test (~85% of ask). Probes seller motivation. Expect a sharp counter; be ready to move up or walk."],
    ["Under Asking", "Realistic offer below ask (~95%). Signals serious interest and leaves room to settle at or near ask."],
    ["Asking Price", "Full asking price (100%). Your typical ceiling. Use only when returns still pencil out at this number."],
    ["Stretch", "Premium offer (~105%) above ask. Reserved for competitive bids, unique assets, or thesis-driven conviction where paying up is justified."],
  ];
  notes.forEach(([label, text], i) => {
    const zf = zebraFill(i);
    const lc = wsO.getCell(or, 1); lc.value = label; lc.font = boldLabel; lc.fill = zf; lc.border = borders; lc.alignment = { vertical: "middle", indent: 1 };
    const nc = wsO.getCell(or, 2); nc.value = text; nc.font = valFont; nc.fill = zf; nc.border = borders; nc.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    wsO.mergeCells(or, 2, or, 6);
    or++;
  });

  // ================================================================
  // SHEET: Rent Roll (tenant-level data)
  // ================================================================
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
  if (tenantList.length > 0) {
    const wsR = wb.addWorksheet("Rent Roll", { views: [{ showGridLines: false, state: "frozen", ySplit: 5 }] });
    let rr = 1;
    rr = sheetTitleBanner(wsR, rr, "Rent Roll", `${tenantList.length} tenant${tenantList.length === 1 ? "" : "s"} · ${propertyName}`, 7);
    hdrRow(wsR, rr++, ["Tenant", "SF", "Annual Rent", "Rent/SF", "Lease Type", "Lease End", "Status"], [26, 10, 14, 11, 14, 13, 13]);
    let totalSf = 0, totalRent = 0;
    tenantList.forEach((t, i) => {
      const isExpired = String(t.status || "").toLowerCase().match(/expir|mtm|vacant/);
      const zf = zebraFill(i);
      const sf = Number(t.sf) || null;
      const rent = Number(t.rent) || null;
      const rentPsf = t.rent_psf ? Number(t.rent_psf) : (sf && rent ? rent / sf : null);
      totalSf += sf || 0; totalRent += rent || 0;
      const cells: Array<[any, string | undefined]> = [
        [t.name || "", undefined],
        [sf, FMT_NUM],
        [rent, FMT_MONEY],
        [rentPsf, FMT_MONEY_D],
        [t.type || "", undefined],
        [t.lease_end || "", undefined],
        [t.status || "", undefined],
      ];
      cells.forEach(([v, fmt], ci) => {
        const c = wsR.getCell(rr, ci + 1);
        c.value = v === null ? "" : v;
        c.font = ci === 0 ? { ...labelFont, bold: true } : (isExpired ? redFont : valFont);
        c.fill = zf; c.border = borders;
        if (fmt) c.numFmt = fmt;
        c.alignment = { vertical: "middle", horizontal: ci === 0 ? "left" : (typeof v === "number" ? "right" : "left"), indent: ci === 0 ? 1 : 0 };
      });
      rr++;
    });
    // Totals row
    rr++;
    const tl = wsR.getCell(rr, 1); tl.value = "TOTALS"; tl.font = { ...boldLabel, color: { argb: "FFFFFFFF" } }; tl.fill = navy2; tl.border = borders; tl.alignment = { vertical: "middle", indent: 1 };
    const tsf = wsR.getCell(rr, 2); tsf.value = totalSf; tsf.font = { ...boldLabel, color: { argb: "FFFFFFFF" } }; tsf.fill = navy2; tsf.border = borders; tsf.numFmt = FMT_NUM; tsf.alignment = { vertical: "middle", horizontal: "right" };
    const trr = wsR.getCell(rr, 3); trr.value = totalRent; trr.font = { ...boldLabel, color: { argb: "FFFFFFFF" } }; trr.fill = navy2; trr.border = borders; trr.numFmt = FMT_MONEY; trr.alignment = { vertical: "middle", horizontal: "right" };
    const tpsf = wsR.getCell(rr, 4); tpsf.value = totalSf > 0 ? totalRent / totalSf : 0; tpsf.font = { ...boldLabel, color: { argb: "FFFFFFFF" } }; tpsf.fill = navy2; tpsf.border = borders; tpsf.numFmt = FMT_MONEY_D; tpsf.alignment = { vertical: "middle", horizontal: "right" };
  }

  // ================================================================
  // SHEET: OM Data — property facts + signals (no financials; those live in Assumptions)
  // ================================================================
  const wsD = wb.addWorksheet("OM Data", { views: [{ showGridLines: false }] });
  wsD.getColumn(1).width = 28; wsD.getColumn(2).width = 30; wsD.getColumn(3).width = 22;
  let dr = 1;
  dr = sheetTitleBanner(wsD, dr, "OM Reference Data", "Raw extracted values from the OM / flyer. Editable inputs live on the Assumptions sheet.", 3);

  dr = sectionBand(wsD, dr, "Property Facts", 3);
  hdrRow(wsD, dr++, ["Field", "Value", "Source"]);
  const propRows: Array<[string, any, string | undefined]> = [
    ["Address", addr, "OM"],
    ["City, State", [city, state].filter(Boolean).join(", "), "OM"],
    ["Year Built", Number(g("property_basics", "year_built")) || null, "OM"],
    ["GLA (SF)", Number(g("property_basics", "building_sf")) || null, "OM"],
    ["Occupancy", Number(g("property_basics", "occupancy_pct")) ? Number(g("property_basics", "occupancy_pct")) / 100 : null, "OM"],
    ["Tenant Count", Number(g("property_basics", "tenant_count")) || null, "OM"],
    ["WALE (years)", Number(g("property_basics", "wale_years")) || null, "OM"],
    ["Broker", g("property_basics", "broker") || "", "OM"],
  ];
  propRows.forEach(([label, val, src], i) => {
    const fmt = label === "Occupancy" ? FMT_PCT1 : label === "GLA (SF)" || label === "Tenant Count" ? FMT_NUM : label === "WALE (years)" ? '0.0' : label === "Year Built" ? FMT_YEAR : undefined;
    dataRow(wsD, dr++, label, val === null ? "" : val, src, { numFmt: fmt, zebra: i });
  });
  if (analysisType === "industrial") {
    dr++;
    dr = sectionBand(wsD, dr, "Industrial Specifics", 3);
    hdrRow(wsD, dr++, ["Field", "Value", "Source"]);
    const rows: Array<[string, any]> = [
      ["Clear Height (ft)", Number(g("industrial_addons", "clear_height")) || null],
      ["Loading Type", g("industrial_addons", "loading_type") || ""],
      ["Dock / Loading Count", Number(g("industrial_addons", "loading_count")) || null],
      ["Office Finish %", Number(g("industrial_addons", "office_finish_pct")) ? Number(g("industrial_addons", "office_finish_pct")) / 100 : null],
    ];
    rows.forEach(([label, val], i) => {
      const fmt = label.includes("%") ? FMT_PCT1 : label.includes("(ft)") || label.includes("Count") ? FMT_NUM : undefined;
      dataRow(wsD, dr++, label, val === null ? "" : val, "OM", { numFmt: fmt, zebra: i });
    });
  } else if (analysisType === "office") {
    dr++;
    dr = sectionBand(wsD, dr, "Office Specifics", 3);
    hdrRow(wsD, dr++, ["Field", "Value", "Source"]);
    const rows: Array<[string, any]> = [
      ["Suite Count", Number(g("office_addons", "suite_count")) || null],
      ["Floor Count", Number(g("office_addons", "floor_count")) || null],
      ["Building Class", g("office_addons", "building_class") || ""],
      ["Parking Ratio", Number(g("office_addons", "parking_ratio")) || null],
    ];
    rows.forEach(([label, val], i) => {
      const fmt = label.includes("Count") || label.includes("Ratio") ? FMT_NUM : undefined;
      dataRow(wsD, dr++, label, val === null ? "" : val, "OM", { numFmt: fmt, zebra: i });
    });
  } else if (analysisType === "multifamily") {
    dr++;
    dr = sectionBand(wsD, dr, "Multifamily Specifics", 3);
    hdrRow(wsD, dr++, ["Field", "Value", "Source"]);
    const rows: Array<[string, any]> = [
      ["Unit Count", Number(g("multifamily_addons", "unit_count")) || null],
      ["Avg Rent / Unit", Number(g("multifamily_addons", "avg_rent_per_unit")) || null],
      ["Vacancy %", Number(g("multifamily_addons", "vacancy_rate")) ? Number(g("multifamily_addons", "vacancy_rate")) / 100 : null],
    ];
    rows.forEach(([label, val], i) => {
      const fmt = label.includes("Rent") ? FMT_MONEY : label.includes("%") ? FMT_PCT1 : FMT_NUM;
      dataRow(wsD, dr++, label, val === null ? "" : val, "OM", { numFmt: fmt, zebra: i });
    });
  }

  // AI Signals block
  dr++;
  dr = sectionBand(wsD, dr, "AI Signal Assessment", 3);
  hdrRow(wsD, dr++, ["Signal", "Assessment", ""]);
  const sigPairs: Array<[string, any]> = [
    ["Overall", g("signals", "overall_signal")],
    ["Cap Rate", g("signals", "cap_rate_signal")],
    ["DSCR", g("signals", "dscr_signal")],
    ["Occupancy", g("signals", "occupancy_signal")],
    ["Basis / Price", g("signals", "basis_signal")],
    ["Tenant Quality", g("signals", "tenant_quality_signal")],
  ];
  let si = 0;
  for (const [label, val] of sigPairs) {
    if (!val) continue;
    const isRed = String(val).toLowerCase().includes("red") || String(val).toLowerCase().includes("sell");
    const isGreen = String(val).toLowerCase().includes("green") || String(val).toLowerCase().includes("buy");
    dataRow(wsD, dr++, label, val, "", { red: isRed, green: isGreen, zebra: si++ });
  }
  const rec = g("signals", "recommendation");
  if (rec) { dr++; dataRow(wsD, dr++, "Recommendation", rec, "", { bold: true }); }

  // Workbook opens on Assumptions
  wb.views = [{ firstSheet: 0, activeTab: 0, visibility: "visible" }];

  // Download (or return blob for email attachment)
  const safeName = propertyName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  const suffix = analysisType !== "retail" ? `-${typeLabel}` : "";
  const filename = `${safeName}${suffix}-Underwriting.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (options?.returnBlob) {
    return { blob, filename };
  }
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
  analysisType: AnalysisType = "retail",
  options?: { returnBlob?: boolean }
): void | { blob: Blob; filename: string } {
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
  const safeName = propertyName.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "-");
  const suffix = analysisType !== "retail" ? `-${typeLabel}` : "";
  const filename = `${safeName}${suffix}-First-Pass-Brief.doc`;
  if (options?.returnBlob) {
    return { blob, filename };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

