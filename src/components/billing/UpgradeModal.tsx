"use client";

import React, { useState } from "react";
import { PLANS } from "@/lib/stripe/config";
import { getAuth } from "firebase/auth";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit_reached" | "save_required" | "feature_locked" | "anon_limit" | "upgrade";
  featureName?: string;
}

export default function UpgradeModal({ open, onClose, reason = "limit_reached", featureName }: UpgradeModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<string>("free");

  // Fetch current tier when modal opens
  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (user) {
          const token = await user.getIdToken();
          const res = await fetch("/api/workspace/usage", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setCurrentTier(data.tier || "free");
          }
        }
      } catch { /* non-blocking */ }
    })();
  }, [open]);

  if (!open) return null;

  // If user is already on Pro or Pro+, show a simpler message directing to account settings
  const isPaid = currentTier === "pro" || currentTier === "pro_plus";
  if (isPaid) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(11, 17, 32, 0.7)", backdropFilter: "blur(4px)",
      }} onClick={onClose}>
        <div style={{
          background: "#fff", borderRadius: 16, padding: "40px 32px",
          maxWidth: 440, width: "90%", boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
          position: "relative", textAlign: "center",
        }} onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} style={{
            position: "absolute", top: 16, right: 16,
            background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8",
          }}>✕</button>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(132, 204, 22, 0.08)", display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 24,
          }}>⭐</div>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#0B1120", margin: "0 0 8px" }}>
            You&apos;re on the {currentTier === "pro_plus" ? "Pro+" : "Pro"} Plan
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>
            {currentTier === "pro_plus"
              ? "You have our top-tier plan with full access to all features."
              : "Manage your subscription or upgrade to Pro+ in your account settings."}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {currentTier === "pro" && (
              <a href="/workspace/profile?tab=account" style={{
                padding: "10px 24px", background: "#4D7C0F", color: "#FFFFFF", borderRadius: 8,
                fontSize: 14, fontWeight: 600, textDecoration: "none", fontFamily: "'Inter', sans-serif",
              }}>
                Upgrade to Pro+
              </a>
            )}
            <button onClick={onClose} style={{
              padding: "10px 24px", background: "transparent", border: "1px solid #e2e8f0",
              borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer",
              color: "#64748b", fontFamily: "'Inter', sans-serif",
            }}>
              {currentTier === "pro_plus" ? "Got it" : "Maybe Later"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Anonymous OR free user ── show conversion paths
  // Anon detection prefers the actual tier (reflects the user's Firebase
  // anonymous state) over the legacy `reason="anon_limit"` param.
  const isAnon = reason === "anon_limit" || currentTier === "anonymous";
  const isFreeLimit = reason === "limit_reached" && currentTier === "free";

  const headline = isAnon
    ? "You've used your 2 free deals"
    : isFreeLimit
    ? "You've used your 7 monthly deals"
    : reason === "save_required"
    ? "Save your deals and track them over time"
    : reason === "feature_locked"
    ? `Unlock ${featureName || "this feature"}`
    : "Upgrade to Pro";

  const subtitle = isAnon
    ? "Sign up free to keep going - 5 more deals this month, all your work saved, no card required."
    : isFreeLimit
    ? "Upgrade to Pro for 100 analyses every month."
    : reason === "save_required"
    ? "Sign up free to save this deal, or start a 7-day Pro trial for the full experience."
    : "Get full access with a 7-day free Pro trial.";

  async function handleCheckout(plan: string) {
    setLoading(plan);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      // Anonymous Firebase users need to register first so Stripe has an
      // email + real account to attach the subscription to. Without this
      // they'd hit a 403 on /api/stripe/checkout (server-side guard).
      if (!user || (user as any).isAnonymous) {
        window.location.href = `/workspace/login?mode=register&redirect=${encodeURIComponent(window.location.pathname)}&upgrade=${plan}`;
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout failed:", data.error);
        alert(data.error || "Failed to start checkout");
      }
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setLoading(null);
    }
  }

  function handleFreeSignup() {
    // For anon users this triggers linkWithCredential under the hood
    // so their existing trial properties carry over to the new account.
    window.location.href = "/workspace/login?mode=register&source=upgrade_modal";
  }

  const pro = PLANS.pro;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(11, 17, 32, 0.7)", backdropFilter: "blur(4px)",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "40px 32px",
        maxWidth: 560, width: "90%", boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
        position: "relative",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16,
          background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8",
        }}>✕</button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(132,204,22,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 24,
          }}>{isAnon ? "🎯" : isFreeLimit ? "⚡" : "🔒"}</div>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#0B1120", margin: "0 0 8px" }}>
            {headline}
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
        </div>

        {/* ── ANONYMOUS USER: Free signup is the primary card ── */}
        {isAnon && (
          <>
            <div style={{
              border: "2px solid #4D7C0F", borderRadius: 12, padding: "20px 22px",
              marginBottom: 12, position: "relative",
              background: "linear-gradient(180deg, rgba(132,204,22,0.04), #FFFFFF)",
            }}>
              <div style={{
                position: "absolute", top: -10, left: 16,
                background: "#4D7C0F", color: "#FFFFFF", fontSize: 10, fontWeight: 800,
                padding: "3px 12px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.08em",
              }}>Recommended</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1120", fontFamily: "'Inter', sans-serif" }}>Free Account</div>
                  <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2 }}>$0 forever &middot; No card required</div>
                </div>
              </div>
              <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {["5 more deal analyses this month", "Save your trial deals to your workspace", "All Pro analytics + brief & XLS downloads", "Deal Signals scoring on every deal"].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4D7C0F" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}><path d="M5 13l4 4L19 7" /></svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleFreeSignup}
                style={{
                  width: "100%", padding: "12px 0", border: "none",
                  borderRadius: 8, background: "#4D7C0F", color: "#FFFFFF",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Inter', sans-serif", letterSpacing: 0.2,
                }}
              >
                Sign Up Free
              </button>
            </div>

            {/* Pro is a small "need more?" tile, not a competing big CTA */}
            <button
              type="button"
              onClick={() => handleCheckout("pro")}
              disabled={!!loading}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "12px 16px",
                border: "1px solid #E5E7EB", borderRadius: 12,
                background: "#FFFFFF", cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "'Inter', sans-serif", textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0B1120" }}>
                  Need more? Try Pro &middot; 100 deals/mo
                </div>
                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                  ${pro.priceMonthly}/month after 7-day free trial &middot; Cancel anytime
                </div>
              </div>
              <span style={{ fontSize: 13, color: "#4D7C0F", fontWeight: 700, whiteSpace: "nowrap" }}>
                {loading === "pro" ? "Loading..." : "Start trial →"}
              </span>
            </button>
          </>
        )}

        {/* ── FREE USER AT LIMIT: Pro is the primary card ── */}
        {isFreeLimit && (
          <>
            <div style={{
              border: "2px solid #4D7C0F", borderRadius: 12, padding: "20px 22px",
              marginBottom: 12, position: "relative",
              background: "linear-gradient(180deg, rgba(132,204,22,0.04), #FFFFFF)",
            }}>
              <div style={{
                position: "absolute", top: -10, left: 16,
                background: "#4D7C0F", color: "#FFFFFF", fontSize: 10, fontWeight: 800,
                padding: "3px 12px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.08em",
              }}>7-Day Free Trial</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1120", fontFamily: "'Inter', sans-serif" }}>Pro</div>
                  <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2 }}>${pro.priceMonthly}/month after trial &middot; Cancel anytime</div>
                </div>
              </div>
              <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {["100 deal analyses per month", "Pro DealBoard with history", "Interactive property map", "Deal comparison scoreboard", "Location Intelligence", "White-label shareable links"].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4D7C0F" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}><path d="M5 13l4 4L19 7" /></svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleCheckout("pro")}
                disabled={!!loading}
                style={{
                  width: "100%", padding: "12px 0", border: "none",
                  borderRadius: 8, background: "#4D7C0F", color: "#FFFFFF",
                  fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "'Inter', sans-serif", letterSpacing: 0.2,
                }}
              >
                {loading === "pro" ? "Loading..." : "Start 7-Day Free Trial"}
              </button>
              <p style={{ textAlign: "center", fontSize: 11.5, color: "#94a3b8", margin: "10px 0 0" }}>
                Card not charged during trial. Cancel anytime.
              </p>
            </div>
          </>
        )}

        {/* ── Other reasons (save_required, feature_locked, plain upgrade) ── */}
        {!isAnon && !isFreeLimit && (
          <div style={{
            border: "2px solid #4D7C0F", borderRadius: 12, padding: "20px 24px", marginBottom: 12,
            position: "relative",
          }}>
            <div style={{
              position: "absolute", top: -10, right: 16,
              background: "#4D7C0F", color: "#FFFFFF", fontSize: 10, fontWeight: 700,
              padding: "3px 10px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>7-Day Free Trial</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1120" }}>Pro</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>${pro.priceMonthly}/month &middot; Cancel anytime</div>
            </div>
            <button
              onClick={() => handleCheckout("pro")}
              disabled={!!loading}
              style={{
                width: "100%", padding: "12px 0", border: "none",
                borderRadius: 8, background: "#4D7C0F", color: "#FFFFFF",
                fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading === "pro" ? "Loading..." : "Start Free Trial"}
            </button>
          </div>
        )}

        {/* Maybe Later */}
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, color: "#94a3b8", fontFamily: "'Inter', sans-serif",
          }}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
