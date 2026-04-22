"use client";

import React, { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import Link from "next/link";

interface UsageData {
  uploadsUsed: number;
  uploadLimit: number;
  tier: string;
  tierStatus: string;
  isAnonymous: boolean;
}

/**
 * Sidebar usage meter: shows "Usage: X / Y deals" with progress bar
 * and upgrade prompt when near limit.
 */
export default function UsageMeter({ collapsed }: { collapsed: boolean }) {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetchUsage();
    const handler = () => fetchUsage();
    window.addEventListener("usage-updated", handler);
    return () => window.removeEventListener("usage-updated", handler);
  }, []);

  async function fetchUsage() {
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (user) {
        const token = await user.getIdToken();
        const res = await fetch("/api/workspace/usage", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setUsage(await res.json());
      } else {
        const anonId = localStorage.getItem("nnn_anon_id");
        if (anonId) {
          const res = await fetch(`/api/workspace/usage?anonId=${anonId}`);
          if (res.ok) setUsage(await res.json());
        } else {
          setUsage({ uploadsUsed: 0, uploadLimit: 2, tier: "free", tierStatus: "none", isAnonymous: true });
        }
      }
    } catch {
      // silent
    }
  }

  if (!usage || collapsed) return null;

  const { uploadsUsed, uploadLimit, tier } = usage;
  const isPaid = tier === "pro" || tier === "pro_plus";
  const atLimit = uploadsUsed >= uploadLimit;
  const nearLimit = uploadsUsed >= uploadLimit - 1 && !atLimit;
  const pct = Math.min(100, Math.round((uploadsUsed / uploadLimit) * 100));

  const barColor = atLimit ? "#4D7C0F" : nearLimit ? "#eab308" : "#10b981";

  return (
    <div style={{ padding: "0 14px", marginBottom: 4 }}>
      <div style={{
        padding: "10px 12px",
        background: atLimit ? "rgba(132, 204, 22, 0.05)" : "rgba(148, 163, 184, 0.04)",
        borderRadius: 8,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#585e70" }}>
            Usage
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: atLimit ? "#4D7C0F" : "#585e70" }}>
            {uploadsUsed} / {uploadLimit}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          width: "100%",
          height: 4,
          background: "rgba(148, 163, 184, 0.15)",
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: barColor,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Upgrade prompt for free users near/at limit */}
        {!isPaid && (atLimit || nearLimit) && (
          <Link
            href="/om-analyzer#pricing"
            style={{
              display: "block",
              marginTop: 8,
              padding: "6px 0",
              textAlign: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "#4D7C0F",
              textDecoration: "none",
              borderRadius: 4,
              background: "rgba(132, 204, 22, 0.06)",
            }}
          >
            {atLimit ? "Upgrade to continue" : "Upgrade for more deals"}
          </Link>
        )}
      </div>
    </div>
  );
}
