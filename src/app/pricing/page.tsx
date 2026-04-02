"use client";

import Link from "next/link";
import { useState } from "react";
import DealSignalNav from "@/components/DealSignalNav";
import DealSignalFooter from "@/components/DealSignalFooter";

const TIERS = [
  {
    name: "Free",
    price: "0",
    period: "",
    desc: "For independent analysts and students evaluating deals.",
    features: [
      { text: "2 Deal Analyses", included: true },
      { text: "Standard PDF extraction", included: true },
      { text: "Basic Deal Signals score", included: true },
      { text: "First-pass brief download", included: true },
      { text: "Save & organize deals", included: false },
      { text: "AI scoring models", included: false },
      { text: "Full Excel exports", included: false },
      { text: "Workspace & history", included: false },
    ],
    cta: "Get Started Free",
    ctaLink: "/om-analyzer",
    highlight: false,
  },
  {
    name: "Pro",
    price: "40",
    period: "/mo",
    desc: "For active investors and small acquisition teams.",
    features: [
      { text: "Up to 40 deals/month", included: true },
      { text: "Save & organize deals", included: true },
      { text: "Deal Signals scoring", included: true },
      { text: "Full Excel workbooks (6 sheets)", included: true },
      { text: "Pro workspace with history", included: true },
      { text: "Interactive property map", included: true },
      { text: "Deal comparison scoreboard", included: true },
      { text: "Shareable client links", included: true },
    ],
    cta: "Start Pro",
    ctaLink: "/workspace/login?upgrade=pro",
    highlight: true,
  },
  {
    name: "Pro+",
    price: "100",
    period: "/mo",
    desc: "For power users and teams with high deal flow.",
    features: [
      { text: "Up to 200 deals/month", included: true },
      { text: "Everything in Pro", included: true },
      { text: "Location Intelligence", included: true },
      { text: "Advanced exports", included: true },
      { text: "Priority processing", included: true },
      { text: "Bulk portfolio uploads", included: true },
      { text: "White-label shareable links", included: true },
      { text: "Priority support", included: true },
    ],
    cta: "Start Pro+",
    ctaLink: "/workspace/login?upgrade=pro_plus",
    highlight: false,
    bestValue: true,
  },
];

const FAQS = [
  { q: "Can I try it before I pay?", a: "Yes — the Free tier gives you 2 deal analyses with no credit card required. Upload any OM and see the full analysis flow before committing to a paid plan." },
  { q: "What file types are supported?", a: "We support PDF (best results), Word documents (.docx), Excel files (.xlsx, .xls, .csv), and plain text. Our AI extracts property data from any standard Offering Memorandum format." },
  { q: "How accurate is the analysis?", a: "Our models achieve 99.8% precision on standard NNN retail OMs. Multi-tenant and complex documents may require manual verification. We always label outputs as first-pass directional analysis." },
  { q: "Can I cancel anytime?", a: "Yes. No long-term contracts. Cancel your Pro or Pro+ subscription anytime and you'll retain access through the end of your billing period." },
  { q: "What's the difference between Pro and Pro+?", a: "Pro gives you 40 deals/month with the full workspace, scoring, maps, and Excel exports. Pro+ scales to 200 deals/month and adds Location Intelligence, advanced exports, and priority processing." },
];

