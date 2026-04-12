"use client";

import { useState } from "react";
import Link from "next/link";

/* ===== DESIGN.md Tokens ===== */
const C = {
  primary: "#84CC16",
  primaryGradient: "#84CC16",
  onSurface: "#151b2b",
  secondary: "#585e70",
  tertiary: "#C49A3C",
  bg: "#faf8ff",
  surfLow: "#f2f3ff",
  surfLowest: "#ffffff",
  ghost: "rgba(227, 190, 189, 0.15)",
  shadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
  radius: 6,
};

/* ===== Inline Diagram Components ===== */

function UploadFlowDiagram() {
  const steps = [
    { icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12", label: "Upload", desc: "PDF, XLSX, DOCX, CSV" },
    { icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Extract", desc: "Text & image parsing" },
    { icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", label: "AI Analysis", desc: "GPT-4o 3-stage pipeline" },
    { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", label: "Score", desc: "0–100 investment score" },
    { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", label: "Output", desc: "Proforma, brief, scorecard" },
  ];
  return (
    <div className="hp-diagram" style={{ display: "flex", alignItems: "center", gap: 0, padding: "20px 0", overflowX: "auto" }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center" }}>
          <div style={{ textAlign: "center", minWidth: 100 }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: "rgba(132, 204, 22, 0.08)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.onSurface }}>{s.label}</div>
            <div style={{ fontSize: 10, color: C.secondary, marginTop: 2 }}>{s.desc}</div>
          </div>
          {i < steps.length - 1 && (
            <svg width="32" height="16" viewBox="0 0 32 16" style={{ flexShrink: 0, margin: "0 4px" }}>
              <path d="M2 8h24M22 4l4 4-4 4" fill="none" stroke={C.ghost.replace("0.15", "0.5")} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

function ScoreBandDiagram() {
  const bands = [
    { label: "Strong Buy", range: "85–100", color: "#059669", bg: "#D1FAE5" },
    { label: "Buy", range: "70–84", color: "#2563EB", bg: "#DBEAFE" },
    { label: "Neutral", range: "50–69", color: C.tertiary, bg: "#FFF9EE" },
    { label: "Pass", range: "30–49", color: "#EA580C", bg: "#FFF1E6" },
    { label: "Reject", range: "0–29", color: C.primary, bg: "#FEE2E2" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, padding: "12px 0", flexWrap: "wrap" }}>
      {bands.map(b => (
        <div key={b.label} style={{
          padding: "10px 16px", borderRadius: C.radius, background: b.bg,
          border: `1px solid ${b.color}22`, minWidth: 90, textAlign: "center",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: b.color }}>{b.label}</div>
          <div style={{ fontSize: 11, color: C.secondary, marginTop: 2 }}>{b.range}</div>
        </div>
      ))}
    </div>
  );
}

function ScoringWeightsDiagram() {
  const weights = [
    { label: "Pricing", pct: 15 },
    { label: "Cash Flow", pct: 15 },
    { label: "Tenant Quality", pct: 12 },
    { label: "Upside Potential", pct: 10 },
    { label: "Lease Rollover", pct: 10 },
    { label: "Location", pct: 10 },
    { label: "Vacancy", pct: 8 },
    { label: "Physical Condition", pct: 8 },
    { label: "Data Confidence", pct: 7 },
    { label: "Redevelopment", pct: 5 },
  ];
  return (
    <div style={{ padding: "12px 0" }}>
      {weights.map(w => (
        <div key={w.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: C.secondary, width: 120, textAlign: "right", flexShrink: 0 }}>{w.label}</span>
          <div style={{ flex: 1, height: 14, background: C.surfLow, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${w.pct}%`, height: "100%", background: C.primaryGradient, borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.onSurface, width: 32, flexShrink: 0 }}>{w.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function FileTypeBadges() {
  const types = [
    { ext: "PDF", best: true, desc: "Offering Memorandums, flyers, brochures" },
    { ext: "XLSX / XLS", best: true, desc: "Rent rolls, T-12s, proformas" },
    { ext: "DOCX", best: false, desc: "Broker packages, lease abstracts" },
    { ext: "CSV", best: false, desc: "Rent rolls, financial data exports" },
    { ext: "TXT", best: false, desc: "Plain text documents" },
    { ext: "PNG / JPG", best: false, desc: "Property photos, site plans" },
  ];
  return (
    <div className="hp-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, padding: "12px 0" }}>
      {types.map(t => (
        <div key={t.ext} style={{
          padding: "10px 14px", borderRadius: C.radius, background: C.surfLowest,
          border: `1px solid ${C.ghost}`, display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: t.best ? C.primary : C.surfLow,
            color: t.best ? "#fff" : C.secondary,
          }}>{t.ext}</span>
          <span style={{ fontSize: 11, color: C.secondary }}>{t.desc}</span>
        </div>
      ))}
    </div>
  );
}

function WorkspaceTypesDiagram() {
  const types = [
    { label: "Retail", icon: "🏪", desc: "NNN retail, strip centers, shopping centers" },
    { label: "Industrial", icon: "🏭", desc: "Warehouses, distribution, manufacturing" },
    { label: "Office", icon: "🏢", desc: "Office buildings, medical office, flex" },
    { label: "Land", icon: "🌎", desc: "Vacant land, development sites, entitled" },
  ];
  return (
    <div className="hp-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, padding: "12px 0" }}>
      {types.map(t => (
        <div key={t.label} style={{
          padding: "14px 16px", borderRadius: C.radius, background: C.surfLowest,
          boxShadow: C.shadow, textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>{t.icon}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.onSurface }}>{t.label}</div>
          <div style={{ fontSize: 11, color: C.secondary, marginTop: 4 }}>{t.desc}</div>
        </div>
      ))}
    </div>
  );
}

function KeyboardShortcutTable() {
  const shortcuts = [
    { key: "Click property card", action: "Open property detail page" },
    { key: "Drag & drop files", action: "Upload to current DealBoard" },
    { key: "Click score ring", action: "View scoring breakdown" },
    { key: "Click map marker", action: "View property popup with metrics" },
    { key: "Select up to 5 deals", action: "Side-by-side comparison" },
  ];
  return (
    <div style={{ padding: "8px 0" }}>
      {shortcuts.map((s, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
          borderBottom: i < shortcuts.length - 1 ? `1px solid ${C.ghost}` : "none",
        }}>
          <span style={{
            padding: "4px 10px", background: C.surfLow, borderRadius: 4,
            fontSize: 11, fontWeight: 600, color: C.onSurface, whiteSpace: "nowrap",
          }}>{s.key}</span>
          <span style={{ fontSize: 12, color: C.secondary }}>{s.action}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== Help Topics ===== */

interface HelpTopic {
  id: string;
  title: string;
  icon: string;
  content: React.ReactNode;
}

const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          Deal Signals is a CRE (Commercial Real Estate) first-pass deal review tool that pulls key numbers, calculates core metrics, and flags items that need review. Here's how to get started in under 5 minutes.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Quick Start Steps</h4>
        <div style={{ padding: "0 0 0 16px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.primary, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>1</span>
            <div><strong style={{ color: C.onSurface }}>Create a DealBoard</strong> — Click "DealBoards" in the bottom nav, then create a new dealboard. Choose your asset type (Retail, Industrial, Office, or Land) so scoring uses the right model.</div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.primary, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>2</span>
            <div><strong style={{ color: C.onSurface }}>Upload a Document</strong> — Go to "+ Add Property" and upload an Offering Memorandum (OM), property flyer, rent roll, or any CRE document. PDFs and Excel files give the best results.</div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.primary, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>3</span>
            <div><strong style={{ color: C.onSurface }}>Review Results</strong> — The AI automatically extracts property data, calculates financial metrics, generates an investment score, and creates output files. This takes about 30–60 seconds.</div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.primary, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>4</span>
            <div><strong style={{ color: C.onSurface }}>Compare & Decide</strong> — Use the Scoreboard to rank deals, the Map to visualize locations, and the Compare tool to put deals side by side.</div>
          </div>
        </div>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>How the AI Pipeline Works</h4>
        <UploadFlowDiagram />
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          When you upload a document, it goes through a 3-stage GPT-4o pipeline: (1) text extraction and classification, (2) structured field extraction (pricing, income, expenses, tenant data, lease terms), and (3) signal generation (recommendations, risk factors, upside potential). The entire process runs automatically.
        </p>
      </div>
    ),
  },
  {
    id: "uploading",
    title: "Uploading Deals",
    icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          Upload one property at a time for the best results. A single Offering Memorandum (OM) is enough for a full analysis — you can always add more documents later (rent rolls, T-12s, leases).
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Supported File Types</h4>
        <FileTypeBadges />
        <p style={{ fontSize: 12, color: C.secondary, fontStyle: "italic" }}>Red badges indicate file types that produce the best extraction results.</p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Single Upload</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Navigate to <strong>+ Add Property</strong> in the sidebar. Drag and drop your file or click "Select File from Local" to browse. The system automatically detects the document type (OM, flyer, rent roll, etc.) and assigns a category. After upload, AI analysis begins immediately — you'll see a progress indicator showing each stage.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Bulk Upload</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Have multiple deals to analyze? Use the <strong>Bulk Upload</strong> feature (linked from the bottom of the single upload page). Drop up to 10 OMs at once, and each will be created as a separate property with its own analysis. Great for quickly ingesting a pipeline of deals.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Adding More Documents to a Property</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Open any property's detail page and use the document upload section to add additional files. Common workflow: upload the OM first for initial analysis, then add the rent roll and T-12 for more accurate underwriting. The system will re-extract fields and update the analysis.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Property Type Detection</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          The AI automatically detects whether a document is for a retail, industrial, office, or land deal. If the detected type doesn't match your DealBoard type (e.g., uploading an industrial deal to a retail DealBoard), you'll see a mismatch warning with options to continue anyway or create a new DealBoard for that asset type.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Tips for Best Results</h4>
        <div style={{ background: C.surfLow, borderRadius: C.radius, padding: 16, fontSize: 13, color: C.secondary, lineHeight: 1.7 }}>
          <strong style={{ color: C.onSurface }}>Do:</strong> Upload complete OMs with financials, rent rolls with tenant data, and T-12 operating statements.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Avoid:</strong> Partial screenshots, low-resolution scans, or heavily redacted documents — the AI needs readable text to extract data.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Max file size:</strong> 50MB per file. For best performance, keep PDFs under 20MB.
        </div>
      </div>
    ),
  },
  {
    id: "dashboard",
    title: "DealBoard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          The Dashboard is your home screen — it shows all properties in your active DealBoard at a glance.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Property Cards</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Each property appears as a card with: the property name, hero image (auto-extracted from the first page of your PDF), city/state location, score ring showing the investment score (0–100), score band label (Strong Buy, Buy, Neutral, Pass, Reject), parse status, and document count. Click any card to open the full property detail page.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Score Ring</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          The colored circular gauge on each card shows the investment score at a glance. Green (85+) for Strong Buy, blue (70–84) for Buy, gold (50–69) for Neutral, orange (30–49) for Pass, and red (below 30) for Reject. The score updates automatically whenever you add documents or re-analyze.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Parse Status</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Each property shows its current analysis state: <strong>Uploaded</strong> (files received), <strong>Parsing</strong> (AI is extracting data), <strong>Parsed</strong> (analysis complete), <strong>Needs Review</strong> (some fields need verification), or <strong>Failed</strong> (extraction error — try re-uploading).
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>+ Add Property Button</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          In the upper right corner of the dashboard, click "+ Add Property" to upload a new deal. This takes you directly to the upload page for your active DealBoard.
        </p>
      </div>
    ),
  },
  {
    id: "scoring",
    title: "Investment Scoring",
    icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          Every property receives an AI-generated investment score from 0 to 100. The score evaluates pricing, cash flow, tenant quality, lease risk, location, physical condition, and more — weighted by importance.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Score Bands</h4>
        <ScoreBandDiagram />
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          The score band gives you an at-a-glance investment recommendation. Each band comes with a written recommendation explaining the AI's reasoning.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Scoring Categories (Retail)</h4>
        <ScoringWeightsDiagram />
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          For retail properties, the score is a weighted composite of 10 categories. The weights are designed to reflect how institutional investors evaluate NNN deals — pricing and cash flow carry the most weight, followed by tenant quality and lease rollover risk.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>How Each Category is Scored</h4>
        <div style={{ background: C.surfLow, borderRadius: C.radius, padding: 16, fontSize: 13, color: C.secondary, lineHeight: 1.8 }}>
          <strong style={{ color: C.onSurface }}>Pricing (15%):</strong> Evaluates cap rate, asking price, and price per SF. Higher cap rates and reasonable pricing score better.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Cash Flow (15%):</strong> Checks for NOI, effective gross income, total income, and total expenses. Complete financials score highest.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Tenant Quality (12%):</strong> Evaluates tenant name, credit rating (investment-grade tenants score highest), and guarantor information.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Upside Potential (10%):</strong> Identifies opportunities like below-market rents, occupancy upside, and high cap rates.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Lease Rollover (10%):</strong> Examines weighted average lease term (WALE) and renewal options. Longer terms reduce risk.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Location (10%):</strong> Verifies complete address data (city, state, zip). Properties with full location data score higher.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Vacancy (8%):</strong> Occupancy above 95% scores highest. Lower occupancy means more risk but potentially more upside.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Physical Condition (8%):</strong> Year built, building SF, parking, and renovation history. Newer or recently renovated properties score better.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Data Confidence (7%):</strong> How much of the extracted data has been confirmed or has high-confidence extraction. More confirmed data = higher confidence score.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Redevelopment (5%):</strong> Land acreage and zoning data availability. Relevant for value-add and repositioning plays.
        </div>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Asset-Specific Scoring</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Industrial, Office, and Land properties use specialized scoring models with different categories and weights. For example, Industrial properties are scored on Functionality, Utilities/Power, and Access/Frontage. Office properties include Occupancy Stability and Capital Exposure. Land properties evaluate Zoning/Entitlements and Environmental signals.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Missing Data Handling</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          If a document doesn't contain certain data points (e.g., no debt assumptions), the scoring system automatically redistributes weight to categories that do have data. This ensures properties aren't unfairly penalized for missing information — but having more complete data always leads to a more reliable score.
        </p>
      </div>
    ),
  },
  {
    id: "scoreboard",
    title: "Scoreboard",
    icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          The Scoreboard provides a detailed metrics breakdown for all properties in your DealBoard, organized into financial categories.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Metrics Categories</h4>
        <div style={{ background: C.surfLow, borderRadius: C.radius, padding: 16, fontSize: 13, color: C.secondary, lineHeight: 1.8 }}>
          <strong style={{ color: C.onSurface }}>Property Info:</strong> Address, Asset Type, Year Built, GLA (gross leasable area), Number of Tenants, Occupancy %, Lease Type
          <br /><br />
          <strong style={{ color: C.onSurface }}>Pricing & Returns:</strong> Asking Price, Price/SF, In-Place Rent, In-Place NOI, Adjusted NOI, Entry Cap Rate
          <br /><br />
          <strong style={{ color: C.onSurface }}>Debt & Coverage:</strong> Debt Service, DSCR (Debt Service Coverage Ratio), DSCR Adjusted, Debt Yield, Cash-on-Cash Return, Breakeven Occupancy
          <br /><br />
          <strong style={{ color: C.onSurface }}>Tenant & Risk:</strong> Anchor Tenant, WALE (Weighted Average Lease Expiration), Average Rent/SF, Traffic Count
          <br /><br />
          <strong style={{ color: C.onSurface }}>Signals:</strong> AI-generated Value-Add Potential assessment and Overall Recommendation
        </div>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Reading the Scoreboard</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Each metric is formatted automatically: dollar amounts show $ signs, percentages show %, and ratios display as decimals. Fields that couldn't be extracted appear as blank — this usually means the source document didn't contain that data point.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Threshold Coloring</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Some metrics use color coding to highlight risk: cap rates below 5% appear in red (compressed pricing), DSCR below 1.25x appears in red (tight coverage), and occupancy below 85% appears in orange. These thresholds reflect standard institutional underwriting criteria.
        </p>
      </div>
    ),
  },
  {
    id: "property-detail",
    title: "Deal Detail Page",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          The property detail page is where you see everything about a single deal — documents, extracted data, outputs, notes, and scoring.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Documents Section</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          View all uploaded documents for this property. Each document shows its category (OM, Flyer, Rent Roll, T-12, Lease, etc.), file type, and upload date. You can upload additional documents directly from this page — click the upload area and the new file will be attached to this property.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Extracted Fields</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          After AI analysis, all extracted data appears in organized field groups (Property Basics, Pricing, Income, Expenses, Tenant Info, Debt Assumptions, Returns, Rent Roll, Lease Data, Signals). Each field shows the extracted value and a confidence indicator. You can override any field by clicking on it — your overrides are saved and used for scoring instead of the AI-extracted value.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Outputs</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          The system generates two output files automatically: a <strong>Proforma XLSX</strong> (spreadsheet with financial projections) and an <strong>Underwriting Brief</strong> (narrative summary with AI signals). Both are downloadable from the property page. You can also re-generate outputs after updating fields.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Notes</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Add private notes to any property — useful for recording your own observations, questions for the broker, or due diligence action items. Notes are timestamped and tied to the property.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Re-Analyze</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          If you add new documents or want to refresh the analysis, use the "Re-analyze" button. This re-runs the AI pipeline on all documents attached to the property, re-extracts fields, and recalculates the score.
        </p>
      </div>
    ),
  },
  {
    id: "map",
    title: "Map View",
    icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          The Map view plots all your properties on an interactive map using address data extracted from your documents.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>How Properties Are Plotted</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          The system uses the extracted address (street, city, state) to geocode each property. Properties with complete address data appear as markers on the map. If only a city and state are available, the property will be plotted at the city center. Properties without any location data won't appear on the map.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Map Interactions</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Click any marker to see a popup with the property name, key metrics (price, cap rate, NOI), and a link to the property detail page. Zoom and pan to explore your portfolio geographically. The map automatically fits to show all your properties.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Use Cases</h4>
        <div style={{ background: C.surfLow, borderRadius: C.radius, padding: 16, fontSize: 13, color: C.secondary, lineHeight: 1.7 }}>
          <strong style={{ color: C.onSurface }}>Market concentration:</strong> See how your pipeline is distributed geographically.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Location due diligence:</strong> Verify property locations and proximity to each other.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Portfolio overview:</strong> Visualize your entire acquisition pipeline on a single map.
        </div>
      </div>
    ),
  },
  {
    id: "workspaces",
    title: "DealBoards",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          DealBoards let you organize properties into separate collections — by deal pipeline, client, asset type, or any grouping that makes sense for your workflow.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Asset Types</h4>
        <WorkspaceTypesDiagram />
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Each DealBoard is tied to an asset type. This determines which scoring model is used and which property-type-specific metrics are extracted. Choose the type that best matches your deals.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Managing DealBoards</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Go to <strong>DealBoards</strong> in the bottom nav to create, rename, or delete dealboards. Switch between dealboards using the dropdown at the top of the sidebar. Each dealboard has its own set of properties, scores, and outputs.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>DealBoard Examples</h4>
        <div style={{ background: C.surfLow, borderRadius: C.radius, padding: 16, fontSize: 13, color: C.secondary, lineHeight: 1.7 }}>
          <strong style={{ color: C.onSurface }}>"Q2 Pipeline"</strong> — All deals you're evaluating this quarter.
          <br /><br />
          <strong style={{ color: C.onSurface }}>"Client: ABC Investors"</strong> — Properties screened for a specific client.
          <br /><br />
          <strong style={{ color: C.onSurface }}>"Industrial Acquisitions"</strong> — Industrial-only DealBoard with warehouse-specific scoring.
          <br /><br />
          <strong style={{ color: C.onSurface }}>"Comparison Set"</strong> — A curated set of deals for side-by-side analysis.
        </div>
      </div>
    ),
  },
  {
    id: "sharing",
    title: "Sharing",
    icon: "M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          Sharing lets you generate a read-only link to your DealBoard that anyone can view — no account required. It's designed for quickly getting deal analysis in front of decision-makers.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>How It Works</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Click <strong>Share DealBoard</strong> in the navigation bar to open the sharing panel. From there you can generate a unique shareable link for the active DealBoard. Anyone with the link can view property scores, financial metrics, AI analysis, and the scoreboard — but they cannot edit data, upload files, or change scores.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>What Recipients See</h4>
        <div style={{ background: C.surfLow, borderRadius: C.radius, padding: 16, fontSize: 13, color: C.secondary, lineHeight: 1.7 }}>
          <strong style={{ color: C.onSurface }}>Property cards</strong> — Name, location, score ring, and analysis status for each deal.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Scoreboard</strong> — The full comparative table with scores, pricing, cap rates, NOI, and signal ratings.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Deal detail</strong> — Financial metrics, AI-generated deal summary, strengths and risks, and the investment recommendation.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Map view</strong> — Property locations plotted on an interactive map.
        </div>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Use Cases</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Send to your investment committee for deal review. Share a curated pipeline with a client or capital partner. Give your broker a quick look at how a deal scores. Distribute to team members who don't need full platform access.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Privacy & Control</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Shared links are read-only and can be revoked at any time from the sharing panel. You control exactly which DealBoard is shared. Sharing one DealBoard does not expose any other DealBoards or account data.
        </p>
      </div>
    ),
  },
  {
    id: "compare",
    title: "Compare Deals",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          The Compare tool lets you select up to 5 properties and view them side by side in a structured table.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>How to Compare</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Navigate to the Compare page (accessible from property detail pages). Toggle up to 5 deals to include in the comparison. The table shows key metrics in rows with each property in its own column, making it easy to spot which deal has the best pricing, highest cap rate, strongest tenants, etc.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Comparison Metrics</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          The comparison table includes: Investment Score, Recommendation, Asset Type, Status, Asking Price, Price per SF, NOI, Cap Rate, Occupancy, DSCR, Cash-on-Cash Return, IRR, and Equity Multiple. Metrics that couldn't be extracted appear as blank cells.
        </p>
      </div>
    ),
  },
  {
    id: "extracted-fields",
    title: "Extracted Fields & Overrides",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          After AI analysis, data is organized into structured field groups. You can review, verify, and override any extracted value.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Field Groups</h4>
        <div className="hp-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, padding: "12px 0" }}>
          {["Property Basics", "Pricing & Deal Terms", "Income", "Expenses", "Tenant Info", "Debt Assumptions", "Returns", "Rent Roll", "Lease Data", "Signals"].map(g => (
            <div key={g} style={{ padding: "8px 12px", borderRadius: C.radius, background: C.surfLow, fontSize: 12, fontWeight: 600, color: C.onSurface }}>{g}</div>
          ))}
        </div>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Confidence Scores</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Each extracted field has a confidence score (0–1) indicating how certain the AI is about the extraction. Fields above 0.8 confidence are considered high-quality. Lower-confidence fields should be manually verified against the source document.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>User Overrides</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Click any field value on the property detail page to enter your own value. Overrides take precedence over AI-extracted values and are flagged as "user confirmed." This is useful when the AI misreads a number, or when you have information from a source the AI hasn't seen (e.g., a phone call with the broker).
        </p>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6, marginTop: 8 }}>
          Overridden fields are used in all downstream calculations, including scoring, proforma generation, and comparison tables.
        </p>
      </div>
    ),
  },
  {
    id: "outputs",
    title: "Generated Outputs",
    icon: "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          After analysis, the system automatically generates downloadable output files for each property.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Proforma XLSX</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          A financial spreadsheet containing projected income, expenses, NOI, debt service, cash flow, and returns over your hold period. Uses the extracted data plus your DealBoard's default assumptions (LTV, interest rate, amortization, hold period, exit cap, vacancy, rent growth, expense growth). Editable in Excel or Google Sheets.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Underwriting Brief</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          An AI-generated narrative summary of the deal, including property overview, financial highlights, risk factors, value-add opportunities, and the investment recommendation. Formatted for quick review — useful for sharing with investment committees or clients.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Re-generating Outputs</h4>
        <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          If you override extracted fields or change DealBoard assumptions in Settings, you can re-generate outputs from the property detail page. The new outputs will reflect your updated data.
        </p>
      </div>
    ),
  },
  {
    id: "settings",
    title: "Settings & Assumptions",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          Configure default underwriting assumptions that apply to all new properties in this DealBoard. These values are used when generating proformas and financial projections.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Default Assumptions</h4>
        <div className="hp-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "12px 0" }}>
          {[
            { label: "Loan-to-Value (LTV)", value: "65%" },
            { label: "Interest Rate", value: "6.50%" },
            { label: "Amortization", value: "25 years" },
            { label: "Hold Period", value: "10 years" },
            { label: "Exit Cap Rate", value: "7.00%" },
            { label: "Vacancy Assumption", value: "5.00%" },
            { label: "Annual Rent Growth", value: "2.50%" },
            { label: "Annual Expense Growth", value: "3.00%" },
          ].map(a => (
            <div key={a.label} style={{
              padding: "10px 14px", borderRadius: C.radius, background: C.surfLow,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 12, color: C.secondary }}>{a.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface }}>{a.value}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.secondary, fontStyle: "italic" }}>
          These are the system defaults. You can change them in Settings — your changes apply to all new underwriting models in this DealBoard.
        </p>
      </div>
    ),
  },
  {
    id: "quick-actions",
    title: "Quick Actions & Tips",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          Common actions and navigation patterns to help you move faster through the app.
        </p>

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Common Actions</h4>
        <KeyboardShortcutTable />

        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: "20px 0 8px" }}>Pro Tips</h4>
        <div style={{ background: C.surfLow, borderRadius: C.radius, padding: 16, fontSize: 13, color: C.secondary, lineHeight: 1.8 }}>
          <strong style={{ color: C.onSurface }}>Upload the OM first.</strong> It usually contains the most complete data. Add rent rolls and T-12s later for additional accuracy.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Check the Signals section.</strong> The AI generates buy/hold/pass recommendations with reasoning — this is often the most valuable output.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Override fields you know are wrong.</strong> The AI isn't perfect. If you spot an incorrect extraction, click to override it — the score will recalculate.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Use Bulk Upload for deal flow.</strong> If a broker sends you 10 OMs, bulk upload them all at once instead of one by one.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Create separate DealBoards per client or pipeline.</strong> This keeps your deals organized and lets you use the right scoring model per asset type.
          <br /><br />
          <strong style={{ color: C.onSurface }}>Check the Map for geographic concentration.</strong> If all your deals cluster in one area, you may want to diversify.
        </div>
      </div>
    ),
  },
  {
    id: "glossary",
    title: "CRE Glossary",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    content: (
      <div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7 }}>
          Key terms used throughout the application and in CRE underwriting.
        </p>
        <div style={{ padding: "12px 0" }}>
          {[
            { term: "NNN (Triple Net)", def: "A lease structure where the tenant pays property taxes, insurance, and maintenance in addition to rent. Common in retail and industrial." },
            { term: "Cap Rate", def: "Net Operating Income divided by property value. A higher cap rate generally indicates higher yield but potentially higher risk." },
            { term: "NOI (Net Operating Income)", def: "Total income minus operating expenses, before debt service. The core measure of a property's income-producing ability." },
            { term: "DSCR (Debt Service Coverage Ratio)", def: "NOI divided by annual debt service. A DSCR above 1.25x is typically required by lenders. Below 1.0x means the property doesn't cover its debt." },
            { term: "WALE", def: "Weighted Average Lease Expiration — the average remaining lease term, weighted by rent or square footage. Longer WALE = more predictable income." },
            { term: "Cash-on-Cash Return", def: "Annual before-tax cash flow divided by total cash invested. Shows the yield on your actual equity investment." },
            { term: "Debt Yield", def: "NOI divided by loan amount. A lender's measure of risk — higher debt yield = more comfortable lending position." },
            { term: "Price per SF", def: "Asking price divided by total square footage. Used to compare relative pricing across properties of different sizes." },
            { term: "GLA", def: "Gross Leasable Area — the total floor area available for tenant use, measured in square feet." },
            { term: "T-12", def: "Trailing 12-month operating statement. Shows actual income and expenses for the most recent 12-month period." },
            { term: "OM (Offering Memorandum)", def: "A marketing document prepared by brokers that summarizes a property for sale, including financials, tenant info, photos, and market data." },
            { term: "Breakeven Occupancy", def: "The minimum occupancy needed to cover all operating expenses and debt service. Lower is better — more cushion for vacancies." },
            { term: "IRR (Internal Rate of Return)", def: "The annualized rate of return on an investment over the hold period, accounting for all cash flows and the exit sale." },
            { term: "Equity Multiple", def: "Total distributions divided by total equity invested. A 2.0x equity multiple means you doubled your money." },
            { term: "LTV (Loan-to-Value)", def: "The loan amount as a percentage of the property value. A 65% LTV means 35% equity and 65% debt." },
            { term: "Exit Cap", def: "The estimated cap rate at which the property will sell at the end of the hold period. Usually 50–100 basis points higher than the entry cap." },
          ].map((item, i) => (
            <div key={item.term} style={{
              padding: "12px 0",
              borderBottom: i < 15 ? `1px solid ${C.ghost}` : "none",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.onSurface, marginBottom: 4 }}>{item.term}</div>
              <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>{item.def}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "faq",
    title: "FAQ",
    icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    content: (
      <div>
        {[
          { q: "What AI model powers the analysis?", a: "GPT-4o from OpenAI. Documents go through a 3-stage pipeline: (1) text extraction and property classification, (2) structured field extraction across 10+ field groups, (3) signal generation with investment recommendations." },
          { q: "How long does analysis take?", a: "Typically 30–60 seconds for a single OM. The progress bar shows each stage. You can leave the page while analysis is running — it continues in the background." },
          { q: "Can I re-analyze a property?", a: "Yes. Go to the property detail page and click 'Re-analyze.' This re-runs the entire pipeline with all attached documents and recalculates the score." },
          { q: "What if the AI extracts the wrong data?", a: "Click any field value to override it with the correct number. Your override takes precedence in all calculations and scoring. The more fields you confirm, the higher your Data Confidence score." },
          { q: "Can I upload multiple files for one property?", a: "Yes. Upload the OM first, then go to the property detail page and add rent rolls, T-12s, leases, or any additional documents. The AI incorporates all documents into the analysis." },
          { q: "What's the difference between dealboards?", a: "Each dealboard can have a different asset type (Retail, Industrial, Office, Land), which determines the scoring model used. You can also use dealboards to separate different pipelines or clients." },
          { q: "Why is my score low even though the deal looks good?", a: "The score is based only on data the AI could extract. If your document is missing key information (e.g., no cap rate, no tenant details), the Data Confidence category will pull the score down. Try uploading additional documents with more complete financial data." },
          { q: "Can I export my analysis?", a: "Yes. Each property generates a downloadable Proforma XLSX and Underwriting Brief. You can also use the Scoreboard for a quick metrics overview across all properties." },
          { q: "Is my data secure?", a: "All documents are stored in Firebase with per-user access controls. Your data is not shared with other users or used to train AI models." },
          { q: "What file types give the best results?", a: "PDFs and Excel files (.xlsx, .xls) produce the most accurate extractions. PDFs are best for OMs and flyers. Excel is best for rent rolls and financial statements. Avoid low-resolution scans or heavily redacted documents." },
          { q: "Can I change the underwriting assumptions?", a: "Yes. Go to Settings to modify default assumptions (LTV, interest rate, amortization, hold period, exit cap, vacancy, rent/expense growth). Changes apply to all new proformas generated in that DealBoard." },
          { q: "What happens if I upload to the wrong dealboard?", a: "The system detects property type mismatches automatically. If you upload an industrial deal to a retail dealboard, you'll see a warning with options to continue anyway or create a new dealboard for that asset type." },
        ].map((item, i) => (
          <details key={i} style={{
            borderBottom: `1px solid ${C.ghost}`,
            padding: "14px 0",
          }}>
            <summary style={{
              fontSize: 14, fontWeight: 600, color: C.onSurface, cursor: "pointer",
              listStyle: "none", display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
              {item.q}
            </summary>
            <p style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6, margin: "10px 0 0 22px" }}>{item.a}</p>
          </details>
        ))}
      </div>
    ),
  },
];

/* ===== Main Help Page Component ===== */

export default function HelpPage() {
  const [activeId, setActiveId] = useState("getting-started");
  const activeTopic = HELP_TOPICS.find(t => t.id === activeId) || HELP_TOPICS[0];

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .hp-container { flex-direction: column !important; gap: 0 !important; }
          .hp-sidebar { width: 100% !important; border-right: none !important; border-bottom: 1px solid ${C.ghost} !important; position: static !important; max-height: none !important; padding: 12px 0 !important; }
          .hp-content { max-width: 100% !important; padding: 16px 20px !important; }
          .hp-diagram { flex-wrap: wrap !important; }
          .hp-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .hp-sidebar { padding: 8px 0 !important; }
          .hp-sidebar h2 { font-size: 16px !important; padding: 0 12px 12px !important; }
          .hp-topic-btn { padding: 8px 12px !important; font-size: 12px !important; gap: 6px !important; }
          .hp-topic-btn svg { width: 14px !important; height: 14px !important; }
          .hp-content { padding: 12px 14px !important; }
          .hp-content h4 { font-size: 14px !important; margin: 16px 0 6px !important; }
          .hp-diagram { overflow-x: auto !important; }
        }
      `}</style>
      <div className="hp-container" style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 120px)" }}>
      {/* Left sidebar — topic list */}
      <div className="hp-sidebar" style={{
        width: 240, flexShrink: 0, padding: "20px 0",
        borderRight: `1px solid ${C.ghost}`,
        position: "sticky", top: 0, alignSelf: "flex-start",
        maxHeight: "calc(100vh - 120px)", overflowY: "auto",
      }}>
        <h2 style={{
          fontSize: 18, fontWeight: 700, color: C.onSurface, padding: "0 20px 16px",
          fontFamily: "'Inter', sans-serif", margin: 0,
        }}>
          Help Center
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {HELP_TOPICS.map(topic => (
            <button
              key={topic.id}
              className="hp-topic-btn"
              onClick={() => setActiveId(topic.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 20px", border: "none", cursor: "pointer",
                background: activeId === topic.id ? "rgba(132, 204, 22, 0.06)" : "transparent",
                color: activeId === topic.id ? C.primary : C.secondary,
                fontSize: 13, fontWeight: activeId === topic.id ? 600 : 400,
                textAlign: "left", fontFamily: "'Inter', sans-serif",
                borderLeft: activeId === topic.id ? `3px solid ${C.primary}` : "3px solid transparent",
                transition: "all 0.15s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d={topic.icon} />
              </svg>
              {topic.title}
            </button>
          ))}
        </div>
      </div>

      {/* Right content area */}
      <div className="hp-content" style={{ flex: 1, padding: "20px 40px 60px", maxWidth: 1400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%", background: "rgba(132, 204, 22, 0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d={activeTopic.icon} />
            </svg>
          </div>
          <h1 style={{
            fontSize: 24, fontWeight: 700, color: C.onSurface, margin: 0,
            fontFamily: "'Inter', sans-serif",
          }}>
            {activeTopic.title}
          </h1>
        </div>

        {activeTopic.content}

        {/* Navigation between topics */}
        <div className="hp-nav" style={{
          display: "flex", justifyContent: "space-between", marginTop: 40,
          paddingTop: 20, borderTop: `1px solid ${C.ghost}`,
        }}>
          {(() => {
            const idx = HELP_TOPICS.findIndex(t => t.id === activeId);
            const prev = idx > 0 ? HELP_TOPICS[idx - 1] : null;
            const next = idx < HELP_TOPICS.length - 1 ? HELP_TOPICS[idx + 1] : null;
            return (
              <>
                {prev ? (
                  <button onClick={() => setActiveId(prev.id)} style={{
                    display: "flex", alignItems: "center", gap: 6, background: "none",
                    border: "none", cursor: "pointer", color: C.secondary, fontSize: 13, fontFamily: "'Inter', sans-serif",
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                    {prev.title}
                  </button>
                ) : <div />}
                {next ? (
                  <button onClick={() => setActiveId(next.id)} style={{
                    display: "flex", alignItems: "center", gap: 6, background: "none",
                    border: "none", cursor: "pointer", color: C.primary, fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                  }}>
                    {next.title}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                ) : <div />}
              </>
            );
          })()}
        </div>
      </div>
    </div>
    </>
  );
}
