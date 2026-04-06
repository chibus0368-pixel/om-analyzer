"use client";

import React, { useState } from "react";
import { PLANS } from "@/lib/stripe/config";
import { getAuth } from "firebase/auth";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: "limit_reached" | "save_required" | "feature_locked";
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
            background: "rgba(185, 23, 47, 0.08)", display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 24,
          }}>⭐</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#0B1120", margin: "0 0 8px" }}>
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
                padding: "10px 24px", background: "#b9172f", color: "#fff", borderRadius: 8,
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

  const headline = reason === "limit_reached"
    ? "Upgrade to Pro"
    : reason === "save_required"
    ? "Save your deals and track them over time"
    : `Unlock ${featureName || "this feature"}`;

  const subtitle = reason === "limit_reached"
    ? "Upgrade to continue analyzing deals and unlock your DealBoard."
    : reason === "save_required"
    ? "Create an account to continue."
    : `${featureName || "This feature"} is available on Pro and Pro+ plans.`;

  async function handleCheckout(plan: string) {
    setLoading(plan);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        // Redirect to login if not authenticated
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

  const pro = PLANS.pro;
  const proPlus = PLANS.pro_plus;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(11, 17, 32, 0.7)", backdropFilter: "blur(4px)",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "40px 32px",
        maxWidth: 640, width: "90%", boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
        position: "relative",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16,
          background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#94a3b8",
        }}>✕</button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 24,
          }}>🔒</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: "#0B1120", margin: "0 0 8px" }}>
            {headline}
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>{subtitle}</p>
        </div>

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          {/* Pro */}
          <div style={{
            border: "2px solid #e2e8f0", borderRadius: 12, padding: 24,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pro</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#0B1120", margin: "8px 0 4px" }}>
              ${pro.priceMonthly}<span style={{ fontSize: 14, fontWeight: 400, color: "#94a3b8" }}>/mo</span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 20px", flex: 1 }}>
              {pro.features.slice(0, 4).map((f) => (
                <li key={f} style={{ fontSize: 13, color: "#475569", padding: "3px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#10b981" }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCheckout("pro")}
              disabled={!!loading}
              style={{
                width: "100%", padding: "10px 0", border: "2px solid #0B1120",
                borderRadius: 8, background: "#fff", color: "#0B1120",
                fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {loading === "pro" ? "Loading..." : "Start Pro"}
            </button>
          </div>

          {/* Pro+ */}
          <div style={{
            border: "2px solid #b9172f", borderRadius: 12, padding: 24,
            display: "flex", flexDirection: "column", position: "relative",
          }}>
            <div style={{
              position: "absolute", top: -10, right: 16,
              background: "#b9172f", color: "#fff", fontSize: 10, fontWeight: 700,
              padding: "3px 10px", borderRadius: 10, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Best Value</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b9172f", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pro+</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#0B1120", margin: "8px 0 4px" }}>
              ${proPlus.priceMonthly}<span style={{ fontSize: 14, fontWeight: 400, color: "#94a3b8" }}>/mo</span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 20px", flex: 1 }}>
              {proPlus.features.slice(0, 4).map((f) => (
                <li key={f} style={{ fontSize: 13, color: "#475569", padding: "3px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#10b981" }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCheckout("pro_plus")}
              disabled={!!loading}
              style={{
                width: "100%", padding: "10px 0", border: "none",
                borderRadius: 8, background: "#b9172f", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {loading === "pro_plus" ? "Loading..." : "Start Pro+"}
            </button>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", margin: 0 }}>
          Cancel anytime. No long-term commitment required.
        </p>
      </div>
    </div>
  );
}
