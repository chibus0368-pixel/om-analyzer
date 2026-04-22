"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";

interface UsageData {
  uploadsUsed: number;
  uploadLimit: number;
  tier: string;
  tierStatus: string;
  isAnonymous: boolean;
  isLifetimeLimit?: boolean;
}

interface TrialStatusBarProps {
  onUpgradeClick?: () => void;
}

/**
 * Persistent bar shown in workspace header showing trial/usage status.
 * Supports: anonymous trial, free (5 lifetime), pro trial, pro active, pro+ active.
 */
export default function TrialStatusBar({ onUpgradeClick }: TrialStatusBarProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const fetchUsage = useCallback(async (fbUser?: any) => {
    try {
      if (fbUser) {
        const token = await fbUser.getIdToken();
        const res = await fetch("/api/workspace/usage", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setUsage(await res.json());
      } else {
        const anonId = typeof window !== "undefined" ? localStorage.getItem("nnn_anon_id") : null;
        if (anonId) {
          const res = await fetch(`/api/workspace/usage?anonId=${anonId}`);
          if (res.ok) setUsage(await res.json());
        } else {
          setUsage({ uploadsUsed: 0, uploadLimit: 2, tier: "anonymous", tierStatus: "none", isAnonymous: true });
        }
      }
    } catch (err) {
      console.warn("[TrialStatusBar] Failed to fetch usage:", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getAuth, onAuthStateChanged } = await import("firebase/auth");
      const auth = getAuth();
      unsubRef.current = onAuthStateChanged(auth, (fbUser) => {
        if (cancelled) return;
        setAuthReady(true);
        fetchUsage(fbUser || undefined);
      });
    })();
    return () => {
      cancelled = true;
      if (unsubRef.current) unsubRef.current();
    };
  }, [fetchUsage]);

  useEffect(() => {
    const handler = async () => {
      const { getAuth } = await import("firebase/auth");
      const user = getAuth().currentUser;
      fetchUsage(user || undefined);
    };
    window.addEventListener("usage-updated", handler);
    window.addEventListener("workspace-properties-changed", handler);
    return () => {
      window.removeEventListener("usage-updated", handler);
      window.removeEventListener("workspace-properties-changed", handler);
    };
  }, [fetchUsage]);

  if (!usage) return null;

  const { uploadsUsed, uploadLimit, tier, tierStatus, isAnonymous, isLifetimeLimit } = usage;
  const atLimit = uploadsUsed >= uploadLimit;
  const nearLimit = uploadsUsed >= uploadLimit - 1 && !atLimit;
  const isPaid = tier === "pro" || tier === "pro_plus";
  const isTrial = tierStatus === "trialing";

  // Don't show bar for paid users who are well under limit (unless on trial)
  if (isPaid && !isTrial && uploadsUsed < uploadLimit * 0.8) return null;

  const label = isAnonymous
    ? "Free Preview"
    : tier === "pro" && isTrial
    ? "Pro Trial"
    : tier === "pro"
    ? "Pro Plan"
    : tier === "pro_plus" && isTrial
    ? "Pro+ Trial"
    : tier === "pro_plus"
    ? "Pro+ Plan"
    : "Free Plan";

  const suffix = isLifetimeLimit ? "total" : "/mo";

  const bgColor = atLimit
    ? "rgba(132, 204, 22, 0.08)"
    : isTrial
    ? "rgba(59, 130, 246, 0.06)"
    : nearLimit
    ? "rgba(234, 179, 8, 0.08)"
    : "rgba(148, 163, 184, 0.06)";

  const textColor = atLimit ? "#4D7C0F" : isTrial ? "#3b82f6" : nearLimit ? "#92400e" : "#585e70";
  const barFillColor = atLimit ? "#4D7C0F" : isTrial ? "#3b82f6" : nearLimit ? "#eab308" : "#10b981";

  const pct = Math.min(100, Math.round((uploadsUsed / uploadLimit) * 100));

  const showUpgrade = (!isPaid && (atLimit || nearLimit)) || (isTrial);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "6px 14px",
        background: bgColor,
        borderRadius: 8,
        fontSize: 12,
        color: textColor,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
        <div
          style={{
            flex: 1,
            height: 4,
            background: "rgba(148, 163, 184, 0.15)",
            borderRadius: 2,
            overflow: "hidden",
            minWidth: 40,
            maxWidth: 100,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barFillColor,
              borderRadius: 2,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <span style={{ whiteSpace: "nowrap" }}>
          {uploadsUsed} / {uploadLimit} deals{isLifetimeLimit ? "" : " this month"}
        </span>
      </div>

      {/* Upgrade CTA */}
      {showUpgrade && (
        <button
          onClick={onUpgradeClick}
          style={{
            padding: "4px 12px",
            background: isTrial ? "#3b82f6" : "#4D7C0F",
            color: isTrial ? "#fff" : "#0F172A",
            border: "none",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {isTrial ? "Subscribe" : "Upgrade"}
        </button>
      )}
    </div>
  );
}
