"use client";

import { useState } from "react";
import Link from "next/link";
import DealSignalLogo from "@/components/DealSignalLogo";

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
   MAIN PAGE
   =========================================================================== */
export default function TryProPage() {
  const [selectedDeal, setSelectedDeal] = useState(0);
  const deal = SAMPLE_DEALS[selectedDeal];
  const score = deal.score;
  const bandColor = score.scoreBand === "buy" || score.scoreBand === "strong_buy" ? "#059669" : score.scoreBand === "hold" ? "#C49A3C" : "#b9172f";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        body, input, button, select, textarea { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        @keyframes barGrow { from { width: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .deal-card { transition: all 0.2s ease; cursor: pointer; }
        .deal-card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(21,27,43,0.1); }
        .cta-btn { transition: all 0.2s ease; }
        .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(185,23,47,0.35); filter: brightness(1.08); }
      `}</style>

      {/* Header — matches om-analyzer nav */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 1280, margin: "0 auto", padding: "18px 40px",
      }}>
        <Link href="/om-analyzer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <DealSignalLogo size={34} fontSize={19} gap={9} />
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Link href="/om-analyzer#how-it-works" style={{ fontSize: 12, fontWeight: 600, color: "#585e70", textDecoration: "none", textTransform: "uppercase", letterSpacing: 1 }}>How it works</Link>
          <Link href="/pricing" style={{ fontSize: 12, fontWeight: 600, color: "#585e70", textDecoration: "none", textTransform: "uppercase", letterSpacing: 1 }}>Pricing</Link>
          <Link href="/workspace/login" style={{ fontSize: 12, fontWeight: 600, color: "#585e70", textDecoration: "none", textTransform: "uppercase", letterSpacing: 1 }}>Login</Link>
          <Link href="/workspace/login" style={{
            fontSize: 12, fontWeight: 700, color: "#fff", textDecoration: "none",
            background: "linear-gradient(135deg, #b9172f, #dc3545)", borderRadius: 6, padding: "8px 20px",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>Start Free Trial</Link>
        </nav>
      </header>

      {/* Hero Banner */}
      <div style={{
        background: "linear-gradient(135deg, #0B1120, #1a1230, #0d1a2e)", padding: "40px 40px 32px",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20,
                background: "rgba(185,23,47,0.15)", border: "1px solid rgba(185,23,47,0.25)", marginBottom: 14,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171", letterSpacing: 0.5 }}>PRO PREVIEW</span>
              </div>
              <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: -0.5 }}>
                See Deal Signals Pro in action
              </h1>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", margin: 0, maxWidth: 500 }}>
                Explore two sample deals with full Pro scoring models, category breakdowns, and risk analysis. This is what every deal looks like in your Pro workspace.
              </p>
            </div>
            <Link href="/workspace/login" className="cta-btn" style={{
              padding: "14px 32px", background: "linear-gradient(135deg, #b9172f, #dc3545)",
              color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none",
              flexShrink: 0,
            }}>
              Start Free Trial &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Deal Selector Tabs */}
      <div style={{ background: "#f8f9fb", borderBottom: "1px solid #EDF0F5", padding: "0 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 0 }}>
          {SAMPLE_DEALS.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setSelectedDeal(i)}
              className="deal-card"
              style={{
                padding: "16px 24px", background: selectedDeal === i ? "#fff" : "transparent",
                border: "none", borderBottom: selectedDeal === i ? "3px solid #b9172f" : "3px solid transparent",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 16,
                borderRadius: "8px 8px 0 0", marginTop: 4,
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: selectedDeal === i ? "rgba(185,23,47,0.08)" : "#EDF0F5",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20,
              }}>
                {d.analysisType === "retail" ? "🏪" : "🏭"}
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: selectedDeal === i ? "#151b2b" : "#585e70" }}>{d.propertyName}</div>
                <div style={{ fontSize: 11, color: "#8899B0", marginTop: 2 }}>
                  {d.assetType} &middot; {fmt$(d.askingPrice)} &middot; {fmtPct(d.capRateOm)} cap
                </div>
              </div>
              {/* Score badge */}
              <div style={{
                padding: "4px 10px", borderRadius: 6,
                background: d.score.scoreBand === "buy" ? "rgba(5,150,105,0.1)" : "rgba(196,154,60,0.1)",
                color: d.score.scoreBand === "buy" ? "#059669" : "#C49A3C",
                fontSize: 13, fontWeight: 800, marginLeft: "auto",
              }}>
                {d.score.totalScore}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Deal Content */}
      <section style={{ background: "#faf8f4", minHeight: "60vh", padding: "32px 40px 60px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", animation: "fadeIn 0.3s ease" }} key={deal.id}>

          {/* Top Row: Property Info + Score Ring */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, marginBottom: 20 }}>
            {/* Property Card */}
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 8px 24px rgba(21,27,43,0.05)", padding: "28px 28px 20px" }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between" }}>
                <div>
                  <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 800, color: "#151b2b", margin: "0 0 6px", letterSpacing: -0.3 }}>{deal.propertyName}</h2>
                  <p style={{ fontSize: 13, color: "#585e70", margin: "0 0 12px" }}>{deal.address}, {deal.city}, {deal.state} {deal.zip}</p>
                </div>
                <span style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: "rgba(185,23,47,0.06)", color: "#b9172f", textTransform: "uppercase", letterSpacing: 0.5,
                }}>{deal.assetType}</span>
              </div>

              {/* Metric pills */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                {[
                  { label: "Price", value: fmt$(deal.askingPrice) },
                  { label: "Cap Rate", value: fmtPct(deal.capRateOm) },
                  { label: "NOI", value: fmt$(deal.noiOm) },
                  { label: "DSCR", value: fmtX(deal.dscrOm) },
                  { label: "GLA", value: `${deal.buildingSf.toLocaleString()} SF` },
                  { label: "Occupancy", value: `${deal.occupancyPct}%` },
                  { label: "WALE", value: `${deal.wale} yrs` },
                ].map(m => (
                  <div key={m.label}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#8899B0", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#151b2b", marginTop: 2 }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Brief */}
              <div style={{ fontSize: 13, color: "#3B4C68", lineHeight: 1.7 }}>
                {deal.brief.split("\n").filter(p => p.trim()).map((p, i) => (
                  <p key={i} style={{ margin: "0 0 10px" }}>{p}</p>
                ))}
              </div>
            </div>

            {/* Score Card */}
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 8px 24px rgba(21,27,43,0.05)", padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8899B0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Deal Signals Score</div>
              {/* Score Ring */}
              <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto 12px" }}>
                <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="70" cy="70" r="58" fill="none" stroke="rgba(227,190,189,0.15)" strokeWidth="10" />
                  <circle cx="70" cy="70" r="58" fill="none" stroke={bandColor} strokeWidth="10"
                    strokeDasharray={2 * Math.PI * 58}
                    strokeDashoffset={2 * Math.PI * 58 * (1 - score.totalScore / 100)}
                    strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: "#151b2b", letterSpacing: -1 }}>{score.totalScore}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: bandColor, textTransform: "uppercase", letterSpacing: 1,
                  }}>{score.scoreBand.replace("_", " ")}</span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#585e70", lineHeight: 1.5, margin: 0 }}>
                {score.recommendation.split(".").slice(0, 2).join(".") + "."}
              </p>
            </div>
          </div>

          {/* Score Breakdown + Signals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* Score Categories */}
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 8px 24px rgba(21,27,43,0.05)", padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#151b2b", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 16, background: "#b9172f", borderRadius: 2 }} />
                Score Breakdown — {deal.analysisType.charAt(0).toUpperCase() + deal.analysisType.slice(1)} Model
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {score.categories.map(cat => {
                  const barColor = cat.score >= 70 ? "#059669" : cat.score >= 50 ? "#C49A3C" : "#b9172f";
                  return (
                    <div key={cat.name} style={{ padding: "8px 12px", background: "#f8f9fb", borderRadius: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#151b2b", textTransform: "capitalize" }}>{cat.name.replace("_", " ")}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 9, color: "#8899B0" }}>{cat.weight}%</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: barColor }}>{cat.score}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: "rgba(0,0,0,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${cat.score}%`, height: "100%", background: barColor, borderRadius: 2, animation: "barGrow 0.8s ease-out" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#8899B0", marginTop: 2 }}>{cat.explanation}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Signal Assessment */}
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 8px 24px rgba(21,27,43,0.05)", padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#151b2b", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 16, background: "#b9172f", borderRadius: 2 }} />
                Signal Assessment
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
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
                  const text = raw.replace(/^[🟢🟡🔴]\s*/, "");
                  return (
                    <div key={String(label)} style={{
                      padding: "10px 14px",
                      borderLeft: `3px solid ${color}`,
                      background: isGreen ? "rgba(5,150,105,0.04)" : isRed ? "rgba(220,38,38,0.04)" : "rgba(217,119,6,0.04)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#151b2b", textTransform: "uppercase", letterSpacing: 0.3 }}>{String(label)}</span>
                      </div>
                      <span style={{ fontSize: 12, color: "#3B4C68", lineHeight: 1.5, paddingLeft: 13, display: "block", marginTop: 2 }}>{text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tenant Table */}
          {deal.tenants.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 8px 24px rgba(21,27,43,0.05)", overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "12px 20px", background: "#f2f3ff" }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#151b2b" }}>Tenant Summary</h3>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 20px", textAlign: "left", fontWeight: 600, color: "#585e70" }}>Tenant</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#585e70" }}>SF</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#585e70" }}>Annual Rent</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#585e70" }}>Rent/SF</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#585e70" }}>Type</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#585e70" }}>Lease End</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#585e70" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.tenants.map((t, i) => (
                    <tr key={i} style={{ background: i % 2 === 1 ? "#f8f9fb" : "transparent" }}>
                      <td style={{ padding: "8px 20px", fontWeight: 600, color: t.status === "Vacant" ? "#DC2626" : "#151b2b" }}>{t.name}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{t.sf.toLocaleString()}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 500 }}>{t.rent ? fmt$(t.rent) : "--"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{t.rent_per_sf ? `$${t.rent_per_sf.toFixed(2)}` : "--"}</td>
                      <td style={{ padding: "8px 12px" }}>{t.type}</td>
                      <td style={{ padding: "8px 12px" }}>{t.end}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
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

          {/* CTA Banner */}
          <div style={{
            background: "linear-gradient(135deg, #0B1120 0%, #151b2b 50%, #1e2740 100%)",
            borderRadius: 16, padding: "40px 48px", textAlign: "center",
            boxShadow: "0 16px 48px rgba(11,17,32,0.3)", position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(185,23,47,0.15) 0%, transparent 70%)", filter: "blur(40px)" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: -0.3 }}>
                Ready to analyze your own deals?
              </h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", margin: "0 0 24px" }}>
                Start your free Pro trial — no credit card required. Upload your first OM and get a full Deal Signals report.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <Link href="/workspace/login" className="cta-btn" style={{
                  padding: "14px 36px", background: "linear-gradient(135deg, #b9172f, #dc3545)",
                  color: "#fff", borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: "none",
                }}>
                  Start Free Pro Trial
                </Link>
                <Link href="/om-analyzer" style={{
                  padding: "14px 36px", background: "rgba(255,255,255,0.08)",
                  border: "1.5px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 8,
                  fontSize: 15, fontWeight: 600, textDecoration: "none",
                }}>
                  Try Free Analyzer
                </Link>
              </div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 16, margin: "16px 0 0" }}>
                Pro $40/mo &middot; Pro+ $100/mo &middot; Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: "28px 40px", borderTop: "1px solid #EDF0F5",
        maxWidth: 1280, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <DealSignalLogo size={22} fontSize={13} gap={7} />
        <div style={{ display: "flex", gap: 24 }}>
          {[
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
            { label: "Support", href: "/contact" },
          ].map(link => (
            <Link key={link.label} href={link.href} style={{
              fontSize: 11, fontWeight: 500, color: "#585e70", textDecoration: "none",
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>{link.label}</Link>
          ))}
        </div>
        <span style={{ fontSize: 10, color: "#B4C1D1" }}>&copy; 2026 Deal Signals</span>
      </footer>
    </>
  );
}
