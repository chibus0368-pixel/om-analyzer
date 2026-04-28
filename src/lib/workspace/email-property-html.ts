/**
 * Email HTML for "Email this property" feature.
 * Renders a formatted property page as an HTML email body,
 * using table-based layout and inline styles for broad client compatibility.
 *
 * This is NOT meant to be a pixel-perfect clone of PropertyDetailClient — it's
 * a high-fidelity digest: hero photo, header, lens badge, Deal Score,
 * key metrics, brief (parsed JSON with strengths/concerns), and a callout
 * pointing at the attached Workbook + Brief.
 */

import type { ExtractedField, AnalysisType } from "./types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "./types";
import { analysisTypeIconSVG } from "./AnalysisTypeIcon";
import type { QuickScreenReport } from "@/lib/analysis/quick-screen";

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

// Score-band-to-color mapping. Canonical bands come from score-engine
// (`strong_buy`, `buy`, `hold`, `pass`, `strong_reject`). Letter-grade
// inputs (A/B/C/D/F) are still accepted for backward compat with any
// older callers, mapped to the equivalent band color.
function gradeColor(grade: string): string {
  switch ((grade || "").toLowerCase()) {
    case "strong_buy":     case "a": return "#059669"; // green
    case "buy":            case "b": return "#2563EB"; // blue
    case "hold": case "neutral": case "c": return "#D97706"; // amber
    case "pass":           case "d": return "#EA580C"; // orange
    case "strong_reject": case "reject": case "f": return "#DC2626"; // red
    default: return "#6B7280"; // gray (no score)
  }
}

// Display label - matches the dashboard / map legend / share view exactly.
// "hold" is shown as "Neutral", "strong_reject" as "Reject", etc.
// Using uppercase for the verdict pill to keep the bold callout style.
function gradeLabel(grade: string): string {
  switch ((grade || "").toLowerCase()) {
    case "strong_buy":     case "a": return "STRONG BUY";
    case "buy":            case "b": return "BUY";
    case "hold": case "neutral": case "c": return "NEUTRAL";
    case "pass":           case "d": return "PASS";
    case "strong_reject": case "reject": case "f": return "REJECT";
    default: return "";
  }
}

/**
 * Brief may come in as:
 *   - JSON string: { overview, strengths[], concerns[] }
 *   - Plain text with paragraphs
 *   - Empty
 * Returns a normalized shape we can render cleanly.
 */
function parseBrief(brief?: string): {
  overview: string;
  strengths: string[];
  concerns: string[];
  fallbackParas: string[];
} {
  const out = { overview: "", strengths: [] as string[], concerns: [] as string[], fallbackParas: [] as string[] };
  if (!brief || !brief.trim()) return out;
  // Try JSON first
  try {
    const j = JSON.parse(brief);
    if (j && typeof j === "object") {
      if (typeof j.overview === "string") out.overview = j.overview.trim();
      if (Array.isArray(j.strengths)) out.strengths = j.strengths.map((s: any) => String(s).trim()).filter(Boolean);
      if (Array.isArray(j.concerns))  out.concerns  = j.concerns.map((s: any) => String(s).trim()).filter(Boolean);
      if (out.overview || out.strengths.length || out.concerns.length) return out;
    }
  } catch { /* not JSON, fall through */ }
  // Plain text fallback
  out.fallbackParas = String(brief).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return out;
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
  heroImageUrl?: string;
  propertyUrl?: string;
  /**
   * Optional QuickScreenReport — when passed, the email mirrors the Pro
   * property page's Back-of-Napkin scenarios and Ways It Works / Dies
   * sections. Without it, the template falls back to the brief JSON.
   */
  quickScreen?: QuickScreenReport | null;
}

