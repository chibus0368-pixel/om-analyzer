"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspaceAuth } from "@/lib/workspace/auth";

/**
 * /workspace/upgrade
 *
 * Workspace-internal upgrade page. Mirrors the pricing module on
 * /om-analyzer#pricing exactly - dark theme, gradient orbs, three-tier
 * grid with smart per-tier CTA logic. Source of truth for plan numbers
 * is src/lib/stripe/config.ts. If you edit copy here, also edit it in
 * the marketing pricing section.
 */
export default function WorkspaceUpgradePage() {
  const router = useRouter();
  const { user, loading } = useWorkspaceAuth();
  const [tier, setTier] = useState<string>("free");
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

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
      } finally {
        if (!cancelled) setUsageLoading(false);
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
    <div style={{ background: "#0d0d14", minHeight: "100vh", color: "#FFFFFF", fontFamily: "'Inter', system-ui, sans-serif", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @media (max-width: 900px) {
          .ws-up-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
      `}</style>

      {/* Gradient orb */}
      <div style={{
        position: "absolute", top: -200, right: -100,
        width: 500, height: 500, borderRadius: "50%",
        background: "rgba(132,204,22,0.1)", filter: "blur(128px)",
        pointerEvents: "none", zIndex: 0,
      }} />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 32px 80px", position: "relative", zIndex: 1 }}>
        {/* Trial usage banner - only when on the anonymous tier */}
        {isAnon && usage && (
          <div style={{
            background: "rgba(132,204,22,0.08)",
            border: "1px solid rgba(132,204,22,0.3)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 32,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>
                You're on Trial
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>
                {usage.used} of {usage.limit} free analyses used. Sign up free for 5 more per month.
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 56, position: "relative", zIndex: 1 }}>
          <h1 style={{
            fontSize: 38, fontWeight: 800, color: "#FFFFFF",
            margin: "0 0 12px",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            letterSpacing: -0.6,
          }}>
            {isAnon ? "Sign up to keep going" : "Start free. Scale as your deal flow grows."}
          </h1>
          <p style={{ fontSize: 14, color: "#5A7091", lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
            DealSignals turns deals and OMs into actionable investment insight, powering faster pre-diligence decisions.
          </p>
        </div>

        {/* 3-tier pricing grid - mirrors /om-analyzer#pricing */}
        <div className="ws-up-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 60 }}>
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
              defaultCta: "Sign Up Free",
              defaultHref: "/workspace/login?signup=1",
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
              defaultCta: "Start 7-Day Free Trial",
              defaultHref: "#",
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
                { text: "Chrome extension: add deals right from Crexi, CoStar, and LoopNet", included: true },
                { text: "Priority processing queue", included: true },
                { text: "Priority support", included: true },
                { text: "Custom branding", included: true },
              ],
              defaultCta: "Start 7-Day Free Trial",
              defaultHref: "#",
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

            // CTA logic mirrors marketing pricing module
            let ctaLabel = plan.defaultCta;
            let ctaHref: string | null = plan.defaultHref;
            let ctaOnClick: (() => void) | undefined = undefined;

            if (isCurrent) {
              ctaLabel = "Manage plan";
              ctaHref = "/workspace/profile?tab=account";
            } else if (plan.key === "pro" || plan.key === "pro_plus") {
              // Stripe checkout for paid tiers when the user already has an account
              if (isAnon) {
                ctaLabel = `Sign up &middot; ${plan.name}`;
                ctaHref = `/workspace/login?signup=1&upgrade=${plan.key}`;
              } else {
                ctaLabel = isUpgradeTarget ? `Upgrade to ${plan.name}` : isDowngradeTarget ? "Switch plan" : `Start 7-Day Free Trial`;
                ctaHref = null;
                ctaOnClick = () => startProCheckout(plan.key);
              }
            } else if (plan.key === "free" && isAnon) {
              ctaLabel = "Sign Up Free";
              ctaHref = "/workspace/login?signup=1";
            }

            return (
              <div key={plan.name} style={{
                background: isCurrent ? "rgba(132,204,22,0.08)" : "rgba(22,22,31,0.6)",
                backdropFilter: "blur(10px)",
                borderRadius: 16,
                border: isCurrent
                  ? "1px solid rgba(132,204,22,0.6)"
                  : plan.highlight ? "1px solid rgba(132,204,22,0.4)" : "1px solid rgba(255,255,255,0.06)",
                padding: "36px 28px",
                position: "relative",
                overflow: "hidden",
                transition: "all 0.25s ease",
                boxShadow: isCurrent
                  ? "0 0 40px rgba(132,204,22,0.18)"
                  : plan.highlight ? "0 0 40px rgba(132,204,22,0.1)" : "none",
              }}>
                {/* Top-right badge */}
                {isCurrent && (
                  <div style={{ position: "absolute", top: 0, right: 0, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    Your current plan
                  </div>
                )}
                {!isCurrent && plan.highlight && (
                  <div style={{ position: "absolute", top: 0, right: 0, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    Most Popular
                  </div>
                )}
                {!isCurrent && plan.bestValue && (
                  <div style={{ position: "absolute", top: 0, right: 0, background: "#84CC16", color: "#0d0d14", fontSize: 10, fontWeight: 700, padding: "4px 14px", borderBottomLeftRadius: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    Best Value
                  </div>
                )}

                {/* Tier eyebrow */}
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: plan.highlight || isCurrent ? "#84CC16" : "#9ca3af", marginBottom: 10 }}>
                  {plan.name}
                </div>

                {/* Price */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>$</span>
                  <span style={{ fontSize: 40, fontWeight: 800, color: "#ffffff", letterSpacing: -1 }}>{plan.price}</span>
                  {plan.period && <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{plan.period}</span>}
                </div>

                <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: plan.valueCallout ? 10 : 28, lineHeight: 1.5 }}>{plan.desc}</p>

                {plan.valueCallout && !isCurrent && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#84CC16", marginBottom: 20, letterSpacing: 0.3 }}>
                    {plan.valueCallout}
                  </div>
                )}

                {/* Feature list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                  {plan.features.map(f => (
                    <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: f.included ? "#e2e8f0" : "rgba(255,255,255,0.3)" }}>
                      {f.included ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      )}
                      <span>{f.text}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                {ctaHref ? (
                  <Link href={ctaHref} style={{
                    display: "block", width: "100%", padding: "12px", textAlign: "center",
                    background: isCurrent ? "rgba(132,204,22,0.18)" : plan.highlight ? "#84CC16" : "rgba(132,204,22,0.12)",
                    color: isCurrent ? "#84CC16" : plan.highlight ? "#0d0d14" : "#84CC16",
                    border: isCurrent ? "1px solid rgba(132,204,22,0.5)" : plan.highlight ? "none" : "1px solid rgba(132,204,22,0.3)",
                    borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none", fontFamily: "inherit",
                    boxSizing: "border-box", transition: "all 0.2s ease",
                  }} dangerouslySetInnerHTML={{ __html: ctaLabel }} />
                ) : (
                  <button onClick={ctaOnClick} style={{
                    display: "block", width: "100%", padding: "12px", textAlign: "center",
                    background: plan.highlight ? "#84CC16" : "rgba(132,204,22,0.12)",
                    color: plan.highlight ? "#0d0d14" : "#84CC16",
                    border: plan.highlight ? "none" : "1px solid rgba(132,204,22,0.3)",
                    borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                    cursor: "pointer", boxSizing: "border-box", transition: "all 0.2s ease",
                  }} dangerouslySetInnerHTML={{ __html: ctaLabel }} />
                )}
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#5A7091" }}>
          Need more than 500 analyses per month?{" "}
          <Link href="/contact" style={{ color: "#84CC16", textDecoration: "none" }}>
            Talk to us about Enterprise &rarr;
          </Link>
        </p>
      </div>
    </div>
  );
}
