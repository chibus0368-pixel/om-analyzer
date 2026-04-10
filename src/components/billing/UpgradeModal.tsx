"use client";

import React, { useState } from "react";
import { PLANS } from "@/lib/stripe/config";
import { getAuth } from "firebase/auth";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit_reached" | "save_required" | "feature_locked" | "anon_limit";
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
                padding: "10px 24px", background: "#84CC16", color: "#0F172A", borderRadius: 8,
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

  // ── Free user or anonymous ── show two paths: Free signup + Pro trial
  const isAnon = reason === "anon_limit";
  const isFreeLimit = reason === "limit_reached" && currentTier === "free";

  const headline = isAnon
    ? "Keep analyzing deals"
    : isFreeLimit
    ? "You've used your 5 free deals"
    : reason === "save_required"
    ? "Save your deals and track them over time"
    : reason === "feature_locked"
    ? `Unlock ${featureName || "this feature"}`
    : "Upgrade to Pro";

  const subtitle = isAnon
    ? "Create a free account to save deals and get 5 total analyses, or start a Pro trial for unlimited access."
    : isFreeLimit
    ? "Start a 7-day free Pro trial to keep analyzing — 40 deals/month, full workspace, and more."
    : reason === "save_required"
    ? "Sign up free to save this deal, or start a Pro trial for the full experience."
    : `Get full access with a 7-day free Pro trial.`;

  async function handleCheckout(plan: string) {
    setLoading(plan);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        window.location.href = `/workspace/login?redirect=${encodeURIComponent(window.location.pathname)}&upgrade=${plan}`;
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
    window.location.href = "/workspace/login?source=upgrade_modal";
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
          }}>{isAnon || isFreeLimit ? "📊" : "🔒"}</div>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#0B1120", margin: "0 0 8px" }}>
            {headline}
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
        </div>

        {/* ── Pro Trial Card (Primary) ── */}
        <div style={{
          border: "2px solid #84CC16", borderRadius: 12, padding: "20px 24px", marginBottom: 12,
          position: "relative",
        }}>
          <div style={{
            position: "absolute", top: -10, right: 16,
            background: "#84CC16", color: "#0F172A", fontSize: 10, fontWeight: 700,
            padding: "3px 10px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>7-Day Free Trial</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1120", fontFamily: "'Inter', sans-serif" }}>Pro</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Then ${pro.priceMonthly}/mo · Cancel anytime
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {["40 deals/month", "Save & organize", "Excel workbooks", "Property map", "Scoreboard", "Location Intel"].map(f => (
              <span key={f} style={{
                fontSize: 11, color: "#475569", background: "#f1f5f9", padding: "3px 10px",
                borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ color: "#10b981", fontSize: 12 }}>✓</span> {f}
              </span>
            ))}
          </div>
          <button
            onClick={() => handleCheckout("pro")}
            disabled={!!loading}
            style={{
              width: "100%", padding: "12px 0", border: "none",
              borderRadius: 8, background: "#84CC16", color: "#0F172A",
              fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {loading === "pro" ? "Loading..." : "Start Free Trial"}
          </button>
        </div>

        {/* ── Free Account Option ── */}
        {(isAnon || reason === "save_required") && (
          <div style={{
            border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 12,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1120", fontFamily: "'Inter', sans-serif" }}>
                Free Account
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                5 deals total · Save to workspace · No card required
              </div>
            </div>
            <button
              onClick={handleFreeSignup}
              style={{
                padding: "8px 20px", border: "1px solid #e2e8f0",
                borderRadius: 8, background: "#fff", color: "#0B1120",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "'Inter', sans-serif", whiteSpace: "nowrap",
              }}
            >
              Sign Up Free
            </button>
          </div>
        )}

        {/* ── Free user at limit: only show Pro trial + workspace link ── */}
        {isFreeLimit && (
          <>
            <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", margin: "8px 0 0" }}>
              Your card won&apos;t be charged during the 7-day trial. Cancel anytime.
            </p>
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <a
                href="/workspace"
                style={{
                  fontSize: 12, color: "#64748b", textDecoration: "underline",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                View your saved deals in workspace
              </a>
            </div>
          </>
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