export function renderPropertyEmailHTML(args: RenderArgs): string {
  const {
    propertyName, address, city, state, analysisType,
    dealScore, grade, fields, brief, senderName, senderEmail, note,
    heroImageUrl, propertyUrl, quickScreen,
  } = args;

  const lensColor = ANALYSIS_TYPE_COLORS[analysisType] || "#6B7280";
  const lensLabel = ANALYSIS_TYPE_LABELS[analysisType] || "Retail";
  const lensIconSvg = analysisTypeIconSVG(analysisType, 14, lensColor);

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
  const verdict = gradeLabel(gradeStr);

  // ── Build HTML ──────────────────────────────────────────────────────

  // Hero photo — if we have a URL, use it. Otherwise use a subtle branded gradient.
  const heroHtml = heroImageUrl
    ? `
      <tr>
        <td style="padding: 0; line-height: 0; font-size: 0;">
          <img src="${esc(heroImageUrl)}" alt="${esc(propertyName)}" width="620" style="display: block; width: 100%; max-width: 620px; height: auto; object-fit: cover;" />
        </td>
      </tr>
    `
    : `
      <tr>
        <td style="padding: 0; line-height: 0; font-size: 0;">
          <div style="width: 100%; height: 8px; background: linear-gradient(90deg, ${lensColor} 0%, #4D7C0F 100%);">&nbsp;</div>
        </td>
      </tr>
    `;

  const metricsHtml = metrics.map((m, i) => `
    <td align="center" valign="top" style="padding: 16px 8px; ${i < metrics.length - 1 ? "border-right: 1px solid #E5E7EB;" : ""} font-family: Arial, sans-serif;">
      <div style="font-size: 10px; color: #6B7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">${esc(m.label)}</div>
      <div style="font-size: 17px; color: #0F172A; font-weight: 700; line-height: 1.1;">${esc(m.value)}</div>
    </td>
  `).join("");

  const typeMetricsHtml = typeMetrics.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 10px; background: ${lensColor}0F; border: 1px solid ${lensColor}33; border-radius: 10px;">
      <tr>
        ${typeMetrics.map((m, i) => `
          <td align="center" valign="top" style="padding: 14px 10px; ${i < typeMetrics.length - 1 ? `border-right: 1px solid ${lensColor}33;` : ""} font-family: Arial, sans-serif;">
            <div style="font-size: 10px; color: ${lensColor}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px;">${esc(m.label)}</div>
            <div style="font-size: 15px; color: #0F172A; font-weight: 700;">${esc(m.value)}</div>
          </td>
        `).join("")}
      </tr>
    </table>
  ` : "";

  const scoreHtml = dealScoreNum !== null ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 22px 0 18px;">
      <tr>
        <td style="padding: 22px 24px; background: linear-gradient(135deg, ${gc}14 0%, ${gc}05 100%); border: 1px solid ${gc}44; border-radius: 14px; font-family: Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" align="left">
                <div style="font-size: 11px; color: #6B7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;">Deal Score</div>
                <div style="font-size: 48px; color: ${gc}; font-weight: 800; line-height: 1; letter-spacing: -0.02em;">${dealScoreNum}<span style="font-size: 20px; color: #9CA3AF; font-weight: 600;"> / 100</span></div>
              </td>
              <td valign="middle" align="right">
                ${verdict ? `<div style="display: inline-block; padding: 10px 18px; background: ${gc}; color: #FFFFFF; border-radius: 999px; font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;">${esc(verdict)}</div>` : ""}
                ${/^[A-F]$/.test(gradeStr) ? `<div style="margin-top: 8px; font-size: 11px; color: #6B7280; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;">Grade <span style="color: ${gc}; font-weight: 800;">${esc(gradeStr)}</span></div>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  ` : "";

  const lensBannerHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 18px 0 14px;">
      <tr>
        <td style="padding: 10px 16px; background: ${lensColor}12; border-left: 3px solid ${lensColor}; border-radius: 6px; font-family: Arial, sans-serif;">
          <span style="vertical-align: middle; margin-right: 8px;">${lensIconSvg}</span>
          <span style="vertical-align: middle; font-size: 11px; color: ${lensColor}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">Scored with ${esc(lensLabel)} model</span>
        </td>
      </tr>
    </table>
  `;

  const noteHtml = note && note.trim() ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 18px 0;">
      <tr>
        <td style="padding: 16px 20px; background: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 8px; font-family: Arial, sans-serif;">
          <div style="font-size: 11px; color: #92400E; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Note from ${esc(senderName || senderEmail || "sender")}</div>
          <div style="font-size: 14px; color: #1F2937; line-height: 1.6; white-space: pre-wrap;">${esc(note)}</div>
        </td>
      </tr>
    </table>
  ` : "";

  // Scenarios block — 3-card grid of Bear / Base / Bull mirroring the Pro
  // page's "Back-of-Napkin Returns" section. Renders only when we have a
  // QuickScreenReport to pull from; otherwise the block is skipped entirely.
  const scenariosHtml = quickScreen && quickScreen.scenarios && quickScreen.scenarios.length ? (() => {
    const order = ["Bear", "Base", "Bull"];
    const sorted = [...quickScreen.scenarios].sort(
      (a, b) => order.indexOf(a.label) - order.indexOf(b.label),
    );
    const cardWidth = Math.floor(100 / Math.max(sorted.length, 1));
    const cards = sorted.map((sc) => {
      const isBull = sc.label === "Bull";
      const isBase = sc.label === "Base";
      const color = isBull ? "#4D7C0F" : isBase ? "#2563EB" : "#DC2626";
      const bg = isBull ? "#F7FEE7" : isBase ? "#EFF6FF" : "#FEF2F2";
      const levered = sc.leveredIrrPct != null ? `${sc.leveredIrrPct.toFixed(1)}%` : "--";
      const unlevered = sc.unleveredIrrPct != null ? `${sc.unleveredIrrPct.toFixed(1)}%` : "--";
      const em = sc.equityMultiple != null ? `${sc.equityMultiple.toFixed(2)}x` : "--";
      const rentSign = sc.rentGrowthPct > 0 ? "+" : "";
      const exitSign = sc.exitCapBps > 0 ? "+" : "";
      return `
        <td valign="top" width="${cardWidth}%" style="padding: 6px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background: ${bg}; border: 1px solid ${color}33; border-radius: 10px;">
            <tr>
              <td style="padding: 14px 16px; font-family: Arial, sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                  <tr>
                    <td align="left" style="font-size: 11px; font-weight: 800; color: ${color}; letter-spacing: 0.08em; text-transform: uppercase;">${esc(sc.label)}</td>
                    <td align="right" style="font-size: 10px; color: #6B7280;">annual rent increases ${rentSign}${sc.rentGrowthPct}%, exit cap ${exitSign}${sc.exitCapBps}bps</td>
                  </tr>
                </table>
                <div style="font-size: 24px; font-weight: 800; color: #0F172A; line-height: 1.1;">${esc(levered)}</div>
                <div style="font-size: 10px; color: #6B7280; margin-top: 2px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">Levered IRR</div>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 10px;">
                  <tr>
                    <td style="font-size: 11px; color: #6B7280; padding: 2px 0;">Equity multiple</td>
                    <td align="right" style="font-size: 11px; color: #0F172A; font-weight: 700; padding: 2px 0;">${esc(em)}</td>
                  </tr>
                  <tr>
                    <td style="font-size: 11px; color: #6B7280; padding: 2px 0;">Unlevered IRR</td>
                    <td align="right" style="font-size: 11px; color: #0F172A; font-weight: 600; padding: 2px 0;">${esc(unlevered)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      `;
    }).join("");

    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 22px 0 6px;">
        <tr><td style="font-family: Arial, sans-serif;">
          <div style="font-size: 11px; color: #9CA3AF; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">Back-of-Napkin Returns</div>
          <h2 style="font-size: 18px; color: #0F172A; font-weight: 800; margin: 0 0 4px; letter-spacing: -0.01em;">Three scenarios</h2>
          <div style="font-size: 12px; color: #6B7280; margin-bottom: 14px;">Ranges, not point estimates. Meant for triage, not underwriting.</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: separate; border-spacing: 0;">
            <tr>${cards}</tr>
          </table>
        </td></tr>
      </table>
    `;
  })() : "";

  // Parse brief (supports JSON and plain-text fallback)
  const parsed = parseBrief(brief);
  // Prefer the QuickScreen's waysItWorks / waysItDies when available, so the
  // email reads like the Pro page rather than the narrative Brief doc.
  const qsWorks = (quickScreen?.waysItWorks || []).filter(Boolean);
  const qsDies = (quickScreen?.waysItDies || []).filter(Boolean);
  const strengths = qsWorks.length ? qsWorks : parsed.strengths;
  const concerns = qsDies.length ? qsDies : parsed.concerns;
  const executiveSummary = (quickScreen?.executiveSummary || "").trim() || parsed.overview;
  const hasBrief =
    executiveSummary || strengths.length || concerns.length || parsed.fallbackParas.length;

  const briefHtml = hasBrief ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 26px 0 8px;">
      <tr><td style="font-family: Arial, sans-serif;">
        <div style="font-size: 11px; color: #9CA3AF; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">Deal Summary</div>
        <h2 style="font-size: 20px; color: #0F172A; font-weight: 800; margin: 0 0 14px; letter-spacing: -0.01em;">Analyst Read</h2>

        ${executiveSummary ? `
          <p style="font-size: 14px; color: #374151; line-height: 1.7; margin: 0 0 16px;">${esc(executiveSummary)}</p>
        ` : ""}

        ${!executiveSummary && parsed.fallbackParas.length ? parsed.fallbackParas.map(p =>
          `<p style="font-size: 14px; color: #374151; line-height: 1.7; margin: 0 0 12px;">${esc(p)}</p>`
        ).join("") : ""}

        ${strengths.length ? `
          <div style="margin-top: 18px; padding: 14px 16px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px;">
            <div style="font-size: 11px; color: #15803D; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Three Ways This Deal Works</div>
            <table cellpadding="0" cellspacing="0" style="width: 100%;">
              ${strengths.map(s => `
                <tr>
                  <td valign="top" style="width: 18px; padding: 2px 8px 8px 0; color: #16A34A; font-weight: 800; font-size: 14px;">&#10003;</td>
                  <td valign="top" style="padding: 2px 0 8px 0; font-size: 13.5px; color: #14532D; line-height: 1.55;">${esc(s)}</td>
                </tr>
              `).join("")}
            </table>
          </div>
        ` : ""}

        ${concerns.length ? `
          <div style="margin-top: 12px; padding: 14px 16px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px;">
            <div style="font-size: 11px; color: #B91C1C; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Three Ways This Deal Dies</div>
            <table cellpadding="0" cellspacing="0" style="width: 100%;">
              ${concerns.map(c => `
                <tr>
                  <td valign="top" style="width: 18px; padding: 2px 8px 8px 0; color: #DC2626; font-weight: 800; font-size: 14px;">&#9888;</td>
                  <td valign="top" style="padding: 2px 0 8px 0; font-size: 13.5px; color: #7F1D1D; line-height: 1.55;">${esc(c)}</td>
                </tr>
              `).join("")}
            </table>
          </div>
        ` : ""}
      </td></tr>
    </table>
  ` : "";

  const attachmentsCallout = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 22px 0 8px;">
      <tr>
        <td style="padding: 16px 20px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; font-family: Arial, sans-serif;">
          <div style="font-size: 12px; color: #0F172A; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Attached to this email</div>
          <table cellpadding="0" cellspacing="0" style="width: 100%; margin-top: 6px;">
            <tr>
              <td valign="top" style="padding: 4px 0;">
                <span style="display: inline-block; padding: 3px 8px; background: #DCFCE7; color: #166534; font-size: 11px; font-weight: 800; border-radius: 4px; letter-spacing: 0.04em; margin-right: 8px;">XLSX</span>
                <span style="font-size: 13px; color: #1F2937; font-weight: 600;">Underwriting Workbook</span>
                <span style="font-size: 12px; color: #6B7280;"> &mdash; scenario model, sensitivity, and scoring</span>
              </td>
            </tr>
            <tr>
              <td valign="top" style="padding: 4px 0;">
                <span style="display: inline-block; padding: 3px 8px; background: #DBEAFE; color: #1E40AF; font-size: 11px; font-weight: 800; border-radius: 4px; letter-spacing: 0.04em; margin-right: 8px;">DOC</span>
                <span style="font-size: 13px; color: #1F2937; font-weight: 600;">First Pass Brief</span>
                <span style="font-size: 12px; color: #6B7280;"> &mdash; narrative memo for offline review</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const ctaHtml = propertyUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 18px 0 4px;">
      <tr>
        <td align="center">
          <a href="${esc(propertyUrl)}" style="display: inline-block; padding: 12px 26px; background: #0F172A; color: #FFFFFF; text-decoration: none; border-radius: 999px; font-size: 13px; font-weight: 700; font-family: Arial, sans-serif; letter-spacing: 0.02em;">Open in Deal Signals &rarr;</a>
        </td>
      </tr>
    </table>
  ` : "";

  const senderLine = senderName || senderEmail ? `
    <p style="font-size: 12px; color: #6B7280; font-family: Arial, sans-serif; margin: 16px 0 4px; line-height: 1.5;">
      Shared by <strong style="color: #374151;">${esc(senderName || senderEmail)}</strong>${senderName && senderEmail ? ` <span style="color: #9CA3AF;">&middot; ${esc(senderEmail)}</span>` : ""}
    </p>
  ` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(propertyName)}</title>
