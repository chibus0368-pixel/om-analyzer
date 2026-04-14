/**
 * Email HTML for "Email this property" feature.
 * Renders a formatted property page as an HTML email body,
 * using table-based layout and inline styles for broad client compatibility.
 *
 * This is NOT meant to be a pixel-perfect clone of PropertyDetailClient — it's
 * a high-fidelity digest: header, lens badge, Deal Score, key metrics, brief,
 * and a callout pointing at the attached Workbook + Brief.
 */

import type { ExtractedField, AnalysisType } from "./types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS, ANALYSIS_TYPE_ICONS } from "./types";

function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getField(fields: ExtractedField[], group: string, name: string): any {
  const f = fields.find(x => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : (f.normalizedValue || f.rawValue);
}

function fmtMoney(v: any): string {
  if (v === null || v === undefined || v === "") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(v: any): string {
  if (v === null || v === undefined || v === "") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(2) + "%";
}

function fmtNum(v: any): string {
  if (v === null || v === undefined || v === "") return "--";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function gradeColor(grade: string): string {
  switch ((grade || "").toUpperCase()) {
    case "A": return "#059669";
    case "B": return "#10B981";
    case "C": return "#F59E0B";
    case "D": return "#EF4444";
    case "F": return "#DC2626";
    default:  return "#6B7280";
  }
}

interface RenderArgs {
  propertyName: string;
  address?: string;
  city?: string;
  state?: string;
  analysisType: AnalysisType;
  dealScore?: number;
  grade?: string;
  fields: ExtractedField[];
  brief?: string;
  senderName?: string;
  senderEmail?: string;
  note?: string;
}

export function renderPropertyEmailHTML(args: RenderArgs): string {
  const {
    propertyName, address, city, state, analysisType,
    dealScore, grade, fields, brief, senderName, senderEmail, note,
  } = args;

  const lensColor = ANALYSIS_TYPE_COLORS[analysisType] || "#6B7280";
  const lensLabel = ANALYSIS_TYPE_LABELS[analysisType] || "Retail";
  const lensIcon = ANALYSIS_TYPE_ICONS[analysisType] || "📄";

  const loc = [address, city, state].filter(Boolean).join(", ");

  const g = (grp: string, name: string) => getField(fields, grp, name);

  // Universal headline metrics
  const askPrice = g("pricing_deal_terms", "asking_price");
  const noi      = g("expenses", "noi_om");
  const buildSf  = g("property_basics", "building_sf");
  const capRate  = (askPrice && noi) ? (Number(noi) / Number(askPrice)) * 100 : null;
  const ppsf     = (askPrice && buildSf) ? Number(askPrice) / Number(buildSf) : null;

  const metrics: Array<{ label: string; value: string }> = [
    { label: "Asking Price", value: fmtMoney(askPrice) },
    { label: "NOI",          value: fmtMoney(noi) },
    { label: "Cap Rate",     value: capRate !== null ? fmtPct(capRate) : "--" },
    { label: "Price / SF",   value: ppsf !== null ? fmtMoney(ppsf) : "--" },
    { label: "Building SF",  value: fmtNum(buildSf) },
  ];

  // Type-specific metric strip
  const typeMetrics: Array<{ label: string; value: string }> = [];
  if (analysisType === "retail") {
    const occ = g("property_basics", "occupancy");
    const waltCurrent = g("property_basics", "walt_current") || g("property_basics", "walt");
    if (occ !== null && occ !== undefined) typeMetrics.push({ label: "Occupancy", value: fmtPct(occ) });
    if (waltCurrent) typeMetrics.push({ label: "WALT", value: `${fmtNum(waltCurrent)} yrs` });
  } else if (analysisType === "multifamily") {
    const units = g("multifamily_addons", "unit_count");
    const avgRent = g("multifamily_addons", "avg_rent_per_unit");
    const vacancy = g("multifamily_addons", "vacancy_rate");
    if (units) typeMetrics.push({ label: "Units", value: fmtNum(units) });
    if (avgRent) typeMetrics.push({ label: "Avg Rent / Unit", value: fmtMoney(avgRent) });
    if (vacancy !== null && vacancy !== undefined) typeMetrics.push({ label: "Vacancy", value: fmtPct(vacancy) });
  } else if (analysisType === "industrial") {
    const clear = g("industrial_addons", "clear_height");
    const loading = g("industrial_addons", "loading_count");
    const office = g("industrial_addons", "office_finish_pct");
    if (clear) typeMetrics.push({ label: "Clear Height", value: `${fmtNum(clear)} ft` });
    if (loading) typeMetrics.push({ label: "Loading Doors", value: fmtNum(loading) });
    if (office !== null && office !== undefined) typeMetrics.push({ label: "Office Finish", value: fmtPct(office) });
  } else if (analysisType === "office") {
    const cls = g("office_addons", "building_class");
    const floors = g("office_addons", "floor_count");
    const parking = g("office_addons", "parking_ratio");
    if (cls) typeMetrics.push({ label: "Class", value: String(cls) });
    if (floors) typeMetrics.push({ label: "Floors", value: fmtNum(floors) });
    if (parking) typeMetrics.push({ label: "Parking Ratio", value: `${fmtNum(parking)} / 1,000 SF` });
  } else if (analysisType === "land") {
    const acres = g("land_addons", "lot_acres") || g("property_basics", "lot_acres");
    const zoning = g("land_addons", "zoning");
    const entitled = g("land_addons", "entitled");
    if (acres) typeMetrics.push({ label: "Acres", value: fmtNum(acres) });
    if (zoning) typeMetrics.push({ label: "Zoning", value: String(zoning) });
    if (entitled) typeMetrics.push({ label: "Entitled", value: String(entitled) });
  }

  const dealScoreNum = typeof dealScore === "number" ? Math.round(dealScore) : null;
  const gradeStr = (grade || "").toUpperCase();
  const gc = gradeColor(gradeStr);

  // ── Build HTML ──────────────────────────────────────────────────────

  const metricsHtml = metrics.map(m => `
    <td align="center" valign="top" style="padding: 14px 10px; border-right: 1px solid #E5E7EB; font-family: Arial, sans-serif;">
      <div style="font-size: 11px; color: #6B7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">${esc(m.label)}</div>
      <div style="font-size: 18px; color: #111827; font-weight: 700;">${esc(m.value)}</div>
    </td>
  `).join("");

  const typeMetricsHtml = typeMetrics.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 8px; background: ${lensColor}0A; border: 1px solid ${lensColor}33; border-radius: 8px;">
      <tr>
        ${typeMetrics.map((m, i) => `
          <td align="center" valign="top" style="padding: 12px 10px; ${i < typeMetrics.length - 1 ? `border-right: 1px solid ${lensColor}22;` : ""} font-family: Arial, sans-serif;">
            <div style="font-size: 10px; color: ${lensColor}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">${esc(m.label)}</div>
            <div style="font-size: 15px; color: #111827; font-weight: 600;">${esc(m.value)}</div>
          </td>
        `).join("")}
      </tr>
    </table>
  ` : "";

  const scoreHtml = dealScoreNum !== null ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
      <tr>
        <td style="padding: 20px; background: linear-gradient(135deg, ${gc}12, ${gc}06); border: 2px solid ${gc}44; border-radius: 12px; font-family: Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" style="width: 40%;">
                <div style="font-size: 12px; color: #6B7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">Deal Score</div>
                <div style="font-size: 44px; color: ${gc}; font-weight: 800; line-height: 1;">${dealScoreNum}</div>
              </td>
              <td valign="middle" align="right" style="width: 60%;">
                ${gradeStr ? `<div style="display: inline-block; padding: 10px 22px; background: ${gc}; color: #FFFFFF; border-radius: 10px; font-size: 26px; font-weight: 800; letter-spacing: 0.02em;">${esc(gradeStr)}</div>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  ` : "";

  const lensBannerHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
      <tr>
        <td style="padding: 10px 16px; background: ${lensColor}14; border-left: 4px solid ${lensColor}; border-radius: 6px; font-family: Arial, sans-serif;">
          <span style="font-size: 14px; margin-right: 8px;">${lensIcon}</span>
          <span style="font-size: 12px; color: ${lensColor}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;">Scored with ${esc(lensLabel)} model</span>
        </td>
      </tr>
    </table>
  `;

  const noteHtml = note && note.trim() ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
      <tr>
        <td style="padding: 16px 20px; background: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 6px; font-family: Arial, sans-serif;">
          <div style="font-size: 11px; color: #92400E; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;">Message from ${esc(senderName || senderEmail || "sender")}</div>
          <div style="font-size: 14px; color: #1F2937; line-height: 1.55; white-space: pre-wrap;">${esc(note)}</div>
        </td>
      </tr>
    </table>
  ` : "";

  // Brief body is plain text that may contain paragraph breaks on double-newlines.
  const briefHtml = brief ? (() => {
    const paras = String(brief).split(/\n\s*\n/).filter(p => p.trim());
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 8px;">
        <tr><td style="font-family: Arial, sans-serif;">
          <h2 style="font-size: 18px; color: #111827; font-weight: 700; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #E5E7EB;">First Pass Brief</h2>
          ${paras.map(p => `<p style="font-size: 14px; color: #374151; line-height: 1.65; margin: 0 0 12px;">${esc(p)}</p>`).join("")}
        </td></tr>
      </table>
    `;
  })() : "";

  const attachmentsCallout = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 8px;">
      <tr>
        <td style="padding: 16px 20px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; font-family: Arial, sans-serif;">
          <div style="font-size: 13px; color: #166534; font-weight: 700; margin-bottom: 6px;">📎 Attached: Full deal package</div>
          <div style="font-size: 13px; color: #14532D; line-height: 1.55;">This email includes the <strong>Underwriting Workbook</strong> (XLSX scenario model with all extracted fields, sensitivity, and scoring) and the <strong>First Pass Brief</strong> (DOC) for offline review.</div>
        </td>
      </tr>
    </table>
  `;

  const senderLine = senderName || senderEmail ? `
    <p style="font-size: 12px; color: #6B7280; font-family: Arial, sans-serif; margin: 16px 0 4px;">
      Shared by ${esc(senderName || senderEmail)}${senderName && senderEmail ? ` (${esc(senderEmail)})` : ""} via Deal Signals.
    </p>
  ` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(propertyName)}</title>
</head>
<body style="margin: 0; padding: 0; background: #F3F4F6; font-family: Arial, Helvetica, sans-serif; color: #111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #F3F4F6; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="max-width: 620px; background: #FFFFFF; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden;">
          <!-- Brand header -->
          <tr>
            <td style="padding: 18px 24px; background: #06080F; color: #FFFFFF; font-family: Arial, sans-serif;">
              <div style="font-size: 16px; font-weight: 800; letter-spacing: 0.02em;">Deal Signals</div>
              <div style="font-size: 11px; color: #9CA3AF; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px;">Commercial Real Estate Deal Analysis</div>
            </td>
          </tr>

          <!-- Property header -->
          <tr>
            <td style="padding: 24px 24px 8px; font-family: Arial, sans-serif;">
              <h1 style="font-size: 24px; color: #111827; font-weight: 800; margin: 0 0 6px;">${esc(propertyName)}</h1>
              ${loc ? `<div style="font-size: 14px; color: #6B7280;">${esc(loc)}</div>` : ""}
            </td>
          </tr>

          <!-- Model Lens banner -->
          <tr><td style="padding: 0 24px;">${lensBannerHtml}</td></tr>

          <!-- Personal note -->
          ${noteHtml ? `<tr><td style="padding: 0 24px;">${noteHtml}</td></tr>` : ""}

          <!-- Deal Score -->
          <tr><td style="padding: 0 24px;">${scoreHtml}</td></tr>

          <!-- Headline metrics strip -->
          <tr>
            <td style="padding: 0 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 10px;">
                <tr>${metricsHtml}</tr>
              </table>
              ${typeMetricsHtml}
            </td>
          </tr>

          <!-- Brief -->
          ${briefHtml ? `<tr><td style="padding: 0 24px;">${briefHtml}</td></tr>` : ""}

          <!-- Attachments callout -->
          <tr><td style="padding: 0 24px;">${attachmentsCallout}</td></tr>

          <!-- Sender line + footer -->
          <tr>
            <td style="padding: 8px 24px 24px;">
              ${senderLine}
              <p style="font-size: 11px; color: #9CA3AF; font-family: Arial, sans-serif; margin: 12px 0 0;">
                Deal Signals is a commercial real estate deal analysis tool. Visit <a href="https://dealsignals.app" style="color: #2563EB; text-decoration: none;">dealsignals.app</a> to learn more.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
