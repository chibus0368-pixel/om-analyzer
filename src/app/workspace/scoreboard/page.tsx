"use client";

import { useEffect, useState } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, getPropertyExtractedFields } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { Property, ExtractedField } from "@/lib/workspace/types";
import Link from "next/link";

// Metric rows for comparison — matches the Excel underwriting format
const METRIC_SECTIONS = [
  {
    section: "Property Info",
    rows: [
      { key: "address", label: "Address" },
      { key: "asset_type", label: "Asset Type" },
      { key: "year_built", label: "Year Built" },
      { key: "building_sf", label: "GLA (SF)" },
      { key: "units", label: "# Units / Tenants" },
      { key: "occupancy", label: "Occupancy" },
      { key: "lease_type", label: "Lease Type" },
    ],
  },
  {
    section: "Pricing & Returns",
    rows: [
      { key: "asking_price", label: "Asking Price" },
      { key: "price_sf", label: "Price / SF" },
      { key: "in_place_rent", label: "In-Place Rent" },
      { key: "noi", label: "In-Place NOI" },
      { key: "adjusted_noi", label: "Adjusted NOI" },
      { key: "cap_rate", label: "Entry Cap (in-place)" },
    ],
  },
  {
    section: "Debt & Coverage",
    rows: [
      { key: "debt_service", label: "Debt Service" },
      { key: "dscr", label: "DSCR (in-place)" },
      { key: "dscr_adjusted", label: "DSCR (adjusted)" },
      { key: "debt_yield", label: "Debt Yield" },
      { key: "coc", label: "Cash-on-Cash" },
      { key: "breakeven", label: "Breakeven Occupancy" },
    ],
  },
  {
    section: "Tenant & Risk",
    rows: [
      { key: "anchor", label: "Anchor Tenant" },
      { key: "shadow_anchor", label: "Shadow Anchor" },
      { key: "at_risk_gla", label: "At-Risk GLA" },
      { key: "lease_term", label: "Avg Lease Term (WALE)" },
      { key: "rent_psf", label: "Avg Rent / SF" },
      { key: "median_hh_income", label: "Median HH Income" },
      { key: "traffic", label: "Traffic" },
    ],
  },
  {
    section: "Signals",
    rows: [
      { key: "value_add", label: "Value-Add Angle" },
      { key: "recommendation", label: "Recommendation" },
    ],
  },
];

// Field mapping: how to find each metric from extracted fields
const FIELD_MAP: Record<string, string[]> = {
  address: ["property_basics.address", "property_basics.city"],
  asset_type: ["property_basics.asset_type"],
  year_built: ["property_basics.year_built"],
  building_sf: ["property_basics.building_sf"],
  units: ["property_basics.tenant_count", "rent_roll.num_tenants"],
  occupancy: ["property_basics.occupancy_pct"],
  lease_type: ["property_basics.wale_years"],
  asking_price: ["pricing_deal_terms.asking_price"],
  price_sf: ["pricing_deal_terms.price_per_sf"],
  in_place_rent: ["income.base_rent", "income.gross_scheduled_income"],
  noi: ["expenses.noi_om", "expenses.noi", "expenses.noi_adjusted"],
  adjusted_noi: ["expenses.noi_adjusted"],
  cap_rate: ["pricing_deal_terms.cap_rate_om", "pricing_deal_terms.cap_rate_adjusted", "pricing_deal_terms.cap_rate_asking"],
  debt_service: ["debt_assumptions.annual_debt_service"],
  dscr: ["debt_assumptions.dscr_om", "debt_assumptions.dscr", "debt_assumptions.dscr_adjusted"],
  dscr_adjusted: ["debt_assumptions.dscr_adjusted"],
  debt_yield: ["debt_assumptions.debt_yield"],
  coc: ["returns.cash_on_cash_om", "returns.cash_on_cash", "returns.cash_on_cash_adjusted"],
  breakeven: ["returns.breakeven_occupancy"],
  anchor: ["rent_roll.anchor_tenant"],
  shadow_anchor: ["property_basics.shadow_anchor"],
  at_risk_gla: ["rent_roll.at_risk_gla"],
  lease_term: ["property_basics.wale_years", "rent_roll.weighted_avg_lease_term"],
  rent_psf: ["income.rent_per_sf", "rent_roll.avg_rent_psf"],
  median_hh_income: ["property_basics.median_hh_income"],
  traffic: ["property_basics.traffic"],
  value_add: ["signals.recommendation"],
  recommendation: ["signals.overall_signal"],
};