</head>
<body style="margin: 0; padding: 0; background: #F3F4F6; font-family: Arial, Helvetica, sans-serif; color: #0F172A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #F3F4F6; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="max-width: 620px; width: 100%; background: #FFFFFF; border-radius: 14px; box-shadow: 0 2px 10px rgba(15,23,42,0.06); overflow: hidden;">
          <!-- Brand header -->
          <tr>
            <td style="padding: 16px 24px; background: #06080F; color: #FFFFFF; font-family: Arial, sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" valign="middle">
                    <img src="https://dealsignals.app/images/dealsignals-full-logo4.png" alt="DealSignals" height="28" style="height: 28px; display: block; border: 0; outline: none; text-decoration: none;" />
                  </td>
                  <td align="right" valign="middle">
                    <span style="font-size: 10px; color: #9CA3AF; letter-spacing: 0.1em; text-transform: uppercase;">CRE Deal Analysis</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero photo -->
          ${heroHtml}

          <!-- Property header -->
          <tr>
            <td style="padding: 22px 24px 0; font-family: Arial, sans-serif;">
              <h1 style="font-size: 24px; color: #0F172A; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.01em; line-height: 1.25;">${esc(propertyName)}</h1>
              ${loc ? `<div style="font-size: 13px; color: #6B7280; font-weight: 500;">${esc(loc)}</div>` : ""}
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
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 12px;">
                <tr>${metricsHtml}</tr>
              </table>
              ${typeMetricsHtml}
            </td>
          </tr>

          <!-- Back-of-Napkin scenarios (Pro page parity) -->
          ${scenariosHtml ? `<tr><td style="padding: 0 24px;">${scenariosHtml}</td></tr>` : ""}

          <!-- Brief -->
          ${briefHtml ? `<tr><td style="padding: 0 24px;">${briefHtml}</td></tr>` : ""}

          <!-- Attachments callout -->
          <tr><td style="padding: 0 24px;">${attachmentsCallout}</td></tr>

          <!-- CTA -->
          ${ctaHtml ? `<tr><td style="padding: 0 24px;">${ctaHtml}</td></tr>` : ""}

          <!-- Sender line + footer -->
          <tr>
            <td style="padding: 8px 24px 24px;">
              ${senderLine}
              <p style="font-size: 11px; color: #9CA3AF; font-family: Arial, sans-serif; margin: 14px 0 0; line-height: 1.55; border-top: 1px solid #F1F5F9; padding-top: 12px;">
                DealSignals is a commercial real estate deal analysis tool. Visit <a href="https://dealsignals.app" style="color: #2563EB; text-decoration: none;">dealsignals.app</a> to learn more.
              </p>
              <p style="font-size: 10.5px; color: #9CA3AF; font-family: Arial, sans-serif; font-style: italic; margin: 10px 0 0; line-height: 1.55;">
                DealSignals output is automated general guidance, not investment, legal, tax, or financial advice. Every deal demands your own full due diligence and independent professional review before you commit capital. Figures are derived from uploaded documents and public data sources that may be incomplete or inaccurate. Verify all material facts directly.
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
