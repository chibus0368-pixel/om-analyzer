"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";

interface UsageData {
  uploadsUsed: number;
  uploadLimit: number;
  tier: string;
  tierStatus: string;
  isAnonymous: boolean;
}

interface TrialStatusBarProps {
  onUpgradeClick?: () => void;
}

/**
 * Persistent bar shown in workspace header showing trial/usage status.
 * Uses onAuthStateChanged to wait for Firebase auth before fetching,
 * so it correctly detects Pro/Pro+ users on initial load.
 */
export default function TrialStatusBar({ onUpgradeClick }: TrialStatusBarProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Stable fetch function that takes an optional Firebase user
  const fetchUsage = useCallback(async (fbUser?: any) => {
    try {
      if (fbUser) {
        const token = await fbUser.getIdToken();
        const res = await fetch("/api/workspace/usage", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setUsage(await res.json());
      } else {
        // Anonymous user — check localStorage for anonId
        const anonId = typeof window !== "undefined" ? localStorage.getItem("nnn_anon_id") : null;
        if (anonId) {
          const res = await fetch(`/api/workspace/usage?anonId=${anonId}`);
          if (res.ok) setUsage(await res.json());
        } else {
          setUsage({ uploadsUsed: 0, uploadLimit: 2, tier: "free", tierStatus: "none", isAnonymous: true });
        }
      }
    } catch (err) {
      console.warn("[TrialStatusBar] Failed to fetch usage:", err);
    }
  }, []);

  // Wait for Firebase auth to initialize before fetching usage
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

  // Listen for usage updates (after upload, upgrade, or property changes)
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

  const { uploadsUsed, uploadLimit, tier, isAnonymous } = usage;
  const atLimit = uploadsUsed >= uploadLimit;
  const nearLimit = uploadsUsed >= uploadLimit - 1 && !atLimit;
  const isPaid = tier === "pro" || tier === "pro_plus";

  // Don't show bar for paid users who are well under limit
  if (isPaid && uploadsUsed < uploadLimit * 0.8) return null;

  const label = isAnonymous
    ? "Free Trial"
    : tier === "pro"
    ? "Pro Plan"
    : tier === "pro_plus"
    ? "Pro+ Plan"
    : "Free Plan";

  const bgColor = atLimit
    ? "rgba(132, 204, 22, 0.08)"
    : nearLimit
    ? "rgba(234, 179, 8, 0.08)"
    : "rgba(148, 163, 184, 0.06)";

  const textColor = atLimit ? "#84CC16" : nearLimit ? "#92400e" : "#585e70";
  const barFillColor = atLimit ? "#84CC16" : nearLimit ? "#eab308" : "#10b981";

  const pct = Math.min(100, Math.round((uploadsUsed / uploadLimit) * 100));

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
          {uploadsUsed} / {uploadLimit} deals
        </span>
      </div>

      {/* Upgrade CTA for free users at or near limit */}
      {!isPaid && (atLimit || nearLimit) && (
        <button
          onClick={onUpgradeClick}
          style={{
            padding: "4px 12px",
            background: "#84CC16",
            color: "#0F172A",
            border: "none",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