interface PropertyData {
  property: Property;
  values: Map<string, string>;
}

// Format types for display
const FORMAT_MAP: Record<string, "dollar" | "percent" | "sf" | "ratio" | "text" | "number"> = {
  asking_price: "dollar", price_sf: "dollar", in_place_rent: "dollar", noi: "dollar",
  adjusted_noi: "dollar", debt_service: "dollar",
  cap_rate: "percent", breakeven: "percent", occupancy: "percent",
  coc: "percent", debt_yield: "percent",
  dscr: "ratio", dscr_adjusted: "ratio",
  building_sf: "sf",
  units: "number", year_built: "number",
};

function formatValue(key: string, raw: string): string {
  if (!raw) return "";
  const n = Number(raw);
  const fmt = FORMAT_MAP[key];
  if (isNaN(n) || fmt === "text" || !fmt) return raw;
  switch (fmt) {
    case "dollar":
      if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
      if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
      return `$${n.toFixed(2)}`;
    case "percent": return `${n.toFixed(2)}%`;
    case "ratio": return `${n.toFixed(2)}x`;
    case "sf": return `${Math.round(n).toLocaleString()} SF`;
    case "number": return Math.round(n).toLocaleString();
    default: return raw;
  }
}

function getFieldValue(fields: ExtractedField[], keys: string[]): string {
  for (const key of keys) {
    const [group, name] = key.split(".");
    const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
    if (f) {
      const val = f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
      if (val !== null && val !== undefined && val !== "") return String(val);
    }
  }
  return "";
}

// ── Excel color constants (ARGB hex) ──
const XL = {
  navy: "FF0B1120",
  gold: "FFC49A3C",
  white: "FFFFFFFF",
  offWhite: "FFF6F8FB",
  lightGray: "FFEDF0F5",
  midGray: "FF8899B0",
  darkText: "FF253352",
  inputBlue: "FF0000FF",       // blue = editable input
  formulaBlack: "FF000000",    // black = formula
  greenBg: "FFE6F9F0", greenText: "FF059669",
  yellowBg: "FFFEF3C7", yellowText: "FFD97706",
  redBg: "FFFEE2E2", redText: "FFDC2626",
};

// Rows where the user can tweak values (blue = input)
const INPUT_KEYS = new Set([
  "asking_price", "noi", "adjusted_noi", "in_place_rent",
  "occupancy", "debt_service", "building_sf",
]);

// Keys whose value should stay as raw numbers
const NUMERIC_KEYS = new Set(Object.keys(FORMAT_MAP));

// Excel number format strings
const XL_FMT: Record<string, string> = {
  dollar: '$#,##0;($#,##0);"-"',
  percent: '0.00%',
  ratio: '0.00"x"',
  sf: '#,##0" SF"',
  number: '#,##0',
};

function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

