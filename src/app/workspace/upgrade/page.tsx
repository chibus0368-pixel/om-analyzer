"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspaceAuth } from "@/lib/workspace/auth";

/**
 * /workspace/upgrade
 *
 * Workspace-internal upgrade page. Renders three tiers (Trial / Free / Pro)
 * with the visitor's current plan highlighted. CTAs:
 *   - Anonymous users: "Sign up free" -> /workspace/login?signup=1 with their
 *     Firebase anon UID preserved via linkWithCredential on the auth side.
 *   - Free users: "Start 7-day Pro trial" -> /api/stripe/checkout
 *   - Pro/Pro+ users: shows their current plan, no CTA
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
  const isFree = tier === "free";
  const isPro = tier === "pro" || tier === "pro_plus";

  async function startProCheckout() {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier: "pro" }),
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
      else alert(data?.error || "Couldn't start checkout. Please try again.");
    } catch (err: any) {
      alert("Checkout failed: " + (err?.message || "unknown"));
    }
  }

  return (
    <div style={{ padding: "32px 24px 64px", maxWidth: 1100, margin: "0 auto", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", margin: "0 0 8px", letterSpacing: -0.4 }}>
        {isPro ? "Your plan" : "Upgrade your plan"}
      </h1>
      <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 24px" }}>
        {isAnon && "You're on a 2-deal trial. Sign up to keep analyzing without losing this work."}
        {isFree && "You get 7 deal analyses per month on the free plan. Upgrade for higher limits and Pro features."}
        {isPro && "You have full access to Pro features."}
      </p>

      {usage && (
        <div style={{
          background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 12, padding: "14px 18px", marginBottom: 28,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
              Current usage
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>
              {usage.used} of {usage.limit} {isAnon || (isFree && false) ? "trial" : isFree ? "monthly" : "monthly"} analyses used
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <PlanCard
          name="Trial"
          price="Free"
          subtitle="Anonymous"
          features={["2 deal analyses", "Full Pro property page", "Brief + XLS downloads"]}
          current={isAnon}
        />
        <PlanCard
          name="Free"
          price="$0/mo"
          subtitle="With email signup"
          features={["7 deal analyses per month", "Save deals to workspace", "Brief + XLS downloads", "Deal Signals scoring"]}
          current={isFree}
          ctaLabel={isAnon ? "Sign up free" : isFree ? undefined : undefined}
          ctaHref={isAnon ? "/workspace/login?signup=1" : undefined}
          highlight={isAnon}
        />
        <PlanCard
          name="Pro"
          price="$40/mo"
          subtitle="7-day free trial"
          features={[
            "100 deal analyses per month",
            "Pro DealBoard with history",
            "Interactive property map",
            "White-label shareable links",
            "Location Intelligence",
          ]}
          current={tier === "pro"}
          ctaLabel={isAnon || isFree ? "Start 7-day trial" : undefined}
          ctaOnClick={isAnon || isFree ? startProCheckout : undefined}
          highlight={isFree}
        />
      </div>

      <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 24, textAlign: "center" }}>
        {isPro ? (
          <Link href="/workspace/profile?tab=account" prefetch={false} style={{ color: "#84CC16" }}>
            Manage your subscription &rarr;
          </Link>
        ) : (
          <>Cancel anytime. No credit card required for Free plan.</>
        )}
      </p>
    </div>
  );
}

function PlanCard({
  name, price, subtitle, features, current, ctaLabel, ctaHref, ctaOnClick, highlight,
}: {
  name: string;
  price: string;
  subtitle: string;
  features: string[];
  current?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
  ctaOnClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <div style={{
      background: "#FFFFFF",
      border: highlight ? "2px solid #84CC16" : "1px solid rgba(0,0,0,0.08)",
      borderRadius: 14,
      padding: "20px 18px",
      boxShadow: highlight ? "0 8px 24px rgba(132,204,22,0.15)" : "0 2px 10px rgba(15,23,43,0.04)",
      display: "flex", flexDirection: "column", gap: 12,
      position: "relative",
    }}>
      {current && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          background: "#0F172A", color: "#FFFFFF",
          fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase",
          padding: "3px 8px", borderRadius: 4,
        }}>
          Current
        </div>
      )}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.6 }}>
          {subtitle}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 2 }}>{name}</div>
        <div style={{ fontSize: 14, color: "#4D7C0F", fontWeight: 700, marginTop: 4 }}>{price}</div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {features.map((f, i) => (
          <li key={i} style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden style={{ color: "#4D7C0F", fontWeight: 800 }}>&#10003;</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {ctaLabel && (ctaHref ? (
        <Link
          href={ctaHref}
          prefetch={false}
          style={{
            marginTop: "auto", padding: "10px 14px", borderRadius: 8,
            background: highlight ? "#84CC16" : "#0F172A", color: highlight ? "#0F172A" : "#FFFFFF",
            fontSize: 13, fontWeight: 700, textAlign: "center", textDecoration: "none",
            border: "none", cursor: "pointer",
          }}
        >
          {ctaLabel}
        </Link>
      ) : (
        <button
          type="button"
          onClick={ctaOnClick}
          style={{
            marginTop: "auto", padding: "10px 14px", borderRadius: 8,
            background: highlight ? "#84CC16" : "#0F172A", color: highlight ? "#0F172A" : "#FFFFFF",
            fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            border: "none", cursor: "pointer",
          }}
        >
          {ctaLabel}
        </button>
      ))}
    </div>
  );
}
