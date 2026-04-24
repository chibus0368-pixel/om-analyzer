"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspaceAuth } from "@/lib/workspace/auth";

/**
 * /workspace/upgrade
 *
 * Workspace-internal upgrade page. Light theme to match the rest of the
 * workspace shell. Same plan structure and CTA logic as the marketing
 * pricing module on /om-analyzer#pricing - just visually adapted to the
 * workspace.
 *
 * Source of truth for plan numbers is src/lib/stripe/config.ts. If you
 * edit copy here, also edit it in the marketing pricing section.
 */
export default function WorkspaceUpgradePage() {
  const router = useRouter();
  const { user, loading } = useWorkspaceAuth();
  const [tier, setTier] = useState<string>("free");
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/workspace/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/workspace/usage", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setTier(data.tier || "free");
            setUsage({ used: data.uploadsUsed || 0, limit: data.uploadLimit || 0 });
          }
        }
      } catch (err) {
        console.error("[upgrade] usage fetch failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading, router]);

  const isAnon = tier === "anonymous";

  async function startProCheckout(targetTier: "pro" | "pro_plus") {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier: targetTier }),
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
      else alert(data?.error || "Couldn't start checkout. Please try again.");
    } catch (err: any) {
      alert("Checkout failed: " + (err?.message || "unknown"));
    }
  }

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100vh", color: "#0F172A", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @media (max-width: 900px) {
          .ws-up-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 32px 80px" }}>
        {/* Trial usage banner - only when on the anonymous tier */}
        {isAnon && usage && (
          <div style={{
            background: "linear-gradient(135deg, rgba(132,204,22,0.12), rgba(132,204,22,0.04))",
            border: "1px solid rgba(132,204,22,0.4)",
            borderRadius: 14,
            padding: "16px 20px",
            marginBottom: 32,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: "rgba(132,204,22,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4D7C0F" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4D7C0F", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 2 }}>
                You're on Trial
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>
                {usage.used} of {usage.limit} free analyses used. Sign up to keep your work and get 5 more per month.
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{
            fontSize: 38, fontWeight: 800, color: "#0F172A",
            margin: "0 0 12px",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            letterSpacing: -0.6,
          }}>
            {isAnon ? "Sign up to keep going" : "Plans built for how you actually source deals"}
          </h1>
          <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.7, maxWidth: 580, margin: "0 auto" }}>
            DealSignals turns OMs into actionable investment insight in under 60 seconds.
            Start free, upgrade when your deal flow grows.
          </p>
        </div>

        {/* 3-tier pricing grid */}
        <div className="ws-up-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginBottom: 48 }}>
          {[
            {
              key: "free" as const,
              name: "Free",
              price: "0",
              period: "",
              desc: "Try DealSignals on real deals.",
              valueCallout: undefined as string | undefined,
              features: [
                { text: "7 deal analyses per month", included: true },
                { text: "Save deals to workspace", included: true },
                { text: "Deal Signals scoring", included: true },
                { text: "Downloadable XLS worksheets of analysis", included: true },
                { text: "First-pass brief download", included: true },
                { text: "Interactive property map", included: false },
                { text: "Deal comparison scoreboard", included: false },
                { text: "Location Intelligence", included: false },
              ],
              highlight: false,
              bestValue: false,
            },
            {
              key: "pro" as const,
              name: "Pro",
              price: "40",
              period: "/mo",
              desc: "For active investors moving fast on deals.",
              valueCallout: "7-day free trial · Less than 50¢ per deal",
              features: [
                { text: "100 deal analyses/month", included: true },
                { text: "Bulk portfolio uploads", included: true },
                { text: "Save deals to workspace", included: true },
                { text: "Deal Signals scoring", included: true },
                { text: "Downloadable XLS worksheets of analysis", included: true },
                { text: "First-pass brief download", included: true },
                { text: "Pro DealBoard with history", included: true },
                { text: "Interactive property map", included: true },
                { text: "Deal comparison scoreboard", included: true },
                { text: "Location Intelligence", included: true },
                { text: "White-label shareable links", included: true },
              ],
              highlight: true,
              bestValue: false,
            },
            {
              key: "pro_plus" as const,
              name: "Pro+",
              price: "100",
              period: "/mo",
              desc: "For high-volume deal flow and serious operators.",
              valueCallout: "7-day free trial · 20¢ per deal",
              features: [
                { text: "500 deal analyses/month", included: true },
                { text: "Everything in Pro", included: true },
                { text: "Chrome extension: add deals from Crexi, CoStar, LoopNet", included: true },
                { text: "Priority processing queue", included: true },
                { text: "Priority support", included: true },
                { text: "Custom branding", included: true },
              ],
              highlight: false,
              bestValue: true,
            },
          ].map(plan => {
            const isCurrent = tier === plan.key;
            const rank: Record<string, number> = { anonymous: -1, free: 0, pro: 1, pro_plus: 2 };
            const userRank = rank[tier] ?? -1;
            const tierRank = rank[plan.key];
            const isUpgradeTarget = userRank >= 0 && tierRank > userRank;
            const isDowngradeTarget = userRank >= 0 && tierRank < userRank;

            // CTA logic - every state has an explicit branch so we don't
            // accidentally fall through to a generic "Sign Up Free" link
            // for a logged-in user (the previous bug that bounced them
            // back to the dealboard).
            let ctaLabel = "";
            let ctaHref: string | null = null;
            let ctaOnClick: (() => void) | undefined = undefined;

            if (isCurrent) {
              ctaLabel = "Manage plan";
              ctaHref = "/workspace/profile?tab=account";
            } else if (plan.key === "free") {
              if (isAnon) {
                ctaLabel = "Sign up free";
                ctaHref = "/workspace/login?signup=1";
              } else {
                // Already on a higher tier - downgrade goes through profile.
                ctaLabel = "Switch to Free";
                ctaHref = "/workspace/profile?tab=account";
              }
            } else {
              // Pro or Pro+
              if (isAnon) {
                ctaLabel = `Sign up to start ${plan.name}`;
                ctaHref = `/workspace/login?signup=1&upgrade=${plan.key}`;
              } else if (isDowngradeTarget) {
                ctaLabel = `Switch to ${plan.name}`;
                ctaHref = "/workspace/profile?tab=account";
              } else {
                // Free user upgrading or Pro user going to Pro+ - Stripe checkout.
                ctaLabel = isUpgradeTarget ? `Upgrade to ${plan.name}` : `Start 7-day free trial`;
                ctaHref = null;
                ctaOnClick = () => startProCheckout(plan.key);
              }
            }

            const accent = "#4D7C0F";
            const accentLight = "#F0FDF4";

            return (
              <div key={plan.name} style={{
                background: "#FFFFFF",
                borderRadius: 16,
                border: isCurrent
                  ? `2px solid ${accent}`
                  : plan.highlight ? `2px solid ${accent}` : "1px solid #E5E7EB",
                padding: "32px 26px",
                position: "relative",
                overflow: "hidden",
                transition: "all 0.2s ease",
                boxShadow: isCurrent || plan.highlight
                  ? "0 12px 32px rgba(77,124,15,0.12)"
                  : "0 2px 8px rgba(15,23,43,0.04)",
                display: "flex", flexDirection: "column",
              }}>
                {/* Top-right badge */}
                {isCurrent && (
                  <div style={{ position: "absolute", top: 0, right: 0, background: accent, color: "#FFFFFF", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    Your current plan
                  </div>
                )}
                {!isCurrent && plan.highlight && (
                  <div style={{ position: "absolute", top: 0, right: 0, background: accent, color: "#FFFFFF", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    Most Popular
                  </div>
                )}
                {!isCurrent && plan.bestValue && (
                  <div style={{ position: "absolute", top: 0, right: 0, background: "#0F172A", color: "#FFFFFF", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    Best Value
                  </div>
                )}

                {/* Tier eyebrow */}
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.4, color: plan.highlight || isCurrent ? accent : "#6B7280", marginBottom: 12 }}>
                  {plan.name}
                </div>

                {/* Price */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#9CA3AF" }}>$</span>
                  <span style={{ fontSize: 44, fontWeight: 800, color: "#0F172A", letterSpacing: -1.2, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{plan.price}</span>
                  {plan.period && <span style={{ fontSize: 14, color: "#9CA3AF", marginLeft: 2 }}>{plan.period}</span>}
                </div>

                <p style={{ fontSize: 13, color: "#6B7280", marginBottom: plan.valueCallout ? 10 : 24, lineHeight: 1.5 }}>{plan.desc}</p>

                {plan.valueCallout && !isCurrent && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: accent,
                    background: accentLight, padding: "6px 10px", borderRadius: 6,
                    marginBottom: 18, letterSpacing: 0.2,
                    border: "1px solid rgba(77,124,15,0.15)",
                    display: "inline-block",
                  }}>
                    {plan.valueCallout}
                  </div>
                )}

                {/* Feature list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, flex: 1 }}>
                  {plan.features.map(f => (
                    <div key={f.text} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: f.included ? "#374151" : "#CBD5E1", lineHeight: 1.5 }}>
                      {f.included ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}><path d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E5E7EB" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><path d="M18 6L6 18M6 6l12 12" /></svg>
                      )}
                      <span>{f.text}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                {ctaHref ? (
                  <Link href={ctaHref} prefetch={false} style={{
                    display: "block", width: "100%", padding: "12px 16px", textAlign: "center",
                    background: isCurrent ? "#FFFFFF" : plan.highlight ? accent : "#FFFFFF",
                    color: isCurrent ? accent : plan.highlight ? "#FFFFFF" : accent,
                    border: isCurrent ? `1.5px solid ${accent}` : plan.highlight ? "none" : `1.5px solid ${accent}`,
                    borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none", fontFamily: "inherit",
                    boxSizing: "border-box", transition: "all 0.15s ease",
                  }}>
                    {ctaLabel}
                  </Link>
                ) : (
                  <button onClick={ctaOnClick} style={{
                    display: "block", width: "100%", padding: "12px 16px", textAlign: "center",
                    background: plan.highlight ? accent : "#FFFFFF",
                    color: plan.highlight ? "#FFFFFF" : accent,
                    border: plan.highlight ? "none" : `1.5px solid ${accent}`,
                    borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                    cursor: "pointer", boxSizing: "border-box", transition: "all 0.15s ease",
                  }}>
                    {ctaLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: "center", fontSize: 13, color: "#6B7280" }}>
          Need more than 500 analyses per month?{" "}
          <Link href="/contact" style={{ color: "#4D7C0F", textDecoration: "none", fontWeight: 700 }}>
            Talk to us about Enterprise &rarr;
          </Link>
        </p>
      </div>
    </div>
  );
}
