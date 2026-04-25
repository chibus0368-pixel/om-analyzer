"use client";

import Link from "next/link";
import DealSignalNav from "@/components/DealSignalNav";

/**
 * Public pricing page. Marketing-friendly URL (/pricing) shareable in
 * emails, sales conversations, and external links.
 *
 * Plans here mirror the in-workspace /workspace/upgrade page. Source of
 * truth for plan numbers is src/lib/stripe/config.ts; if you change limits
 * there, update them here too.
 */
export default function PricingPage() {
  return (
    <div style={{ background: "#0d0d14", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <DealSignalNav />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "100px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{
            fontSize: 44, fontWeight: 800, letterSpacing: -0.8,
            margin: "0 0 14px",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            Plans built for how you actually source deals
          </h1>
          <p style={{ fontSize: 16, color: "#9ca3af", maxWidth: 620, margin: "0 auto", lineHeight: 1.6 }}>
            Drop in an OM, get an institutional-grade first pass in under 60 seconds.
            Start free, upgrade when you need higher volume.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          <PlanCard
            name="Trial"
            price="Free"
            cadence="2 deals total"
            ctaLabel="Try it now"
            ctaHref="/om-analyzer"
            features={[
              "2 free deal analyses",
              "Full Pro property page",
              "Brief + XLS downloads",
              "No credit card required",
            ]}
          />
          <PlanCard
            name="Free"
            price="$0"
            cadence="7 deals per month"
            ctaLabel="Sign up free"
            ctaHref="/workspace/login?mode=register"
            highlight
            features={[
              "7 deal analyses per month",
              "Save deals to your workspace",
              "Brief + XLS downloads",
              "Deal Signals scoring",
            ]}
          />
          <PlanCard
            name="Pro"
            price="$40"
            cadence="100 deals per month"
            ctaLabel="Start 7-day free trial"
            ctaHref="/workspace/login?upgrade=pro"
            features={[
              "100 deal analyses per month",
              "Pro DealBoard with history",
              "Interactive property map",
              "White-label shareable links",
              "Location Intelligence",
              "Priority processing",
            ]}
          />
        </div>

        <div style={{ textAlign: "center", marginTop: 48, fontSize: 13, color: "#6b7280" }}>
          Need more than 100 analyses per month?{" "}
          <Link href="/contact" style={{ color: "#84CC16", textDecoration: "none" }}>
            Talk to us about Pro+
          </Link>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  name, price, cadence, features, ctaLabel, ctaHref, highlight,
}: {
  name: string;
  price: string;
  cadence: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlight?: boolean;
}) {
  return (
    <div style={{
      background: highlight ? "linear-gradient(180deg, rgba(132,204,22,0.08), rgba(22,22,31,0.4))" : "#16161f",
      border: highlight ? "2px solid #84CC16" : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: "28px 24px",
      display: "flex", flexDirection: "column", gap: 18,
      position: "relative",
      boxShadow: highlight ? "0 12px 40px rgba(132,204,22,0.15)" : "0 4px 16px rgba(0,0,0,0.3)",
    }}>
      {highlight && (
        <div style={{
          position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
          background: "#84CC16", color: "#FFFFFF",
          fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase",
          padding: "4px 12px", borderRadius: 999,
        }}>
          Most popular
        </div>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.6 }}>
          {name}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: "#FFFFFF", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {price}
          </span>
          {price !== "Free" && (
            <span style={{ fontSize: 14, color: "#9ca3af" }}>/month</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: "#84CC16", marginTop: 4, fontWeight: 600 }}>
          {cadence}
        </div>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {features.map((f, i) => (
          <li key={i} style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.5, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span aria-hidden style={{ color: "#84CC16", fontWeight: 800, flexShrink: 0 }}>&#10003;</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        style={{
          marginTop: "auto", padding: "12px 16px", borderRadius: 10,
          background: highlight ? "#84CC16" : "rgba(255,255,255,0.06)",
          color: highlight ? "#0d0d14" : "#FFFFFF",
          fontSize: 13, fontWeight: 700, textAlign: "center", textDecoration: "none",
          border: highlight ? "none" : "1px solid rgba(255,255,255,0.12)",
          letterSpacing: 0.3,
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
