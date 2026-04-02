"use client";

import { useState } from "react";
import Link from "next/link";
import DealSignalNav from "@/components/DealSignalNav";
import DealSignalFooter from "@/components/DealSignalFooter";

/* ===========================================================================
   SAMPLE DEAL DATA — two realistic CRE properties with full scoring
   =========================================================================== */

const SAMPLE_DEALS = [
  {
    id: "walgreens-nnn",
    propertyName: "Walgreens — Cedar Park, TX",
    address: "1301 E Whitestone Blvd",
    city: "Cedar Park",
    state: "TX",
    zip: "78613",
    assetType: "Retail (NNN)",
    analysisType: "retail",
    yearBuilt: "2009",
    buildingSf: 14820,
    landAcres: 1.72,
    occupancyPct: 100,
    tenantCount: "1",
    wale: 8.2,
    askingPrice: 7050000,
    pricePerSf: 475.71,
    capRateOm: 5.85,
    noiOm: 412425,
    dscrOm: 1.42,
    debtYield: 9.0,
    cashOnCashOm: 6.2,
    traffic: "42,000 AADT on Whitestone Blvd",
    brief: "Single-tenant Walgreens NNN investment in the high-growth Cedar Park submarket of Austin, TX. The property features absolute NNN lease structure with zero landlord responsibilities and a corporate-guaranteed lease from Walgreens Boots Alliance (S&P: BBB).\n\nStrategically positioned at a signalized hard-corner intersection with over 42,000 AADT traffic counts. Cedar Park is one of the fastest-growing suburbs in Central Texas with strong household income demographics supporting long-term retail demand.",
    score: {
      totalScore: 74,
      scoreBand: "buy",
      recommendation: "Buy — Score 74/100. Strengths: solid 5.85% cap rate, 100% occupied, 1.42x DSCR, 8.2-year WALE. Concerns: single-tenant concentration, pharmacy sector headwinds.",
      categories: [
        { name: "pricing", weight: 15, score: 62, explanation: "Cap rate 5.85%, $476/SF — premium pricing for NNN" },
        { name: "cashflow", weight: 15, score: 78, explanation: "DSCR 1.42x — solid debt service coverage" },
        { name: "upside", weight: 10, score: 55, explanation: "Limited rental upside with fixed NNN structure" },
        { name: "tenant", weight: 12, score: 82, explanation: "WALE 8.2 years, investment-grade tenant (BBB)" },
        { name: "rollover", weight: 10, score: 80, explanation: "8+ year runway before lease rollover risk" },
        { name: "vacancy", weight: 8, score: 95, explanation: "100% occupied — zero vacancy risk" },
        { name: "location", weight: 10, score: 78, explanation: "High-growth Austin suburb, 42K AADT" },
        { name: "physical", weight: 8, score: 72, explanation: "Built 2009, 17 years old — good condition" },
        { name: "redevelopment", weight: 5, score: 45, explanation: "Limited redevelopment upside as NNN" },
        { name: "confidence", weight: 7, score: 85, explanation: "Strong data extraction — 38 data points" },
      ],
    },
    signals: {
      overall: "🟢 Solid NNN investment with investment-grade tenant, strong location fundamentals, and favorable debt metrics.",
      cap_rate: "🟡 5.85% cap rate — market-rate for investment-grade NNN retail in a growth market. Not compelling yield but stable.",
      dscr: "🟢 1.42x DSCR — comfortable coverage above 1.35x threshold with room for rate movement.",
      occupancy: "🟢 100% occupied — single-tenant fully leased with no vacancy risk for 8+ years.",
      basis: "🔴 $476/SF basis is elevated for suburban retail. Replacement cost estimated at ~$250/SF.",
      tenant_quality: "🟢 Walgreens Boots Alliance — S&P BBB rated, Fortune 500 company. Strong credit tenant.",
      rollover_risk: "🟢 8.2-year WALE provides long runway. Low near-term rollover risk.",
    },
    tenants: [
      { name: "Walgreens", sf: 14820, rent: 412425, rent_per_sf: 27.83, type: "NNN", end: "2034", status: "Active" },
    ],
    documents: [
      { name: "Walgreens_OM_CedarPark.pdf", type: "PDF", category: "Offering Memorandum", size: "4.2 MB" },
      { name: "Lease_Agreement.pdf", type: "PDF", category: "Lease", size: "1.8 MB" },
    ],
  },
  {
    id: "industrial-portfolio",
    propertyName: "Flex Industrial — Schaumburg, IL",
    address: "1455 E American Ln",
    city: "Schaumburg",
    state: "IL",
    zip: "60173",
    assetType: "Industrial (Flex)",
    analysisType: "industrial",
    yearBuilt: "1998",
    buildingSf: 86400,
    landAcres: 5.1,
    occupancyPct: 92,
    tenantCount: "4",
    wale: 3.8,
    askingPrice: 8750000,
    pricePerSf: 101.27,
    capRateOm: 7.65,
    noiOm: 669375,
    dscrOm: 1.58,
    debtYield: 11.8,
    cashOnCashOm: 8.9,
    traffic: "28,000 AADT on American Ln",
    brief: "Multi-tenant flex industrial property in the established Schaumburg industrial corridor, one of the most active distribution and logistics hubs in the Chicago metro. The property offers a compelling 7.65% cap rate with strong cashflow metrics.\n\nThe 86,400 SF facility sits on 5.1 acres with dock-high loading, 24' clear heights, and proximity to I-90 and O'Hare International Airport. Four tenants provide income diversification, though the 3.8-year WALE creates near-term rollover exposure that warrants pricing consideration.",
    score: {
      totalScore: 68,
      scoreBand: "hold",
      recommendation: "Hold — Score 68/100. Strengths: strong 7.65% cap rate, 1.58x DSCR, competitive $101/SF basis. Concerns: 3.8-year WALE, 8% vacancy, building age (1998).",
      categories: [
        { name: "pricing", weight: 15, score: 82, explanation: "Cap rate 7.65%, $101/SF — strong value basis" },
        { name: "income_quality", weight: 15, score: 72, explanation: "DSCR 1.58x, 11.8% debt yield — solid cashflow" },
        { name: "tenant_lease", weight: 12, score: 55, explanation: "No investment-grade tenants, local/regional" },
        { name: "rollover", weight: 10, score: 38, explanation: "3.8-year WALE — near-term rollover risk" },
        { name: "physical", weight: 12, score: 65, explanation: "24' clear, dock-high loading, 1998 build" },
        { name: "functionality", weight: 10, score: 70, explanation: "Functional flex layout with adequate utilities" },
        { name: "location", weight: 8, score: 75, explanation: "Schaumburg industrial corridor, I-90 access" },
        { name: "capital_exposure", weight: 10, score: 60, explanation: "Building age suggests upcoming capex needs" },
        { name: "confidence", weight: 8, score: 78, explanation: "Good data extraction — 34 data points" },
      ],
    },
    signals: {
      overall: "🟡 Solid income-producing industrial asset with strong cashflow but near-term rollover risk. Pricing compensates for the lease risk.",
      cap_rate: "🟢 7.65% cap rate — compelling yield for suburban flex industrial with existing tenancy.",
      dscr: "🟢 1.58x DSCR — well above 1.35x coverage threshold. Strong debt service cushion.",
      occupancy: "🟡 92% occupied — 1 of 4 suites vacant. Spec industrial space should lease within 6-12 months in this market.",
      basis: "🟢 $101/SF — competitive basis below replacement cost. Strong downside protection.",
      tenant_quality: "🟡 Regional/local tenants without investment-grade credit. Diversified across 4 tenants mitigates single-tenant risk.",
      rollover_risk: "🔴 3.8-year WALE — 2 leases expire within 24 months. Significant rollover exposure requiring active asset management.",
    },
    tenants: [
      { name: "Precision Logistics Inc", sf: 32000, rent: 256000, rent_per_sf: 8.0, type: "NNN", end: "2028", status: "Active" },
      { name: "MidWest Tool & Die", sf: 24000, rent: 180000, rent_per_sf: 7.5, type: "Gross Modified", end: "2027", status: "Active" },
      { name: "TechFlex Solutions", sf: 16800, rent: 134400, rent_per_sf: 8.0, type: "NNN", end: "2030", status: "Active" },
      { name: "Vacant Suite D", sf: 13600, rent: 0, rent_per_sf: 0, type: "--", end: "--", status: "Vacant" },
    ],
    documents: [
      { name: "Schaumburg_Flex_OM.pdf", type: "PDF", category: "Offering Memorandum", size: "6.1 MB" },
      { name: "Rent_Roll_Q4_2025.xlsx", type: "XLS", category: "Rent Roll", size: "248 KB" },
      { name: "T12_Financials.xlsx", type: "XLS", category: "T-12", size: "312 KB" },
    ],
  },
];