const UPGRADES = [
  { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", title: "Side-by-Side Scoring", desc: "Compare every deal in your pipeline on a single scoreboard with AI-generated risk ratings." },
  { icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7", title: "Interactive Property Map", desc: "View your entire portfolio on a map with satellite imagery, market data overlays, and traffic counts." },
  { icon: "M13 10V3L4 14h7v7l9-11h-7z", title: "AI That Gets Smarter", desc: "Our models learn from every OM you upload. The more you analyze, the more accurate your underwriting becomes." },
  { icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", title: "Full Excel Workbooks", desc: "Download 6-sheet institutional-grade Excel workbooks with inputs, rent roll, operating statement, debt & returns, breakeven, and cap scenarios." },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        body, input, button, select, textarea { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        .pricing-card { transition: all 0.2s ease; }
        .pricing-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(6,8,15,0.1); }
        .upgrade-card { transition: all 0.2s ease; }
        .upgrade-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(6,8,15,0.08); }
        .faq-btn { transition: all 0.15s ease; }
        .faq-btn:hover { background: #F6F8FB !important; }
      `}</style>

      <DealSignalNav />

      <section style={{ background: "#FAFBFD", minHeight: "100vh" }}>
        {/* Hero */}
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", padding: "60px 24px 0" }}>
          <h1 style={{
            fontFamily: "'Inter', sans-serif", fontSize: 42, fontWeight: 900,
            color: "#0B1120", lineHeight: 1.15, marginBottom: 14, letterSpacing: -1,
          }}>
            Simple pricing for<br /><em style={{ fontStyle: "italic", color: "#DC2626" }}>serious underwriting.</em>
          </h1>
          <p style={{ fontSize: 16, color: "#5A7091", lineHeight: 1.7, maxWidth: 500, margin: "0 auto 48px" }}>
            Start free. Upgrade when your deal flow demands it. No contracts, cancel anytime.
          </p>
        </div>

        {/* Tier Cards */}
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px 60px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, alignItems: "start" }}>
          {TIERS.map(tier => (
            <div key={tier.name} className="pricing-card" style={{
              background: tier.highlight ? "#0B1120" : "#fff",
              borderRadius: 16, border: tier.highlight ? "2px solid #DC2626" : "1px solid #E8ECF2",
              padding: "36px 28px", position: "relative", overflow: "hidden",
            }}>
              {tier.highlight && (
                <div style={{ position: "absolute", top: 0, right: 0, background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                  Most Popular
                </div>
              )}
              {(tier as any).bestValue && (
                <div style={{ position: "absolute", top: 0, right: 0, background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                  Best Value
                </div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: tier.highlight ? "#DC2626" : "#8899B0", marginBottom: 10 }}>
                {tier.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 4 }}>
                {tier.price === "Custom" ? (
                  <span style={{ fontSize: 32, fontWeight: 800, color: tier.highlight ? "#fff" : "#0B1120" }}>Custom</span>
                ) : (
                  <>
                    <span style={{ fontSize: 16, fontWeight: 600, color: tier.highlight ? "rgba(255,255,255,0.5)" : "#8899B0" }}>$</span>
                    <span style={{ fontSize: 40, fontWeight: 800, color: tier.highlight ? "#fff" : "#0B1120", letterSpacing: -1 }}>{tier.price}</span>
                    {tier.period && <span style={{ fontSize: 14, color: tier.highlight ? "rgba(255,255,255,0.5)" : "#8899B0" }}>{tier.period}</span>}
                  </>
                )}
              </div>
              <p style={{ fontSize: 13, color: tier.highlight ? "#8899B0" : "#5A7091", marginBottom: 28, lineHeight: 1.5 }}>{tier.desc}</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {tier.features.map(f => (
                  <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: f.included ? (tier.highlight ? "#E2E8F0" : "#253352") : (tier.highlight ? "rgba(255,255,255,0.25)" : "#B4C1D1") }}>
                    {f.included ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tier.highlight ? "rgba(255,255,255,0.15)" : "#D8DFE9"} strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    )}
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>

              <Link href={tier.ctaLink} style={{
                display: "block", width: "100%", padding: "12px", textAlign: "center",
                background: tier.highlight ? "#DC2626" : "#fff",
                color: tier.highlight ? "#fff" : "#0B1120",
                border: tier.highlight ? "none" : "1.5px solid #D8DFE9",
                borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none", fontFamily: "inherit",
                boxSizing: "border-box",
              }}>
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Why Upgrade to Pro */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 60px" }}>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 30, fontWeight: 800, color: "#0B1120", marginBottom: 8, textAlign: "center", letterSpacing: -0.5 }}>
            Why upgrade to Pro?
          </h2>
          <p style={{ fontSize: 14, color: "#5A7091", lineHeight: 1.7, marginBottom: 40, textAlign: "center", maxWidth: 560, margin: "0 auto 40px" }}>
            Free gives you a taste. Pro gives you the full institutional toolkit.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {UPGRADES.map(u => (
              <div key={u.title} className="upgrade-card" style={{
                background: "#fff", borderRadius: 12, border: "1px solid #E8ECF2", padding: "28px 24px",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: "#FEF2F2",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={u.icon} /></svg>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0B1120", marginBottom: 6 }}>{u.title}</h3>
                <p style={{ fontSize: 13, color: "#5A7091", lineHeight: 1.6, margin: 0 }}>{u.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px 60px" }}>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 800, color: "#0B1120", marginBottom: 28, textAlign: "center", letterSpacing: -0.5 }}>
            Frequently Asked Questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E8ECF2", overflow: "hidden" }}>
                <button
                  className="faq-btn"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between",
                    alignItems: "center", background: "transparent", border: "none", cursor: "pointer",
                    fontSize: 14, fontWeight: 600, color: "#0B1120", textAlign: "left", fontFamily: "inherit",
                  }}
                >
                  {faq.q}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8899B0" strokeWidth="2" style={{ flexShrink: 0, transform: openFaq === i ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div style={{ padding: "0 20px 16px", fontSize: 13, color: "#5A7091", lineHeight: 1.7 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", padding: "20px 24px 80px" }}>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 26, fontWeight: 800, color: "#0B1120", marginBottom: 14, letterSpacing: -0.5 }}>
            Ready to underwrite smarter?
          </h2>
          <p style={{ fontSize: 14, color: "#5A7091", marginBottom: 24 }}>Start with a free analysis. No credit card required.</p>
          <Link href="/om-analyzer" style={{
            display: "inline-block", padding: "14px 36px", background: "#DC2626", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, textDecoration: "none", fontFamily: "inherit",
          }}>
            Analyze Your First Deal
          </Link>
        </div>
      </section>

      <DealSignalFooter />
    </>
  );
}