async function exportToXlsx(propertyData: PropertyData[], workspaceName: string) {
  try {
  const excelMod = await import("exceljs");
  const ExcelJS = excelMod.default || excelMod;
  const fileSaverMod = await import("file-saver");
  const saveAs = fileSaverMod.saveAs || fileSaverMod.default?.saveAs;
  const wb = new ExcelJS.Workbook();
  wb.creator = "NNNTripleNet OM Analyzer";

  // ────── Sheet 1: Scoreboard ──────
  const ws = wb.addWorksheet("Deal Scoreboard", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2 }],
  });

  const propCount = propertyData.length;
  const dataCols = propCount; // one column per property

  // -- Row 1: Title
  ws.mergeCells(1, 1, 1, 1 + dataCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${workspaceName || "Deal"} Scoreboard`;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: XL.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.navy } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(1).height = 32;

  // -- Row 2: Property name headers
  ws.getCell(2, 1).value = "Metric";
  ws.getCell(2, 1).font = { name: "Arial", size: 10, bold: true, color: { argb: XL.white } };
  ws.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.navy } };
  ws.getCell(2, 1).alignment = { horizontal: "left" };
  ws.getColumn(1).width = 24;

  propertyData.forEach((pd, i) => {
    const col = i + 2;
    const cell = ws.getCell(2, col);
    cell.value = pd.property.propertyName;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: XL.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.navy } };
    cell.alignment = { horizontal: "center", wrapText: true };
    ws.getColumn(col).width = 22;
  });

  // Track cell addresses for formula rows
  const cellRef: Record<string, Record<number, string>> = {}; // metricKey → {propIdx → cellRef}

  let row = 3;

  for (const section of METRIC_SECTIONS) {
    // Section header row
    ws.mergeCells(row, 1, row, 1 + dataCols);
    const secCell = ws.getCell(row, 1);
    secCell.value = section.section;
    secCell.font = { name: "Arial", size: 10, bold: true, color: { argb: XL.darkText } };
    secCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.offWhite } };
    secCell.border = { bottom: { style: "thin", color: { argb: XL.lightGray } } };
    ws.getRow(row).height = 22;
    row++;

    for (const metric of section.rows) {
      const labelCell = ws.getCell(row, 1);
      labelCell.value = metric.label;
      labelCell.font = { name: "Arial", size: 10, bold: false, color: { argb: XL.midGray } };
      labelCell.alignment = { horizontal: "left", indent: 1 };

      cellRef[metric.key] = {};

      propertyData.forEach((pd, i) => {
        const col = i + 2;
        const cell = ws.getCell(row, col);
        const raw = pd.values.get(metric.key) || "";
        const addr = `${colLetter(col - 1)}${row}`;
        cellRef[metric.key][i] = addr;

        const isInput = INPUT_KEYS.has(metric.key);
        const fmt = FORMAT_MAP[metric.key];

        // Write raw number if possible, otherwise text
        const num = Number(raw);
        if (raw && !isNaN(num) && NUMERIC_KEYS.has(metric.key)) {
          // For percentages, store as decimal for Excel
          if (fmt === "percent") {
            cell.value = num / 100;
          } else {
            cell.value = num;
          }
          if (fmt && XL_FMT[fmt]) cell.numFmt = XL_FMT[fmt];
        } else {
          cell.value = raw || "";
        }

        // Styling: blue text for inputs, black for data
        cell.font = {
          name: "Arial", size: 10,
          color: { argb: isInput ? XL.inputBlue : XL.formulaBlack },
          bold: isInput,
        };
        cell.alignment = { horizontal: "center" };

        // Yellow highlight for input cells
        if (isInput && raw) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFDE7" } };
        }

        // Signal color coding
        if (raw.includes("🟢")) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.greenBg } };
          cell.font = { ...cell.font, color: { argb: XL.greenText } };
        } else if (raw.includes("🟡")) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.yellowBg } };
          cell.font = { ...cell.font, color: { argb: XL.yellowText } };
        } else if (raw.includes("🔴")) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.redBg } };
          cell.font = { ...cell.font, color: { argb: XL.redText } };
        }

        // CRE threshold coloring for numeric metrics
        if (!isNaN(num) && raw) {
          let bg = "", fg = "";
          if (metric.key === "cap_rate") {
            if (num >= 8) { bg = XL.greenBg; fg = XL.greenText; }
            else if (num >= 7) { bg = XL.yellowBg; fg = XL.yellowText; }
            else { bg = XL.redBg; fg = XL.redText; }
          } else if (metric.key === "dscr" || metric.key === "dscr_adjusted") {
            if (num >= 1.35) { bg = XL.greenBg; fg = XL.greenText; }
            else if (num >= 1.2) { bg = XL.yellowBg; fg = XL.yellowText; }
            else { bg = XL.redBg; fg = XL.redText; }
          } else if (metric.key === "occupancy") {
            if (num >= 90) { bg = XL.greenBg; fg = XL.greenText; }
            else if (num >= 80) { bg = XL.yellowBg; fg = XL.yellowText; }
            else { bg = XL.redBg; fg = XL.redText; }
          } else if (metric.key === "coc") {
            if (num >= 8) { bg = XL.greenBg; fg = XL.greenText; }
            else if (num >= 6) { bg = XL.yellowBg; fg = XL.yellowText; }
            else { bg = XL.redBg; fg = XL.redText; }
          }
          if (bg) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
            cell.font = { ...cell.font, color: { argb: fg } };
          }
        }

        // Bottom border
        cell.border = { bottom: { style: "hair", color: { argb: XL.lightGray } } };
      });

      labelCell.border = { bottom: { style: "hair", color: { argb: XL.lightGray } } };
      row++;
    }
  }

  // ────── Formula rows: Calculated scenarios ──────
  row += 1;
  ws.mergeCells(row, 1, row, 1 + dataCols);
  const scenCell = ws.getCell(row, 1);
  scenCell.value = "Scenario Formulas (change blue input cells above to recalculate)";
  scenCell.font = { name: "Arial", size: 10, bold: true, color: { argb: XL.gold.replace("FF", "FF") } };
  scenCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL.navy } };
  ws.getRow(row).height = 24;
  row++;

  // Calculated Cap Rate = NOI / Asking Price
  const capLabel = ws.getCell(row, 1);
  capLabel.value = "Calc. Cap Rate (NOI ÷ Price)";
  capLabel.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
  propertyData.forEach((_, i) => {
    const col = i + 2;
    const cell = ws.getCell(row, col);
    const noiRef = cellRef["noi"]?.[i];
    const priceRef = cellRef["asking_price"]?.[i];
    if (noiRef && priceRef) {
      cell.value = { formula: `IF(OR(${priceRef}=0,${priceRef}=""),"",${noiRef}/${priceRef})` };
      cell.numFmt = '0.00%';
      cell.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
      cell.alignment = { horizontal: "center" };
    }
  });
  row++;

  // Calculated Price/SF = Asking Price / GLA
  const psfLabel = ws.getCell(row, 1);
  psfLabel.value = "Calc. Price/SF (Price ÷ GLA)";
  psfLabel.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
  propertyData.forEach((_, i) => {
    const col = i + 2;
    const cell = ws.getCell(row, col);
    const priceRef = cellRef["asking_price"]?.[i];
    const sfRef = cellRef["building_sf"]?.[i];
    if (priceRef && sfRef) {
      cell.value = { formula: `IF(OR(${sfRef}=0,${sfRef}=""),"",$${priceRef.replace(/[A-Z]+/, "$&$")}/${sfRef})` };
      cell.numFmt = '$#,##0.00';
      cell.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
      cell.alignment = { horizontal: "center" };
    }
  });
  row++;

  // DSCR = NOI / Debt Service
  const dscrLabel = ws.getCell(row, 1);
  dscrLabel.value = "Calc. DSCR (NOI ÷ Debt Svc)";
  dscrLabel.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
  propertyData.forEach((_, i) => {
    const col = i + 2;
    const cell = ws.getCell(row, col);
    const noiRef = cellRef["noi"]?.[i];
    const dsRef = cellRef["debt_service"]?.[i];
    if (noiRef && dsRef) {
      cell.value = { formula: `IF(OR(${dsRef}=0,${dsRef}=""),"",${noiRef}/${dsRef})` };
      cell.numFmt = '0.00"x"';
      cell.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
      cell.alignment = { horizontal: "center" };
    }
  });
  row++;

  // Cash-on-Cash = (NOI - Debt Service) / (Price * 0.30 assumed equity)
  const cocLabel = ws.getCell(row, 1);
  cocLabel.value = "Calc. CoC (30% equity assumed)";
  cocLabel.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
  propertyData.forEach((_, i) => {
    const col = i + 2;
    const cell = ws.getCell(row, col);
    const noiRef = cellRef["noi"]?.[i];
    const dsRef = cellRef["debt_service"]?.[i];
    const priceRef = cellRef["asking_price"]?.[i];
    if (noiRef && dsRef && priceRef) {
      cell.value = { formula: `IF(OR(${priceRef}=0,${priceRef}=""),"",(${noiRef}-${dsRef})/(${priceRef}*0.3))` };
      cell.numFmt = '0.00%';
      cell.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
      cell.alignment = { horizontal: "center" };
    }
  });
  row++;

  // Debt Yield = NOI / (Price * 0.70 assumed LTV)
  const dyLabel = ws.getCell(row, 1);
  dyLabel.value = "Calc. Debt Yield (70% LTV)";
  dyLabel.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
  propertyData.forEach((_, i) => {
    const col = i + 2;
    const cell = ws.getCell(row, col);
    const noiRef = cellRef["noi"]?.[i];
    const priceRef = cellRef["asking_price"]?.[i];
    if (noiRef && priceRef) {
      cell.value = { formula: `IF(OR(${priceRef}=0,${priceRef}=""),"",${noiRef}/(${priceRef}*0.7))` };
      cell.numFmt = '0.00%';
      cell.font = { name: "Arial", size: 10, color: { argb: XL.formulaBlack } };
      cell.alignment = { horizontal: "center" };
    }
  });
  row += 2;

  // Legend
  const legendRow = row;
  ws.getCell(legendRow, 1).value = "Legend:";
  ws.getCell(legendRow, 1).font = { name: "Arial", size: 9, bold: true, color: { argb: XL.midGray } };
  ws.getCell(legendRow + 1, 1).value = "Blue text = editable inputs — change these to run scenarios";
  ws.getCell(legendRow + 1, 1).font = { name: "Arial", size: 9, color: { argb: XL.inputBlue } };
  ws.getCell(legendRow + 2, 1).value = "Black text = formulas that auto-recalculate";
  ws.getCell(legendRow + 2, 1).font = { name: "Arial", size: 9, color: { argb: XL.formulaBlack } };

  // ── Save & download ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `${workspaceName || "scoreboard"}-deals.xlsx`);
  } catch (err: any) {
    console.error("[Scoreboard] XLS export failed:", err);
    alert(`Export failed: ${err?.message || "Unknown error"}. Check the browser console for details.`);
  }
}

export default function ScoreboardPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [propertyData, setPropertyData] = useState<PropertyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activeWorkspace) return;
    setLoading(true);

    // Load properties DIRECTLY — no projects layer
    getWorkspaceProperties(user.uid, activeWorkspace.id).then(async (props) => {
      if (props.length === 0) {
        setPropertyData([]);
        setLoading(false);
        return;
      }

      // For each property, load its extracted fields
      const data: PropertyData[] = await Promise.all(
        props.map(async (prop) => {
          const values = new Map<string, string>();

          // Load extracted fields directly by propertyId
          try {
            const propFields = await getPropertyExtractedFields(prop.id);

            // Map extracted fields to metric keys
            for (const [metricKey, fieldKeys] of Object.entries(FIELD_MAP)) {
              const val = getFieldValue(propFields, fieldKeys);
              if (val) values.set(metricKey, val);
            }
          } catch { /* no fields yet */ }

          // Fill in from property record itself
          if (!values.has("address")) {
            const addr = [prop.address1, prop.city, prop.state].filter(Boolean).join(", ");
            if (addr) values.set("address", addr);
          }
          if (!values.has("building_sf") && prop.buildingSf) values.set("building_sf", prop.buildingSf.toLocaleString());
          if (!values.has("occupancy") && prop.occupancyPct) values.set("occupancy", `${prop.occupancyPct}%`);

          return { property: prop, values };
        })
      );

      setPropertyData(data.sort((a, b) => a.property.propertyName.localeCompare(b.property.propertyName)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, activeWorkspace]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#5A7091" }}>Loading scoreboard...</div>;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Deal Scoreboard{activeWorkspace?.name ? ` · ${activeWorkspace.name}` : ""}</h1>
          <p style={{ fontSize: 13, color: "#5A7091", marginTop: 4 }}>
            Side-by-side property comparison — {propertyData.length} propert{propertyData.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        {propertyData.length > 0 && (
          <button
            onClick={() => exportToXlsx(propertyData, activeWorkspace?.name || "")}
            className="ws-btn-green"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", background: "#16A34A", color: "#fff",
              borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", border: "none", fontFamily: "inherit",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export XLS
          </button>
        )}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", overflow: "auto" }}>
        {propertyData.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#8899B0" }}>
            <p style={{ fontSize: 14, margin: "0 0 8px" }}>No properties in your workspace yet.</p>
            <p style={{ fontSize: 13, color: "#B4C1D1", margin: "0 0 16px" }}>
              Upload property documents to see a side-by-side comparison here.
            </p>
            <Link href="/workspace/upload" className="ws-btn-red" style={{
              display: "inline-block", padding: "8px 20px", background: "#DC2626", color: "#fff",
              borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none",
            }}>
              Upload Files
            </Link>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ background: "#0B1120" }}>
                <th style={{
                  padding: "14px 16px", textAlign: "left", color: "#8899B0", fontWeight: 600,
                  fontSize: 12, minWidth: 180, position: "sticky", left: 0, background: "#0B1120", zIndex: 1,
                }}>
                  Metric
                </th>
                {propertyData.map(pd => {
                  const overallSignal = pd.values.get("recommendation") || "";
                  const signalEmoji = overallSignal.includes("🟢") ? "🟢" : overallSignal.includes("🔴") ? "🔴" : overallSignal.includes("🟡") ? "🟡" : "";
                  const signalBg = overallSignal.includes("🟢") ? "rgba(16,185,129,0.15)" : overallSignal.includes("🔴") ? "rgba(220,38,38,0.15)" : overallSignal.includes("🟡") ? "rgba(217,119,6,0.15)" : "transparent";
                  return (
                    <th key={pd.property.id} style={{ padding: "12px 16px 14px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 13, minWidth: 200, verticalAlign: "bottom" }}>
                      {signalEmoji && (
                        <div style={{ marginBottom: 8, display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 14, fontWeight: 600, background: signalBg }}>
                          {signalEmoji}
                        </div>
                      )}
                      <Link href={`/workspace/properties/${pd.property.id}`} className="ws-link" style={{ color: "#fff", textDecoration: "none", display: "block" }}>
                        {pd.property.propertyName}
                      </Link>
                      {pd.property.city && (
                        <div style={{ fontSize: 11, fontWeight: 400, color: "#8899B0", marginTop: 2 }}>
                          {[pd.property.city, pd.property.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {METRIC_SECTIONS.map(section => (
                <>
                  <tr key={`section-${section.section}`} style={{ background: "#F6F8FB" }}>
                    <td colSpan={propertyData.length + 1} style={{
                      padding: "8px 16px", fontWeight: 700, fontSize: 11, color: "#5A7091",
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                      {section.section}
                    </td>
                  </tr>
                  {section.rows.map(row => (
                    <tr key={row.key} style={{ borderBottom: "1px solid #F6F8FB" }}>
                      <td style={{
                        padding: "10px 16px", fontWeight: 600, color: "#5A7091", fontSize: 12,
                        position: "sticky", left: 0, background: "#fff", zIndex: 1,
                      }}>
                        {row.label}
                      </td>
                      {propertyData.map(pd => {
                        const rawVal = pd.values.get(row.key) || "";
                        const val = rawVal ? formatValue(row.key, rawVal) : "--";
                        const isSignal = section.section === "Signals";
                        const n = Number(rawVal);

                        // Color code values based on thresholds
                        let valueColor = val === "--" ? "#D8DFE9" : isSignal ? "#0B1120" : "#253352";
                        let bgColor = "transparent";

                        if (val.includes("🟢")) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.08)"; }
                        else if (val.includes("🟡")) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.08)"; }
                        else if (val.includes("🔴")) { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.08)"; }

                        // Highlight key metrics based on CRE thresholds
                        if (!isNaN(n) && val !== "--") {
                          if (row.key === "cap_rate") {
                            if (n >= 8) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.1)"; }
                            else if (n >= 7) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.08)"; }
                            else { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.08)"; }
                          } else if (row.key === "dscr" || row.key === "dscr_adjusted") {
                            if (n >= 1.35) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.1)"; }
                            else if (n >= 1.2) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.08)"; }
                            else { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.08)"; }
                          } else if (row.key === "occupancy") {
                            if (n >= 90) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.1)"; }
                            else if (n >= 80) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.08)"; }
                            else { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.08)"; }
                          } else if (row.key === "price_sf") {
                            if (n < 120) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.1)"; }
                            else if (n <= 170) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.08)"; }
                            else { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.08)"; }
                          } else if (row.key === "coc") {
                            if (n >= 8) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.1)"; }
                            else if (n >= 6) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.08)"; }
                            else { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.08)"; }
                          } else if (row.key === "debt_yield") {
                            if (n >= 10) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.1)"; }
                            else if (n >= 8) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.08)"; }
                            else { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.08)"; }
                          } else if (row.key === "breakeven") {
                            if (n <= 75) { valueColor = "#059669"; bgColor = "rgba(16,185,129,0.1)"; }
                            else if (n <= 85) { valueColor = "#D97706"; bgColor = "rgba(217,119,6,0.08)"; }
                            else { valueColor = "#DC2626"; bgColor = "rgba(220,38,38,0.08)"; }
                          }
                        }

                        return (
                          <td key={pd.property.id} style={{
                            padding: "10px 16px", textAlign: "center",
                            fontWeight: isSignal ? 600 : 500,
                            color: valueColor,
                            background: bgColor,
                            fontSize: isSignal ? 12 : 13,
                          }}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
