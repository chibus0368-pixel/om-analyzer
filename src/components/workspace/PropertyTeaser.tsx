"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────── */
interface TeaserData {
  id: string;
  propertyName: string;
  heroImageUrl: string | null;
  analysisType: string;
  brief: string | null;
  overallScore: number | null;
  scoreBreakdown: Record<string, number> | null;
  fields: any[];
  totalFieldCount: number;
}

/* ── Design tokens (matches PropertyDetailClient) ──────── */
const C = {
  primary: "#4D7C0F",
  onSurface: "#0F172A",
  secondary: "#6B7280",
  bg: "#F7F8FA",
  surfLow: "#F3F4F6",
  surfLowest: "#ffffff",
  radius: 12,
};

const ANALYSIS_COLORS: Record<string, string> = {
  retail: "#4D7C0F",
  industrial: "#2563EB",
  office: "#7C3AED",
  land: "#D97706",
};

/* ── Helpers ───────────────────────────────────────────── */
function gf(fields: any[], group: string, name: string): any {
  const f = fields.find((x: any) => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

function fmt$(val: any): string {
  const n = Number(val);
  if (!n || isNaN(n)) return "";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + Math.round(n).toLocaleString();
  return "$" + n.toFixed(2);
}

function scoreColor(score: number | null): string {
  if (!score) return "#9CA3AF";
  if (score >= 75) return "#059669";
  if (score >= 50) return "#D97706";
  return "#DC2626";
}

function signalBadge(val: string): { color: string; bg: string } {
  const v = String(val || "").toLowerCase();
  if (v.includes("green") || v.includes("strong")) return { color: "#059669", bg: "#F0FDF4" };
  if (v.includes("yellow") || v.includes("moderate") || v.includes("fair")) return { color: "#D97706", bg: "#FFFBEB" };
  if (v.includes("red") || v.includes("weak") || v.includes("poor")) return { color: "#DC2626", bg: "#FEF2F2" };
  return { color: "#6B7280", bg: "#F3F4F6" };
}

/* ── Signup Modal ──────────────────────────────────────── */
function SignupModal({ onClose, propertyName }: { onClose: () => void; propertyName: string }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: "#ffffff", borderRadius: 16, maxWidth: 480, width: "100%",
        padding: "36px 32px", position: "relative",
        boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
      }}>
        {/* Close button */}
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14,
          background: "none", border: "none", cursor: "pointer",
          color: "#9CA3AF", fontSize: 20, lineHeight: 1, padding: 4,
        }}>&times;</button>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 32 }} />
        </div>

        {/* Headline */}
        <h2 style={{
          fontSize: 22, fontWeight: 700, color: "#111827",
          textAlign: "center", margin: "0 0 8px 0", lineHeight: 1.3,
        }}>
          See the full analysis
        </h2>
        <p style={{
          fontSize: 14, color: "#6B7280", textAlign: "center",
          margin: "0 0 24px 0", lineHeight: 1.5,
        }}>
          Sign up free to unlock the complete investment brief, download the underwriting workbook, and run your own deals through DealSignals.
        </p>

        {/* What DealSignals does */}
        <div style={{
          background: "#F9FAFB", borderRadius: 10, padding: "14px 16px",
          marginBottom: 24, fontSize: 13, color: "#374151", lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "#111827", fontSize: 14 }}>
            What you get with DealSignals:
          </div>
          {[
            "Upload any OM, rent roll, or broker flyer",
            "AI extracts financials and scores the deal in 60 seconds",
            "Scored investment briefs with buy/hold/pass signals",
            "Downloadable underwriting workbook with sensitivity analysis",
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <span style={{ color: "#84CC16", fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <Link href="/workspace/login?signup=true" style={{
          display: "block", textAlign: "center", textDecoration: "none",
          background: "#84CC16", color: "#FFFFFF", fontWeight: 700,
          padding: "13px 24px", borderRadius: 10, fontSize: 15,
          marginBottom: 10,
        }}>
          Start Free Trial
        </Link>
        <Link href="/workspace/login" style={{
          display: "block", textAlign: "center", textDecoration: "none",
          background: "#F3F4F6", color: "#374151", fontWeight: 600,
          padding: "11px 24px", borderRadius: 10, fontSize: 14,
        }}>
          Already have an account? Log in
        </Link>

        {/* Landing page link */}
        <p style={{
          textAlign: "center", marginTop: 16, fontSize: 12, color: "#9CA3AF",
        }}>
          <Link href="/" style={{ color: "#6B7280", textDecoration: "underline" }}>
            Learn more about DealSignals
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ── Main Teaser Component ─────────────────────────────── */
export default function PropertyTeaser() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;

  const [data, setData] = useState<TeaserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Fetch public teaser data
  useEffect(() => {
    if (!propertyId) return;
    fetch(`/api/public/property/${propertyId}`)
      .then(r => {
        if (!r.ok) throw new Error("Property not found");
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [propertyId]);

  // Show modal after 4 seconds
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => setShowModal(true), 4000);
    return () => clearTimeout(timer);
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "#6B7280" }}>
        <div style={{
          width: 32, height: 32,
          border: "3px solid rgba(0,0,0,0.08)", borderTopColor: "#4D7C0F",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
          margin: "0 auto 12px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Loading deal...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "#6B7280" }}>
        <h2 style={{ fontSize: 20, color: "#111827", marginBottom: 8 }}>Property not found</h2>
        <p>This property may have been removed or the link may be invalid.</p>
        <Link href="/" style={{
          display: "inline-block", marginTop: 20,
          background: "#84CC16", color: "#FFFFFF", fontWeight: 600,
          padding: "10px 20px", borderRadius: 8, textDecoration: "none",
        }}>Go to DealSignals</Link>
      </div>
    );
  }

  const fields = data.fields || [];
  const typeColor = ANALYSIS_COLORS[data.analysisType] || C.primary;

  // Extract key metrics
  const askPrice = gf(fields, "pricing_deal_terms", "asking_price");
  const capRate = gf(fields, "pricing_deal_terms", "cap_rate_om");
  const noiOm = gf(fields, "expenses", "noi_om");
  const noiAdj = gf(fields, "expenses", "noi_adjusted");
  const occ = gf(fields, "property_basics", "occupancy_pct");
  const sf = gf(fields, "property_basics", "building_sf");
  const yearBuilt = gf(fields, "property_basics", "year_built");
  const tenantCount = gf(fields, "property_basics", "tenant_count");
  const city = gf(fields, "property_basics", "city");
  const state = gf(fields, "property_basics", "state");
  const address = gf(fields, "property_basics", "address");
  const dscrOm = gf(fields, "debt_assumptions", "dscr_om");
  const priceSf = gf(fields, "pricing_deal_terms", "price_per_sf");

  // Signals
  const overallSignal = gf(fields, "signals", "overall_signal");
  const capSignal = gf(fields, "signals", "cap_rate_signal");
  const dscrSignal = gf(fields, "signals", "dscr_signal");
  const occSignal = gf(fields, "signals", "occupancy_signal");
  const recommendation = gf(fields, "signals", "recommendation");

  const location = [address, city, state].filter(Boolean).join(", ");
  const typeLabel = data.analysisType === "retail" ? "Retail" : data.analysisType === "industrial" ? "Industrial" : data.analysisType === "office" ? "Office" : "Land";

  // Parse brief
  let briefOverview = "";
  try {
    const bObj = JSON.parse(data.brief || "{}");
    if (bObj.overview) briefOverview = bObj.overview;
  } catch {
    briefOverview = String(data.brief || "");
  }

  // Score display
  const score = data.overallScore;

  // Build metric cards
  const metricCards: { label: string; value: string; signal?: string }[] = [];
  if (askPrice) metricCards.push({ label: "Asking Price", value: fmt$(askPrice) });
  if (capRate) metricCards.push({ label: "Cap Rate", value: Number(capRate).toFixed(2) + "%", signal: capSignal });
  if (noiOm) metricCards.push({ label: "NOI (OM)", value: fmt$(noiOm) });
  if (noiAdj) metricCards.push({ label: "NOI (Adjusted)", value: fmt$(noiAdj) });
  if (occ) metricCards.push({ label: "Occupancy", value: occ + "%", signal: occSignal });
  if (dscrOm) metricCards.push({ label: "DSCR", value: Number(dscrOm).toFixed(2) + "x", signal: dscrSignal });
  if (priceSf) metricCards.push({ label: "Price/SF", value: "$" + Number(priceSf).toFixed(0) });
  if (sf) metricCards.push({ label: "Building SF", value: Math.round(Number(sf)).toLocaleString() });

  return (
    <div style={{ background: "#F7F8FA", minHeight: "100vh" }}>
      {/* Mobile-responsive styles */}
      <style>{`
        .teaser-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }
        .teaser-metric-card {
          background: #ffffff;
          border-radius: 10px;
          padding: 14px 16px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .teaser-metric-label {
          font-size: 11px;
          color: #9CA3AF;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 4px;
        }
        .teaser-metric-value {
          font-size: 18px;
          font-weight: 700;
          color: #111827;
        }
        .teaser-metric-signal {
          font-size: 11px;
          font-weight: 600;
          margin-top: 2px;
        }
        .teaser-hero-img { height: 220px; }
        .teaser-prop-name { font-size: 24px; }
        .teaser-summary-text { font-size: 14px; }
        .teaser-content-pad { padding: 24px 20px 40px; }
        @media (max-width: 600px) {
          .teaser-metrics-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
          .teaser-metric-card {
            padding: 10px 12px;
            border-radius: 8px;
          }
          .teaser-metric-label {
            font-size: 9px;
            margin-bottom: 2px;
            letter-spacing: 0.03em;
          }
          .teaser-metric-value {
            font-size: 14px;
          }
          .teaser-metric-signal {
            font-size: 9px;
          }
          .teaser-hero-img { height: 160px; }
          .teaser-prop-name { font-size: 20px; }
          .teaser-summary-text { font-size: 13px; }
          .teaser-content-pad { padding: 16px 14px 32px; }
        }
      `}</style>

      {/* Nav bar */}
      <div style={{
        background: "#0d0d14", padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/">
          <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 28 }} />
        </Link>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/workspace/login" style={{
            color: "#e0e0e6", fontSize: 13, fontWeight: 600,
            textDecoration: "none", padding: "7px 14px",
          }}>Log in</Link>
          <Link href="/workspace/login?signup=true" style={{
            background: "#84CC16", color: "#FFFFFF", fontSize: 13, fontWeight: 700,
            textDecoration: "none", padding: "7px 16px", borderRadius: 8,
          }}>Sign up free</Link>
        </div>
      </div>

      {/* Hero section */}
      <div className="teaser-content-pad" style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Property header */}
        <div style={{
          background: "#ffffff", borderRadius: 14, overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 20,
        }}>
          {/* Hero image */}
          {data.heroImageUrl && (
            <div className="teaser-hero-img" style={{
              background: `url(${data.heroImageUrl}) center/cover no-repeat`,
              position: "relative",
            }}>
              <div style={{
                position: "absolute", bottom: 12, left: 14,
                background: typeColor, color: "#fff",
                padding: "4px 12px", borderRadius: 6, fontSize: 12,
                fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
              }}>{typeLabel}</div>
            </div>
          )}

          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <h1 className="teaser-prop-name" style={{
                  fontWeight: 700, color: "#111827",
                  margin: "0 0 4px 0", lineHeight: 1.3,
                }}>{data.propertyName}</h1>
                {location && (
                  <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>{location}</p>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {yearBuilt && <span style={{
                    fontSize: 12, color: "#6B7280", background: "#F3F4F6",
                    padding: "3px 8px", borderRadius: 4,
                  }}>Built {yearBuilt}</span>}
                  {tenantCount && <span style={{
                    fontSize: 12, color: "#6B7280", background: "#F3F4F6",
                    padding: "3px 8px", borderRadius: 4,
                  }}>{tenantCount} tenant{Number(tenantCount) > 1 ? "s" : ""}</span>}
                  {sf && <span style={{
                    fontSize: 12, color: "#6B7280", background: "#F3F4F6",
                    padding: "3px 8px", borderRadius: 4,
                  }}>{Math.round(Number(sf)).toLocaleString()} SF</span>}
                </div>
              </div>

              {/* Score circle */}
              {score != null && (
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  border: `4px solid ${scoreColor(score)}`,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: scoreColor(score), lineHeight: 1 }}>
                    {Math.round(score)}
                  </span>
                  <span style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" }}>Score</span>
                </div>
              )}
            </div>

            {/* Overall signal + recommendation */}
            {(overallSignal || recommendation) && (
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {overallSignal && (() => {
                  const s = signalBadge(overallSignal);
                  return <span style={{
                    fontSize: 12, fontWeight: 700, color: s.color, background: s.bg,
                    padding: "4px 10px", borderRadius: 6,
                  }}>{overallSignal}</span>;
                })()}
                {recommendation && (() => {
                  const s = signalBadge(recommendation);
                  return <span style={{
                    fontSize: 12, fontWeight: 700, color: s.color, background: s.bg,
                    padding: "4px 10px", borderRadius: 6,
                  }}>{recommendation}</span>;
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics grid */}
        {metricCards.length > 0 && (
          <div className="teaser-metrics-grid">
            {metricCards.map((m, i) => {
              const s = m.signal ? signalBadge(m.signal) : null;
              return (
                <div key={i} className="teaser-metric-card" style={{
                  borderLeft: s ? `3px solid ${s.color}` : "3px solid #E5E7EB",
                }}>
                  <div className="teaser-metric-label">{m.label}</div>
                  <div className="teaser-metric-value">{m.value}</div>
                  {s && <div className="teaser-metric-signal" style={{ color: s.color }}>{m.signal}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Executive summary */}
        {briefOverview && (
          <div style={{
            background: "#ffffff", borderRadius: 12, padding: "20px 24px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)", marginBottom: 20,
          }}>
            <h2 style={{
              fontSize: 13, fontWeight: 700, color: "#374151",
              textTransform: "uppercase", letterSpacing: "0.06em",
              margin: "0 0 10px 0",
            }}>Executive Summary</h2>
            <p className="teaser-summary-text" style={{
              color: "#374151", lineHeight: 1.65, margin: 0,
            }}>{briefOverview.length > 800 ? briefOverview.slice(0, 800) + "..." : briefOverview}</p>
          </div>
        )}

        {/* Locked content indicator */}
        <div style={{
          background: "#ffffff", borderRadius: 12, padding: "28px 24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)", textAlign: "center",
          border: "1px dashed #D1D5DB",
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#128274;</div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: "0 0 6px 0" }}>
            Full analysis available with a free account
          </h3>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 18px 0", lineHeight: 1.5 }}>
            Tenant rollover detail, cap rate scenarios, breakeven analysis,
            downloadable investment brief, underwriting workbook, and more.
          </p>
          <Link href="/workspace/login?signup=true" style={{
            display: "inline-block", textDecoration: "none",
            background: "#84CC16", color: "#FFFFFF", fontWeight: 700,
            padding: "12px 28px", borderRadius: 10, fontSize: 15,
          }}>
            Sign Up Free
          </Link>
          <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>
            <Link href="/" style={{ color: "#6B7280", textDecoration: "underline" }}>
              Learn more about DealSignals
            </Link>
          </p>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "24px 0 12px", color: "#9CA3AF", fontSize: 11 }}>
          <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 18, marginBottom: 6, display: "block", margin: "0 auto 6px" }} />
          AI-powered CRE pre-diligence &middot; <a href="https://www.dealsignals.app" style={{ color: "#6B7280" }}>www.dealsignals.app</a>
        </div>
      </div>

      {/* Signup modal */}
      {showModal && <SignupModal onClose={() => setShowModal(false)} propertyName={data.propertyName} />}
    </div>
  );
}
