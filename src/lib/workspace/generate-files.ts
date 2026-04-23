// Client-side file generation for XLSX underwriting and brief downloads
// Uses ExcelJS (loaded from CDN) for Excel generation with full styling
// Simplified scenario-model workbook: editable inputs → formula-driven outputs

import type { ExtractedField, Note } from "./types";
import type { AnalysisType } from "./types";
import type { QuickScreenReport } from "@/lib/analysis/quick-screen";

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
  const cirr = wsCF.getCell(cr, 2); cirr.value = { formula: `IFERROR(IRR(${firstT}:${lastT}),"")` }; cirr.numFmt = FMT_PCT; cirr.font = { ...greenFont, size: 12 }; cirr.fill = ltGreen; cirr.border = borders; cirr.alignment = { vertical: "middle", horizontal: "right" };
  cr++;
  const lem = wsCF.getCell(cr, 1); lem.value = "Equity Multiple"; lem.font = boldLabel; lem.fill = white; lem.border = borders; lem.alignment = { vertical: "middle", indent: 1 };
  const firstCash = wsCF.getCell(cashR, 3).address;
  const lastCash  = wsCF.getCell(cashR, 12).address;
  const y10Exit   = wsCF.getCell(exitR, 12).address;
  const cem = wsCF.getCell(cr, 2); cem.value = { formula: `IFERROR((SUM(${firstCash}:${lastCash})+${y10Exit})/${uEquity}+1,"")` }; cem.numFmt = FMT_MULT; cem.font = { ...greenFont, size: 12 }; cem.fill = ltGreen; cem.border = borders; cem.alignment = { vertical: "middle", horizontal: "right" };

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
      // Unlevered IRR approximation:
      //   yield = NOI / Purchase_Price
      //   exit  = NOI * (1+g)^(N-1) / exit_cap * (1 - sell_costs)
      //   capital_component = (exit / price)^(1/N) - 1
      //   IRR ≈ yield + capital_component
      //
      // Guarded: if NOI <= 0 (no income data extracted), the power term
      // produces #NUM! because Excel can't raise a negative to a fraction.
      // IFERROR → blank cell instead of a wall of #NUM!.
      const exitVal = `(${uNOI}*(1+${aRentGr})^(${aHold}-1)/${cap}*(1-${aSellC}))`;
      const irr = `(${uNOI}/${priceRef})+(${exitVal}/${priceRef})^(1/${aHold})-1`;
      const formula = `IFERROR(IF(${uNOI}<=0,"",${irr}),"")`;
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
  options?: { returnBlob?: boolean; quickScreen?: QuickScreenReport | null; tenants?: any[] }
): void | { blob: Blob; filename: string } {
  const quickScreen = options?.quickScreen || null;
  const tenantData = options?.tenants || [];
  const g = (group: string, name: string) => getField(fields, group, name);
  const typeLabel = analysisType === "retail" ? "Retail" : analysisType === "industrial" ? "Industrial" : analysisType === "office" ? "Office" : "Land";

  // === Core numbers ===
  const briefAskPrice = Number(g("pricing_deal_terms", "asking_price")) || 0;
  const briefNOI = Number(g("expenses", "noi_om")) || 0;
  const briefNOIAdj = Number(g("expenses", "noi_adjusted")) || 0;
  const briefCap = Number(g("pricing_deal_terms", "cap_rate_om")) || 0;
  const briefOcc = Number(g("property_basics", "occupancy_pct")) || 0;
  const briefWale = Number(g("property_basics", "wale_years")) || Number(g("rent_roll", "weighted_avg_lease_term")) || 0;
  const briefSF = Number(g("property_basics", "building_sf")) || 0;
  const briefYear = Number(g("property_basics", "year_built")) || 0;
  const briefTenantCount = Number(g("property_basics", "tenant_count")) || 0;
  const briefCity = g("property_basics", "city") || "";
  const briefState = g("property_basics", "state") || "";
  const briefLoc = [briefCity, briefState].filter(Boolean).join(", ");
  const briefAddress = g("property_basics", "address") || "";
  const fullLoc = [briefAddress, briefCity, briefState].filter(Boolean).join(", ");
  const briefDebtService = Number(g("debt_assumptions", "annual_debt_service")) || 0;
  const briefDscrOm = Number(g("debt_assumptions", "dscr_om")) || 0;
  const briefDscrAdj = Number(g("debt_assumptions", "dscr_adjusted")) || 0;
  const briefCoC = Number(g("returns", "cash_on_cash_om")) || 0;
  const briefDebtYield = Number(g("debt_assumptions", "debt_yield")) || 0;
  const briefBreakeven = Number(g("returns", "breakeven_occupancy")) || 0;
  const noi = briefNOIAdj || briefNOI || 0;

  // Categorize the deal for thesis framing
  const isStabilized = briefOcc >= 90 && briefWale >= 3;
  const isLeaseUp = briefOcc > 0 && briefOcc < 85;
  const isValueAdd = briefOcc >= 85 && briefOcc < 93 && briefCap >= 7;
  const dealCategory = analysisType === "land" ? "Development" : isStabilized ? "Stabilized Core / Core-Plus" : isLeaseUp ? "Lease-Up / Value-Add" : isValueAdd ? "Value-Add" : "Transitional";

  // Signal class helper
  function sigClass(val: string): string {
    const v = String(val || "").toLowerCase();
    if (v.includes("green") || v.includes("🟢") || v.includes("strong")) return "sg";
    if (v.includes("yellow") || v.includes("🟡") || v.includes("moderate") || v.includes("fair")) return "sy";
    if (v.includes("red") || v.includes("🔴") || v.includes("weak") || v.includes("poor")) return "sr";
    return "";
  }

  // === Build metrics table based on asset type (now with Signal column) ===
  function metricSignal(metric: string): string {
    const capSig = g("signals", "cap_rate_signal") || "";
    const dscrSig = g("signals", "dscr_signal") || "";
    const occSig = g("signals", "occupancy_signal") || "";
    const basisSig = g("signals", "basis_signal") || "";
    if (metric.includes("Cap") || metric === "Asking Price" || metric.includes("Cash-on-Cash")) return capSig ? `<span class="${sigClass(capSig)}">${capSig}</span>` : "";
    if (metric.includes("DSCR")) return dscrSig ? `<span class="${sigClass(dscrSig)}">${dscrSig}</span>` : "";
    if (metric.includes("Occupancy") && !metric.includes("Breakeven")) return occSig ? `<span class="${sigClass(occSig)}">${occSig}</span>` : "";
    if (metric.includes("Price / SF") || metric.includes("Basis")) return basisSig ? `<span class="${sigClass(basisSig)}">${basisSig}</span>` : "";
    if (metric.includes("Breakeven")) return occSig ? `<span class="${sigClass(occSig)}">${occSig}</span>` : "";
    return "";
  }

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
  } else {
    metrics = [
      ["Asking Price", fmt$(g("pricing_deal_terms", "asking_price"))],
      ["Price / SF", g("pricing_deal_terms", "price_per_sf") ? "$" + Number(g("pricing_deal_terms", "price_per_sf")).toFixed(2) + "/SF" : ""],
      ["GLA", briefSF ? Math.round(briefSF).toLocaleString() + " SF" : ""],
      ["Occupancy", briefOcc ? briefOcc + "%" : ""],
      ["In-Place NOI (OM)", fmt$(g("expenses", "noi_om"))],
      ["Adjusted NOI", fmt$(g("expenses", "noi_adjusted"))],
      ["NOI / SF (in-place)", briefNOI > 0 && briefSF > 0 ? "$" + (briefNOI / briefSF).toFixed(2) : ""],
      ["NOI / SF (adjusted)", briefNOIAdj > 0 && briefSF > 0 ? "$" + (briefNOIAdj / briefSF).toFixed(2) : ""],
      ["Entry Cap (OM)", briefCap ? briefCap.toFixed(2) + "%" : ""],
      ["DSCR (OM)", briefDscrOm ? briefDscrOm.toFixed(2) + "x" : ""],
      ["DSCR (Adjusted)", briefDscrAdj ? briefDscrAdj.toFixed(2) + "x" : ""],
      ["Cash-on-Cash (OM)", briefCoC ? briefCoC.toFixed(2) + "%" : ""],
      ["Debt Yield", briefDebtYield ? briefDebtYield.toFixed(2) + "%" : ""],
      ["Debt Service", fmt$(g("debt_assumptions", "annual_debt_service"))],
      ["Breakeven Occupancy", briefBreakeven ? briefBreakeven.toFixed(1) + "%" : ""],
    ].filter(([, v]) => v) as [string, string][];

    // Add industrial/office specific metrics
    if (analysisType === "industrial") {
      const indMetrics: [string, string][] = [
        ["Clear Height", g("industrial_addons", "clear_height") || ""],
        ["Loading Type", g("industrial_addons", "loading_type") || ""],
        ["Dock / Door Count", g("industrial_addons", "loading_count") || ""],
        ["Trailer Parking", g("industrial_addons", "trailer_parking") || ""],
        ["Office Finish %", g("industrial_addons", "office_finish_pct") || ""],
      ].filter(([, v]) => v) as [string, string][];
      metrics = [...metrics, ...indMetrics];
    } else if (analysisType === "office") {
      const offMetrics: [string, string][] = [
        ["Suite Count", g("office_addons", "suite_count") || ""],
        ["Parking Ratio", g("office_addons", "parking_ratio") || ""],
        ["TI/LC Signal", g("office_addons", "ti_lc_signal") || ""],
        ["Near-Term Expirations", g("office_addons", "lease_expirations_near_term") || ""],
      ].filter(([, v]) => v) as [string, string][];
      metrics = [...metrics, ...offMetrics];
    }
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

  // === Build the brief title ===
  const briefTitle = analysisType === "land"
    ? "First-Pass Land Analysis Brief"
    : `First-Pass ${typeLabel} Underwriting Brief`;

  const disclaimerText = analysisType === "land"
    ? "This is a first-pass land analysis based on the provided documents and clearly labeled assumptions. Directional assessment only - not a final acquisition model."
    : "This is a first-pass underwriting screen based on the provided documents and clearly labeled assumptions. Directional assessment only - not a final investment model.";

  // === Brief content (Executive Summary / Initial Read) ===
  let briefOverview = "";
  let briefWorks: string[] = [];
  let briefDies: string[] = [];
  let briefFallback = "";

  try {
    const briefObj = JSON.parse(brief);
    if (briefObj && typeof briefObj === "object") {
      if (typeof briefObj.overview === "string") briefOverview = briefObj.overview.trim();
      if (Array.isArray(briefObj.strengths)) briefWorks = briefObj.strengths.map((x: any) => String(x).trim()).filter(Boolean);
      if (Array.isArray(briefObj.concerns)) briefDies = briefObj.concerns.map((x: any) => String(x).trim()).filter(Boolean);
    }
  } catch {
    briefFallback = String(brief || "").trim();
  }

  // Prefer QuickScreen report when available
  if (quickScreen) {
    if (quickScreen.executiveSummary && quickScreen.executiveSummary.trim()) {
      briefOverview = quickScreen.executiveSummary.trim();
    }
    const qsWorks = (quickScreen.waysItWorks || []).filter(Boolean);
    const qsDies = (quickScreen.waysItDies || []).filter(Boolean);
    if (qsWorks.length) briefWorks = qsWorks;
    if (qsDies.length) briefDies = qsDies;
  }

  let briefSectionHtml = "";
  if (briefOverview) {
    briefSectionHtml += `<div class="brief-text"><p>${briefOverview}</p></div>`;
  } else if (briefFallback) {
    briefSectionHtml += `<div class="brief-text">${briefFallback.split("\n").map(p => p.trim() ? `<p>${p}</p>` : "").join("")}</div>`;
  }

  // === Deal Snapshot bullets ===
  const snap: string[] = [];
  if (analysisType !== "land") {
    const typeStr = analysisType === "retail" ? "NNN retail" : analysisType === "industrial" ? "Industrial" : analysisType === "office" ? "Office" : analysisType;
    snap.push(`${typeStr}${briefSF ? ` - ${Math.round(briefSF).toLocaleString()} SF GLA` : ""}${briefYear ? `, Year Built ${briefYear}` : ""}${fullLoc ? ` - ${fullLoc}` : ""}`);
  } else {
    snap.push(`Land site${fullLoc ? ` - ${fullLoc}` : ""}`);
  }
  if (briefOcc > 0) snap.push(`${briefOcc}% occupied${briefTenantCount ? ` - ${briefTenantCount} tenant${briefTenantCount > 1 ? "s" : ""}` : ""}`);
  if (briefNOI > 0) snap.push(`In-place NOI ${fmt$(briefNOI)}${briefNOIAdj && briefNOIAdj !== briefNOI ? ` (adjusted: ${fmt$(briefNOIAdj)})` : ""}`);
  if (briefAskPrice > 0) snap.push(`Asking price ${fmt$(briefAskPrice)}${g("pricing_deal_terms", "price_per_sf") ? ` ($${Number(g("pricing_deal_terms", "price_per_sf")).toFixed(0)}/SF)` : ""}`);
  if (briefCap > 0) snap.push(`Entry cap rate ${briefCap.toFixed(2)}%`);
  if (briefWale > 0) snap.push(`WALE: ${briefWale.toFixed(1)} years`);

  // === Back-of-Napkin Returns ===
  let scenariosSectionHtml = "";
  if (quickScreen && quickScreen.scenarios && quickScreen.scenarios.length) {
    const order = ["Bear", "Base", "Bull"];
    const sorted = [...quickScreen.scenarios].sort(
      (a, b) => order.indexOf(a.label) - order.indexOf(b.label),
    );
    const rows = sorted.map((sc) => {
      const color = sc.label === "Bull" ? "#4D7C0F" : sc.label === "Base" ? "#2563EB" : "#DC2626";
      const levered = sc.leveredIrrPct != null ? `${sc.leveredIrrPct.toFixed(1)}%` : "--";
      const unlevered = sc.unleveredIrrPct != null ? `${sc.unleveredIrrPct.toFixed(1)}%` : "--";
      const em = sc.equityMultiple != null ? `${sc.equityMultiple.toFixed(2)}x` : "--";
      const rentSign = sc.rentGrowthPct > 0 ? "+" : "";
      const exitSign = sc.exitCapBps > 0 ? "+" : "";
      const rowBg = sc.label === "Bull" ? "#F7FEE7" : sc.label === "Base" ? "#EFF6FF" : "#FEF2F2";
      return `<tr style="background:${rowBg};">
        <td style="font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.5px;border-left:3px solid ${color};">${sc.label}</td>
        <td class="metric-val" style="font-size:11pt;">${levered}</td>
        <td>${em}</td>
        <td>${unlevered}</td>
        <td style="font-size:9pt;color:#6B7280;">annual rent ${rentSign}${sc.rentGrowthPct}%, exit cap ${exitSign}${sc.exitCapBps}bps</td>
      </tr>`;
    }).join("");
    scenariosSectionHtml = `
      <h2>Back-of-Napkin Returns</h2>
      <p style="font-size:9.5pt;color:#6B7280;margin-top:-4px;">Ranges, not point estimates. Meant for triage, not underwriting.</p>
      <table>
        <tr><th>Scenario</th><th>Levered IRR</th><th>Equity Multiple</th><th>Unlevered IRR</th><th>Assumptions</th></tr>
        ${rows}
      </table>
    `;
  }

  // === Investment Thesis ===
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
      thesisHtml += `Occupancy of ${briefOcc}% represents meaningful lease-up upside. The investment case depends on executing a lease-up plan within 12-24 months and re-underwriting the property at stabilized NOI before refinancing or exit. `;
    } else if (isValueAdd) {
      thesisHtml += `This sits in classic value-add territory at ${briefOcc}% occupancy with modest rent and expense optimization opportunity. Investor returns require execution on both operational lifts and modest capital investment. `;
    }
    thesisHtml += `A typical hold period of ${isStabilized ? "7-10 years" : isLeaseUp ? "3-5 years" : "5-7 years"} is appropriate for this profile.</p>`;
  }

  // === Market Context ===
  let marketContext = "";
  if (analysisType === "retail") {
    marketContext = `<p>Retail cap rates have widened 75-125 bps since 2022 as interest rates repriced debt. Neighborhood centers with necessity-based tenants (grocery, pharmacy, service retail) have held up better than discretionary retail. Evaluate this property's anchor stability, co-tenancy protections, and tenant sales performance relative to national chain averages. Rent growth in strong retail submarkets is running 2-4% per year; weak submarkets are flat to down.</p>`;
  } else if (analysisType === "industrial") {
    marketContext = `<p>Industrial remains the strongest-performing CRE sector, though cap rates have moved 50-100 bps off 2022 lows. Class A distribution with modern specs (32'+ clear, cross-dock, trailer parking) continues to command premiums. Rent growth varies dramatically by submarket. Underwrite conservative rent growth unless you have submarket-specific evidence.</p>`;
  } else if (analysisType === "office") {
    marketContext = `<p>Office remains the most challenging sector post-pandemic. Sublease space is elevated in most markets, and tenant TI requirements have increased materially. Medical office and mission-critical occupied office has held value; traditional multi-tenant office has experienced both occupancy and rent softening. Verify current submarket vacancy and TI packages being offered on new deals.</p>`;
  } else if (analysisType === "land") {
    marketContext = `<p>Land values have been volatile as capital markets repriced development risk. Entitled and shovel-ready land with utilities in place retains value; raw or speculatively-zoned land has widened significantly. Development land pricing should be back-solved from residual value analysis: projected stabilized value minus hard costs, soft costs, financing, and required developer profit.</p>`;
  } else {
    marketContext = `<p>CRE cap rates have widened as interest rates repriced debt since 2022. Evaluate this property's income stability, tenant credit quality, and submarket rent trends before finalizing underwriting assumptions.</p>`;
  }

  // === Financing Strategy ===
  const financingHtml = analysisType === "land"
    ? `<p>Land typically does not support conventional permanent financing. Expect all-cash or short-term land loans at 55-65% LTV, rates 150-250 bps above permanent debt, and 1-3 year terms. If the seller is willing to carry, land deals are a classic use case - 25-40% down with a 2-5 year balloon is common.</p>`
    : `<p>A ${typeLabel.toLowerCase()} property of this profile typically finances at 60-70% LTV with a 25-year amortization. Current market rates are 6.75-7.75% for conventional CMBS / agency debt. If the seller has a below-market existing loan, a loan assumption may be the most attractive structure. Alternatively, bridge-to-perm may apply depending on the specific property and sponsor.</p>`;

  // === Exit Strategy ===
  let exitHtml = "";
  if (analysisType === "land") {
    exitHtml = `<p>Primary exit: sale to a vertical developer or end-user after entitlements are in place. Secondary exit: JV with a developer retaining participation. Tertiary: hold as long-term land bank. Target an all-in cost basis that leaves at least a 20% margin to the pro forma residual value at stabilization.</p>`;
  } else if (briefNOI > 0) {
    const yr5NOI = briefNOI * Math.pow(1.025, 5);
    const yr10NOI = briefNOI * Math.pow(1.025, 10);
    const exit5 = yr5NOI / 0.075;
    const exit10 = yr10NOI / 0.075;
    exitHtml = `<p>At a 7.5% exit cap (approximately 25 bps above entry), the implied exit values are ${fmt$(Math.round(exit5))} at Year 5 and ${fmt$(Math.round(exit10))} at Year 10, assuming 2.5% annual NOI growth. These are directional - tighten the exit cap 25-50 bps for stronger performance or widen 50-100 bps for softer execution.</p>`;
  } else {
    exitHtml = `<p>Exit analysis requires a normalized NOI assumption. See the Workbook for scenario-based exit value modeling.</p>`;
  }

  // === Value Creation ===
  const valueLevers: string[] = [];
  if (isLeaseUp) valueLevers.push(`<strong>Lease-up to stabilization.</strong> At ${briefOcc}% occupancy, bringing the property to a market-stabilized level (typically 92-95%) is the primary lever.`);
  if (briefWale > 0 && briefWale < 4) valueLevers.push(`<strong>Mark rents to market on rollover.</strong> With a ${briefWale.toFixed(1)}-year WALE, there's opportunity to re-lease at current market rates as tenants roll.`);
  if (briefYear > 0 && 2026 - briefYear > 15) valueLevers.push(`<strong>Selective capital investment.</strong> A ${2026 - briefYear}-year-old building may benefit from modest capital modernization.`);
  if (analysisType === "retail") valueLevers.push(`<strong>Out-parcel or pad development.</strong> Confirm with the broker whether any out-parcels are developable under current zoning.`);
  if (analysisType === "office") valueLevers.push(`<strong>Spec suite program.</strong> Pre-built move-in-ready suites capture smaller tenants quickly and justify premium rents.`);
  if (analysisType === "industrial") valueLevers.push(`<strong>Yard / trailer parking optimization.</strong> Industrial tenants pay premiums for incremental trailer parking or secured yard.`);
  if (valueLevers.length === 0) valueLevers.push(`<strong>Operating efficiency.</strong> Benchmark in-place expenses against comparable properties - even a 5% expense reduction compounds meaningfully at the exit cap.`);

  // === Key Risks ===
  const risks: string[] = [];
  const capSig = String(g("signals", "cap_rate_signal") || "").toLowerCase();
  const dscrSig = String(g("signals", "dscr_signal") || "").toLowerCase();
  const occSig = String(g("signals", "occupancy_signal") || "").toLowerCase();
  const rollSig = String(g("signals", "rollover_signal") || "").toLowerCase();
  const tenSig = String(g("signals", "tenant_quality_signal") || "").toLowerCase();
  if (capSig.includes("red") || capSig.includes("yellow")) risks.push(`<strong>Entry cap rate pressure.</strong> Pressure test against recent submarket comps before finalizing the offer.`);
  if (dscrSig.includes("red") || dscrSig.includes("yellow")) risks.push(`<strong>Financeability.</strong> The projected debt service coverage is tight for current debt markets. Equity requirements may increase.`);
  if (occSig.includes("red") || occSig.includes("yellow") || isLeaseUp) risks.push(`<strong>Occupancy risk.</strong> Current occupancy introduces lease-up execution risk. Every month of delayed lease-up impacts IRR.`);
  if (rollSig.includes("red") || rollSig.includes("yellow")) risks.push(`<strong>Rollover concentration.</strong> Near-term lease expirations create retention and re-tenanting risk.`);
  if (tenSig.includes("red") || tenSig.includes("yellow")) risks.push(`<strong>Tenant credit.</strong> Confirm corporate vs. personal guaranties and obtain recent financials on non-credit tenants.`);
  if (analysisType === "office") risks.push(`<strong>Sector headwinds.</strong> Office faces structural demand softness. Underwrite conservative rent growth.`);
  if (risks.length === 0) risks.push(`<strong>Interest rate and cap rate risk.</strong> Stress test the IRR at an exit cap 100 bps wider than entry.`);

  // === Cap Rate Scenarios ===
  let capScenariosHtml = "";
  if (noi > 0 && analysisType !== "land") {
    const capRows: string[] = [];
    for (let cr = 7; cr <= 10; cr += 0.5) {
      const iv = noi / (cr / 100);
      const psfVal = briefSF > 0 ? `$${(iv / briefSF).toFixed(0)}/SF` : "--";
      const sigLabel = cr <= 7.5 ? "Aggressive" : cr <= 8.5 ? "Fair" : "Attractive";
      const sigCls = cr <= 7.5 ? "sr" : cr <= 8.5 ? "sy" : "sg";
      capRows.push(`<tr><td><b>${cr.toFixed(1)}%</b></td><td>${fmt$(iv)}</td><td>${psfVal}</td><td class="${sigCls}">${sigLabel}</td></tr>`);
    }
    capScenariosHtml = `
<h2>Cap Rate Scenario Table</h2>
<p style="font-size:9.5pt;color:#6B7280;">Based on ${briefNOIAdj ? "adjusted" : "in-place"} NOI of ${fmt$(noi)}</p>
<table>
<tr><th>Cap Rate</th><th>Implied Value</th><th>Price/SF</th><th>Signal</th></tr>
${capRows.join("\n")}
</table>`;
  }

  // === Breakeven Analysis with Stress Tests ===
  let breakevenHtml = "";
  if (analysisType !== "land") {
    const beRows: string[] = [];
    if (briefDebtService > 0) {
      beRows.push(`<tr><td>NOI to cover debt at 1.00x DSCR</td><td class="metric-val">${fmt$(briefDebtService)}</td></tr>`);
      beRows.push(`<tr class="alt-row"><td>NOI to cover debt at 1.20x DSCR</td><td class="metric-val">${fmt$(briefDebtService * 1.2)}</td></tr>`);
      beRows.push(`<tr><td>NOI to cover debt at 1.35x DSCR</td><td class="metric-val">${fmt$(briefDebtService * 1.35)}</td></tr>`);
    }
    if (briefBreakeven > 0) beRows.push(`<tr class="alt-row"><td>Breakeven Occupancy</td><td class="metric-val">${briefBreakeven.toFixed(1)}%</td></tr>`);
    const beSF = briefSF > 0 && noi > 0 ? (briefDebtService > 0 ? briefDebtService / briefSF : noi / briefSF) : 0;
    if (beSF > 0) beRows.push(`<tr><td>Breakeven Rent / SF</td><td class="metric-val">$${beSF.toFixed(2)}</td></tr>`);

    // Stress tests from tenant data
    let stressHtml = "";
    if (tenantData.length > 0) {
      const riskTenants = tenantData.filter((t: any) => {
        const st = String(t.status || t.risk_level || "").toLowerCase();
        const end = String(t.end || t.lease_end || "").toLowerCase();
        return st.includes("expir") || st.includes("vacant") || st.includes("mtm") || st.includes("risk") || st.includes("red");
      });
      if (riskTenants.length > 0 && noi > 0) {
        const totalRiskRent = riskTenants.reduce((sum: number, t: any) => sum + (Number(t.rent || t.annual_rent) || 0), 0);
        const totalRiskSf = riskTenants.reduce((sum: number, t: any) => sum + (Number(t.sf || t.gla) || 0), 0);
        const riskNames = riskTenants.map((t: any) => t.name || t.tenant_name).join(", ");
        const stressNoi = noi - totalRiskRent;
        const stressDscr = briefDebtService > 0 ? stressNoi / briefDebtService : 0;
        stressHtml = `
<h3>Stress Test: At-Risk Tenants Vacate</h3>
<p>If at-risk tenants (${riskNames}) vacate, ${totalRiskSf > 0 ? `${totalRiskSf.toLocaleString()} SF and ` : ""}${fmt$(totalRiskRent)} in annual rent is lost. NOI drops to approximately ${fmt$(stressNoi)}${stressDscr > 0 ? `. DSCR ${stressDscr < 1.0 ? `<b class="sr">collapses to ${stressDscr.toFixed(2)}x (below 1.0x)</b>` : `falls to ${stressDscr.toFixed(2)}x`}` : ""}.</p>`;
      }
    }

    breakevenHtml = `
<h2>Breakeven Analysis</h2>
<table>
<tr><th>Metric</th><th>Value</th></tr>
${beRows.join("\n")}
</table>
${stressHtml}`;
  }

  // === Tenant Rollover Detail ===
  let tenantRolloverHtml = "";
  if (tenantData.length > 0) {
    const tRows = tenantData.map((t: any, i: number) => {
      const name = t.name || t.tenant_name || `Tenant ${i + 1}`;
      const tSf = t.sf || t.gla || "";
      const tRent = t.rent || t.annual_rent || "";
      const tType = t.type || t.lease_type || "";
      const tEnd = t.end || t.lease_end || "";
      const tExt = t.extension || t.options || "";
      const tStatus = t.status || t.risk_level || "";
      const isRisk = String(tStatus).toLowerCase().match(/expir|vacant|mtm|risk|red|gone/);
      const pctGla = briefSF > 0 && tSf ? `${((Number(tSf) / briefSF) * 100).toFixed(1)}%` : "";
      return `<tr${i % 2 ? ' class="alt-row"' : ""}><td><b>${name}</b></td><td>${tSf ? Number(tSf).toLocaleString() : ""}</td><td>${pctGla}</td><td>${tRent ? fmt$(tRent) : ""}</td><td>${tEnd}</td><td>${tExt || "None"}</td><td class="${isRisk ? "sr" : "sg"}">${tStatus}</td></tr>`;
    }).join("\n");
    tenantRolloverHtml = `
<h2>Tenant Rollover Detail</h2>
<table>
<tr><th>Tenant</th><th>SF</th><th>% GLA</th><th>Annual Rent</th><th>Lease End</th><th>Extension</th><th>Risk Level</th></tr>
${tRows}
</table>`;
  }

  // === Underwriting Notes ===
  const debtRate = Number(g("debt_assumptions", "interest_rate")) || 7.25;
  const ltvPct = Number(g("debt_assumptions", "ltv_pct")) || 65;
  const uwNotesHtml = `<p>Debt assumed at ${debtRate.toFixed(2)}% rate, 25-year amortization, ${ltvPct}% LTV${briefAskPrice > 0 ? ` on purchase price of ${fmt$(briefAskPrice)}` : ""}. Closing costs at 2%. Management fee estimated at 6% of EGI. Reserves at $0.25/SF. ${briefNOIAdj && briefNOIAdj !== briefNOI ? "Adjusted NOI reflects management fee and reserves not included in the OM statement." : "No immediate capex budgeted (insufficient data)."}</p>`;

  // === Missing Data / Assumptions ===
  const missing: string[] = [];
  if (!briefAskPrice) missing.push("Asking price / seller expectations");
  if (tenantData.length === 0) missing.push("Tenant details, lease abstracts, and renewal status");
  if (!briefYear) missing.push("Year built and property condition report");
  missing.push("Actual lease abstracts (confirm NNN vs Gross structure)");
  missing.push("Rent escalation schedule for each tenant");
  missing.push("Environmental / survey / title status");
  missing.push("Deferred maintenance and recent capex history");
  missing.push("Land size and site plan details");

  const assumed: string[] = [];
  assumed.push(`${briefCap > 0 ? briefCap.toFixed(1) + "%" : "8.0%"} entry cap for base case pricing`);
  assumed.push(`${debtRate.toFixed(2)}% debt rate, 25-yr amort, ${ltvPct}% LTV`);
  assumed.push("2% closing costs");
  assumed.push("6% management fee on EGI");
  assumed.push("$0.25/SF reserves");
  assumed.push("No immediate capex");

  // === Next Steps ===
  const nextSteps = [
    `Submit LOI at ${briefAskPrice > 0 ? fmt$(Math.round(briefAskPrice * 0.95)) + " (approximately 95% of ask)" : "an appropriate opening offer price"} with 30-day DD and 60-day close.`,
    `Prioritize red-flag diligence items from the Signal Assessment.`,
    `Engage legal counsel for PSA negotiation assuming LOI is accepted.`,
    `Order preliminary title report and Phase I environmental as soon as PSA is executed.`,
    `Obtain at least two debt quotes during the DD period; verify the DSCR and LTV assumptions hold at quoted terms.`,
  ];

  // === Build the HTML document ===
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><style>
@page { size: 8.5in 11in; margin: 0.75in 1in; }
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.6; }
h1 { font-size: 18pt; color: #0B1120; border-bottom: 2.5px solid #C49A3C; padding-bottom: 8px; margin: 0 0 4px 0; }
h2 { font-size: 13pt; color: #253352; margin: 24px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid #E0E5ED; }
h3 { font-size: 11pt; color: #253352; margin: 16px 0 6px 0; }
p { margin: 5px 0; }
.sub { font-size: 9.5pt; color: #8899B0; font-style: italic; margin-bottom: 16px; }
.loc { font-size: 10.5pt; color: #555; margin: 2px 0 2px 0; }
.type-badge { display: inline-block; background: #F0F4FF; color: #3B5998; padding: 4px 12px; border-radius: 4px; font-size: 10pt; font-weight: 600; margin-bottom: 6px; }
.deal-cat-badge { display: inline-block; background: #FEF3C7; color: #92400E; padding: 4px 12px; border-radius: 4px; font-size: 10pt; font-weight: 600; margin-bottom: 6px; margin-left: 6px; }
ul { margin: 6px 0 6px 18px; padding: 0; }
ol { margin: 6px 0 6px 18px; padding: 0; }
li { margin: 4px 0; line-height: 1.5; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10pt; }
th { background: #262C5C; color: #fff; text-align: left; padding: 7px 10px; border: 1px solid #262C5C; font-weight: 600; }
td { padding: 5px 10px; border: 1px solid #D8DFE9; }
.alt-row { background: #F6F8FB; }
.metric-val { font-weight: 600; }
.sg { color: #059669; font-weight: 600; }
.sy { color: #D97706; font-weight: 600; }
.sr { color: #DC2626; font-weight: 600; }
.brief-text { margin: 10px 0; }
.brief-text p { margin: 8px 0; line-height: 1.6; }
.strength-item, .concern-item { margin: 5px 0; line-height: 1.5; }
.strength-mark { color: #059669; font-weight: 700; margin-right: 6px; }
.concern-mark { color: #D97706; font-weight: 700; margin-right: 6px; }
.callout { background: #FFFBEB; border-left: 3px solid #D97706; padding: 10px 14px; margin: 14px 0; font-size: 10pt; }
.callout-info { background: #EFF6FF; border-left: 3px solid #2563EB; padding: 10px 14px; margin: 14px 0; font-size: 10pt; }
.toc { background: #F9FAFB; border: 1px solid #E5E7EB; padding: 10px 14px; font-size: 10pt; margin-bottom: 18px; }
.toc strong { color: #253352; }
.disclaimer { font-size: 9pt; color: #6B7280; line-height: 1.6; font-style: italic; margin-top: 8px; }
.footer-brand { margin-top: 30px; padding-top: 14px; border-top: 1px solid #D8DFE9; text-align: center; }
</style></head><body>

<h1>${briefTitle}</h1>
<h2 style="border:none;margin-top:6px;font-size:15pt;">${propertyName}</h2>
${fullLoc ? `<p class="loc">${fullLoc}</p>` : ""}
<div class="type-badge">${typeLabel} Analysis</div><div class="deal-cat-badge">${dealCategory}</div>
<p class="sub">${disclaimerText}</p>

<div class="toc">
<strong>Contents:</strong> Deal Snapshot &middot; Initial Read &middot; Key Metrics &middot; Visual Indicators &middot; Strengths &middot; Risks${scenariosSectionHtml ? " &middot; Back-of-Napkin Returns" : ""} &middot; Investment Thesis &middot; Market Context &middot; Financing &middot; Exit Strategy &middot; Value Creation${capScenariosHtml ? " &middot; Cap Rate Scenarios" : ""}${breakevenHtml ? " &middot; Breakeven Analysis" : ""}${tenantRolloverHtml ? " &middot; Tenant Rollover" : ""} &middot; Missing Data &middot; Next Steps &middot; Conclusion
</div>

<h2>Deal Snapshot</h2>
<ul>${snap.map(s => `<li>${s}</li>`).join("")}</ul>

<h2>Initial Read</h2>
${briefSectionHtml || `<div class="brief-text"><p>No assessment generated.</p></div>`}

${briefWorks.length > 0 ? `<h2>Strengths</h2>
<ul>${briefWorks.map(s => `<li>${s}</li>`).join("")}</ul>` : ""}

${briefDies.length > 0 ? `<h2>Risks / Open Questions</h2>
<ul>${briefDies.map(c => `<li>${c}</li>`).join("")}</ul>` : `<h2>Key Risks</h2>
<ul>${risks.map(r => `<li>${r}</li>`).join("")}</ul>`}

<h2>Key Metrics</h2>
<table>
<tr><th>Metric</th><th>Value</th><th>Signal</th></tr>
${metrics.map(([label, val], i) => `<tr${i % 2 ? ' class="alt-row"' : ""}><td>${label}</td><td class="metric-val">${val}</td><td>${metricSignal(label)}</td></tr>`).join("\n")}
</table>

<h2>Visual Indicators Summary</h2>
<table>
<tr><th>Category</th><th>Signal</th><th>Note</th></tr>
${signals.map(([label, val], i) => {
    return `<tr${i % 2 ? ' class="alt-row"' : ""}><td>${label}</td><td class="${sigClass(val)}">${val}</td><td></td></tr>`;
  }).join("\n")}
</table>

<h2>Underwriting Notes</h2>
${uwNotesHtml}

${scenariosSectionHtml}

<h2>Investment Thesis</h2>
${thesisHtml}

<h2>Market Context</h2>
${marketContext}

<h2>Financing Strategy</h2>
${financingHtml}

<h2>Exit Strategy</h2>
${exitHtml}

<h2>Value Creation Opportunities</h2>
<ul>${valueLevers.map(v => `<li>${v}</li>`).join("")}</ul>

${capScenariosHtml}

${breakevenHtml}

${tenantRolloverHtml}

<h2>Missing Data / Assumptions</h2>
<p><b>Missing - must obtain before deeper underwriting:</b></p>
<ul>${missing.map(m => `<li>${m}</li>`).join("")}</ul>
<p><b>Assumed for first pass:</b></p>
<ul>${assumed.map(a => `<li>${a}</li>`).join("")}</ul>

<h2>Next Steps</h2>
<ol>${nextSteps.map(s => `<li>${s}</li>`).join("")}</ol>

<h2>First-Pass Conclusion</h2>
${g("signals", "overall_signal") ? `<h3>Overall Signal</h3><p class="${sigClass(g("signals", "overall_signal"))}"><b>${g("signals", "overall_signal")}</b></p>` : ""}
${g("signals", "recommendation") ? `<h3>Recommendation</h3><p class="${sigClass(g("signals", "recommendation"))}"><b>${g("signals", "recommendation")}</b></p>` : ""}

<h2 style="margin-top:32px;font-size:11pt;color:#6B7280;border-bottom:1px solid #E5E7EB;text-transform:uppercase;letter-spacing:0.08em">Disclaimer</h2>
<p class="disclaimer">
This First-Pass Brief is automated general guidance produced by Deal Signals. It is NOT investment, legal, tax, accounting, or financial advice, and it is not an offer, solicitation, or recommendation to buy, sell, lease, finance, or otherwise transact in any property or security. Figures are derived from uploaded documents and public data sources that may be incomplete, out-of-date, or inaccurate. Scenario ranges are back-of-napkin triage outputs based on standardized assumptions and should not be treated as a final underwriting model. You are solely responsible for verifying every material fact (rent roll, leases, expenses, title, environmental, zoning, financing) and conducting full legal, financial, and physical due diligence with qualified professionals before committing any capital. No representation or warranty, express or implied, is made by Deal Signals or its operators as to the accuracy, completeness, or fitness for any particular purpose of the information contained herein. Use at your own risk.
</p>

<div class="footer-brand">
<p style="font-size:10pt;font-weight:700;color:#253352;margin:0;">Deal Signals</p>
<p style="font-size:9pt;color:#6B7280;margin:2px 0;">Analyze CRE deals with AI-powered intelligence. Get real signals, not guesses.</p>
<p style="font-size:9pt;margin:4px 0;"><a href="https://www.dealsignals.app" style="color:#3B5998;text-decoration:none;">www.dealsignals.app</a></p>
<p style="font-size:8pt;color:#9CA3AF;margin:8px 0 0 0;font-style:italic;">Generated by Deal Signals &middot; ${typeLabel} Model</p>
</div>

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