/* ===========================================================================
   FORMAT HELPERS
   =========================================================================== */
function fmt$(val: any): string {
  if (!val) return "--";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(val: any): string { return val ? `${Number(val).toFixed(2)}%` : "--"; }
function fmtX(val: any): string { return val ? `${Number(val).toFixed(2)}x` : "--"; }

/* ===========================================================================
   MAIN PAGE — mirrors the real workspace property detail view
   =========================================================================== */
export default function TryProPage() {
  const [selectedDeal, setSelectedDeal] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "signals" | "documents">("overview");
  const deal = SAMPLE_DEALS[selectedDeal];
  const score = deal.score;
  const bandColor = score.scoreBand === "buy" || score.scoreBand === "strong_buy" ? "#059669" : score.scoreBand === "hold" ? "#D97706" : "#b9172f";
  const bandBg = score.scoreBand === "buy" || score.scoreBand === "strong_buy" ? "#D1FAE5" : score.scoreBand === "hold" ? "#FEF3C7" : "#FDE8EA";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        body, input, button, select, textarea { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        @keyframes barGrow { from { width: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ringFill { from { stroke-dashoffset: 364.42; } }
        .tp-card { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; }
        .tp-card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
        .tp-tab { padding: 10px 20px; font-size: 13px; font-weight: 600; color: #64748b; background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .tp-tab:hover { color: #1e293b; }
        .tp-tab-active { color: #b9172f !important; border-bottom-color: #b9172f !important; }
        .tp-metric-card { background: #f8fafc; border-radius: 12px; padding: 14px 16px; border: 1px solid #f1f5f9; transition: all 0.15s; }
        .tp-metric-card:hover { background: #f1f5f9; border-color: #e2e8f0; }
        .tp-signal-row { padding: 12px 16px; border-left: 3px solid; transition: background 0.15s; }
        .tp-signal-row:hover { filter: brightness(0.98); }
        .tp-doc-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 10px; transition: background 0.15s; cursor: pointer; }
        .tp-doc-row:hover { background: #f8fafc; }
        .tp-cta-btn { display: inline-flex; align-items: center; justify-content: center; font-weight: 700; border-radius: 50px; cursor: pointer; transition: all 0.2s; text-decoration: none; border: none; }
        .tp-cta-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(185,23,47,0.3); }
        .tp-deal-tab { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; cursor: pointer; transition: all 0.15s; border: 1.5px solid transparent; }
        .tp-deal-tab:hover { background: #f8fafc; }
        @media (max-width: 900px) {
          .tp-hero-grid { grid-template-columns: 1fr !important; }
          .tp-main-grid { grid-template-columns: 1fr !important; }
          .tp-metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .tp-breakdown-grid { grid-template-columns: 1fr !important; }
          .tp-sidebar { display: none !important; }
        }
      `}</style>

      <DealSignalNav />

      <div style={{ display: "flex", minHeight: "calc(100vh - 60px)" }}>

        {/* ── Left Sidebar — Deal Selector ── */}
        <aside className="tp-sidebar" style={{
          width: 280, background: "#fff", borderRight: "1px solid #e2e8f0",
          padding: "20px 16px", flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12, paddingLeft: 4 }}>
            Sample Deals
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SAMPLE_DEALS.map((d, i) => (
              <div
                key={d.id}
                className="tp-deal-tab"
                onClick={() => { setSelectedDeal(i); setActiveTab("overview"); }}
                style={{
                  background: selectedDeal === i ? "#f8fafc" : "transparent",
                  borderColor: selectedDeal === i ? "#e2e8f0" : "transparent",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: selectedDeal === i ? "rgba(185,23,47,0.06)" : "#f1f5f9",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
                }}>
                  {d.analysisType === "retail" ? "🏪" : "🏭"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: selectedDeal === i ? "#1e293b" : "#64748b", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.propertyName}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{d.assetType}</div>
                </div>
                <div style={{
                  marginLeft: "auto", padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 800, flexShrink: 0,
                  background: d.score.scoreBand === "buy" ? "rgba(5,150,105,0.1)" : "rgba(217,119,6,0.1)",
                  color: d.score.scoreBand === "buy" ? "#059669" : "#D97706",
                }}>
                  {d.score.totalScore}
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 20, paddingTop: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12, paddingLeft: 4 }}>
              Pro Features
            </div>
            {[
              { icon: "📊", label: "Full Score Breakdown" },
              { icon: "📈", label: "Signal Assessment" },
              { icon: "📄", label: "Document Management" },
              { icon: "💾", label: "XLSX & Brief Export" },
              { icon: "🔍", label: "Deep Research" },
              { icon: "🗺️", label: "Portfolio Map View" },
            ].map(f => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 4px", fontSize: 12, color: "#64748b" }}>
                <span style={{ fontSize: 14 }}>{f.icon}</span>
                {f.label}
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main style={{ flex: 1, background: "#f8fafc", padding: "24px 32px 60px", overflow: "auto" }} key={deal.id}>
          <div style={{ maxWidth: 960, margin: "0 auto", animation: "fadeIn 0.3s ease" }}>

            {/* ── Property Header ── */}
            <div className="tp-card" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
              <div className="tp-hero-grid" style={{ display: "grid", gridTemplateColumns: "300px 1fr", minHeight: 220 }}>
                {/* Property Image Placeholder */}
                <div style={{
                  background: `linear-gradient(135deg, #f1f5f9, #e2e8f0)`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8,
                  borderRight: "1px solid #e2e8f0",
                }}>
                  <div style={{ fontSize: 48, opacity: 0.4 }}>📍</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{deal.address}</div>
                  <div style={{ fontSize: 10, color: "#b9172f", fontWeight: 600 }}>View on Google Maps &rarr;</div>
                </div>

                {/* Property Info */}
                <div style={{ padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", margin: 0, letterSpacing: -0.3 }}>{deal.propertyName}</h1>
                        <span style={{
                          padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                          background: "rgba(185,23,47,0.06)", color: "#b9172f", textTransform: "uppercase", letterSpacing: 0.5,
                        }}>{deal.assetType}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>{deal.address}, {deal.city}, {deal.state} {deal.zip}</p>
                    </div>
                    {/* Score Badge */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{ position: "relative", width: 72, height: 72 }}>
                        <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="36" cy="36" r="30" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                          <circle cx="36" cy="36" r="30" fill="none" stroke={bandColor} strokeWidth="6"
                            strokeDasharray={2 * Math.PI * 30}
                            strokeDashoffset={2 * Math.PI * 30 * (1 - score.totalScore / 100)}
                            strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 20, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>{score.totalScore}</span>
                        </div>
                      </div>
                      <span style={{
                        marginTop: 4, fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: 0.8, color: bandColor, padding: "2px 8px", borderRadius: 4, background: bandBg,
                      }}>{score.scoreBand.replace("_", " ")}</span>
                    </div>
                  </div>

                  {/* Key Metrics Row */}
                  <div className="tp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 16 }}>
                    {[
                      { label: "Asking Price", value: fmt$(deal.askingPrice) },
                      { label: "Cap Rate", value: fmtPct(deal.capRateOm) },
                      { label: "NOI", value: fmt$(deal.noiOm) },
                      { label: "DSCR", value: fmtX(deal.dscrOm) },
                    ].map(m => (
                      <div key={m.label} className="tp-metric-card">
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", marginTop: 3 }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tab Nav ── */}
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
              {(["overview", "signals", "documents"] as const).map(tab => (
                <button
                  key={tab}
                  className={`tp-tab ${activeTab === tab ? "tp-tab-active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "overview" ? "Overview" : tab === "signals" ? "Signals & Score" : "Documents"}
                </button>
              ))}
            </div>

            {/* ══ OVERVIEW TAB ══ */}
            {activeTab === "overview" && (
              <div style={{ animation: "fadeIn 0.25s ease" }}>
                {/* Extended metrics */}
                <div className="tp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                  {[
                    { label: "Price / SF", value: `$${deal.pricePerSf.toFixed(0)}` },
                    { label: "GLA", value: `${deal.buildingSf.toLocaleString()} SF` },
                    { label: "Occupancy", value: `${deal.occupancyPct}%` },
                    { label: "WALE", value: `${deal.wale} yrs` },
                    { label: "Year Built", value: deal.yearBuilt },
                    { label: "Land", value: `${deal.landAcres} acres` },
                    { label: "Debt Yield", value: `${deal.debtYield}%` },
                    { label: "Cash on Cash", value: `${deal.cashOnCashOm}%` },
                  ].map(m => (
                    <div key={m.label} className="tp-metric-card">
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginTop: 3 }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Brief / Investment Summary */}
                <div className="tp-card" style={{ padding: 24, marginBottom: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 3, height: 16, background: "#b9172f", borderRadius: 2 }} />
                    Investment Summary
                  </h3>
                  <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.75 }}>
                    {deal.brief.split("\n").filter(p => p.trim()).map((p, i) => (
                      <p key={i} style={{ margin: "0 0 10px" }}>{p}</p>
                    ))}
                  </div>
                </div>

                {/* Recommendation */}
                <div className="tp-card" style={{ padding: 20, marginBottom: 20, background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12, background: bandBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 800, color: bandColor, flexShrink: 0,
                    }}>
                      {score.scoreBand === "buy" ? "↑" : score.scoreBand === "hold" ? "→" : "↓"}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: bandColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Recommendation: {score.scoreBand.replace("_", " ")}
                      </div>
                      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, marginTop: 2 }}>
                        {score.recommendation}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tenant Table */}
                {deal.tenants.length > 0 && (
                  <div className="tp-card" style={{ overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0" }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 3, height: 16, background: "#b9172f", borderRadius: 2 }} />
                        Tenant Summary
                      </h3>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Tenant</th>
                          <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>SF</th>
                          <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Annual Rent</th>
                          <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Rent/SF</th>
                          <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Type</th>
                          <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Lease End</th>
                          <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deal.tenants.map((t, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "10px 20px", fontWeight: 600, color: t.status === "Vacant" ? "#DC2626" : "#1e293b" }}>{t.name}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#475569" }}>{t.sf.toLocaleString()}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#1e293b" }}>{t.rent ? fmt$(t.rent) : "--"}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#475569" }}>{t.rent_per_sf ? `$${t.rent_per_sf.toFixed(2)}` : "--"}</td>
                            <td style={{ padding: "10px 12px", color: "#475569" }}>{t.type}</td>
                            <td style={{ padding: "10px 12px", color: "#475569" }}>{t.end}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                                background: t.status === "Active" ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.1)",
                                color: t.status === "Active" ? "#059669" : "#DC2626",
                              }}>{t.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══ SIGNALS & SCORE TAB ══ */}
            {activeTab === "signals" && (
              <div style={{ animation: "fadeIn 0.25s ease" }}>
                <div className="tp-breakdown-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                  {/* Score Categories */}
                  <div className="tp-card" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 3, height: 16, background: "#b9172f", borderRadius: 2 }} />
                      Score Breakdown — {deal.analysisType.charAt(0).toUpperCase() + deal.analysisType.slice(1)} Model
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {score.categories.map(cat => {
                        const barColor = cat.score >= 70 ? "#059669" : cat.score >= 50 ? "#D97706" : "#DC2626";
                        return (
                          <div key={cat.name} style={{ padding: "10px 14px", background: "#f8fafc", borderRadius: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", textTransform: "capitalize" }}>{cat.name.replace("_", " ")}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#94a3b8" }}>{cat.weight}%</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: barColor }}>{cat.score}</span>
                              </div>
                            </div>
                            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ width: `${cat.score}%`, height: "100%", background: barColor, borderRadius: 2, animation: "barGrow 0.8s ease-out" }} />
                            </div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{cat.explanation}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Signal Assessment */}
                  <div className="tp-card" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 3, height: 16, background: "#b9172f", borderRadius: 2 }} />
                      Signal Assessment
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, borderRadius: 10, overflow: "hidden" }}>
                      {[
                        ["Overall", deal.signals.overall],
                        ["Cap Rate", deal.signals.cap_rate],
                        ["DSCR", deal.signals.dscr],
                        ["Occupancy", deal.signals.occupancy],
                        ["Basis / Price", deal.signals.basis],
                        ["Tenant Quality", deal.signals.tenant_quality],
                        ["Rollover Risk", deal.signals.rollover_risk],
                      ].map(([label, val]) => {
                        const raw = String(val);
                        const isGreen = raw.includes("🟢");
                        const isRed = raw.includes("🔴");
                        const color = isGreen ? "#059669" : isRed ? "#DC2626" : "#D97706";
                        const bg = isGreen ? "rgba(5,150,105,0.04)" : isRed ? "rgba(220,38,38,0.04)" : "rgba(217,119,6,0.04)";
                        const text = raw.replace(/^[🟢🟡🔴]\s*/, "");
                        return (
                          <div key={String(label)} className="tp-signal-row" style={{ borderLeftColor: color, background: bg }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: 0.3 }}>{String(label)}</span>
                            </div>
                            <span style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, paddingLeft: 13, display: "block", marginTop: 3 }}>{text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ DOCUMENTS TAB ══ */}
            {activeTab === "documents" && (
              <div style={{ animation: "fadeIn 0.25s ease" }}>
                <div className="tp-card" style={{ padding: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 3, height: 16, background: "#b9172f", borderRadius: 2 }} />
                    Uploaded Documents
                  </h3>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>
                    In Pro, all uploaded documents are stored and organized by category.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {deal.documents.map((doc, i) => {
                      const isPdf = doc.type === "PDF";
                      const iconBg = isPdf ? "#FDE8EA" : "#D1FAE5";
                      const iconColor = isPdf ? "#b9172f" : "#059669";
                      return (
                        <div key={i} className="tp-doc-row">
                          <div style={{
                            width: 40, height: 40, borderRadius: 10, background: iconBg,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, fontWeight: 800, color: iconColor, flexShrink: 0,
                          }}>
                            {doc.type}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{doc.category} &middot; {doc.size}</div>
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
                            padding: "3px 10px", borderRadius: 6, background: "#EEF2FF", color: "#4338CA",
                          }}>Extracted</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Export buttons (disabled/demo) */}
                  <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 20, paddingTop: 16, display: "flex", gap: 10 }}>
                    <button disabled style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
                      borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc",
                      fontSize: 12, fontWeight: 600, color: "#64748b", cursor: "not-allowed", opacity: 0.7,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download XLSX
                    </button>
                    <button disabled style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
                      borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc",
                      fontSize: 12, fontWeight: 600, color: "#64748b", cursor: "not-allowed", opacity: 0.7,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      Download Brief
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── CTA Banner ── */}
            <div style={{
              background: "#0f172a", borderRadius: 20, padding: "40px 48px", textAlign: "center",
              marginTop: 32, position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(185,23,47,0.2) 0%, transparent 70%)", filter: "blur(40px)" }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: -0.3 }}>
                  Ready to analyze your own deals?
                </h2>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "0 0 24px" }}>
                  Start your free Pro trial — no credit card required. Upload your first OM and get a full Deal Signals report.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <Link href="/workspace/login" className="tp-cta-btn" style={{
                    padding: "14px 36px", background: "#b9172f", color: "#fff", fontSize: 15,
                  }}>
                    Start Free Pro Trial
                  </Link>
                  <Link href="/om-analyzer" style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "14px 36px", background: "rgba(255,255,255,0.08)",
                    border: "1.5px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 50,
                    fontSize: 15, fontWeight: 600, textDecoration: "none",
                  }}>
                    Try Free Analyzer
                  </Link>
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 16 }}>
                  Pro $40/mo &middot; Pro+ $100/mo &middot; Cancel anytime
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <DealSignalFooter />
    </>
  );
}
