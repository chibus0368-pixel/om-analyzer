"use client";

import React from "react";

interface DealSignalLogoProps {
  size?: number;
  fontSize?: number;
  gap?: number;
  showText?: boolean;
  light?: boolean;
  style?: React.CSSProperties;
  iconOnly?: boolean;
}

export default function DealSignalLogo({
  size = 32,
  showText = true,
  light = false,
  style,
  iconOnly = false,
}: DealSignalLogoProps) {
  // Icon-only mode: just the bars + dot
  if (iconOnly || !showText) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", ...style }}>
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="62" width="14" height="28" rx="2" fill="#4D7C0F" />
          <rect x="30" y="48" width="14" height="42" rx="2" fill="#4D7C0F" />
          <rect x="50" y="32" width="14" height="58" rx="2" fill="#4D7C0F" />
          <rect x="70" y="16" width="14" height="74" rx="2" fill="#4D7C0F" />
          <circle cx="77" cy="8" r="5" fill="#4D7C0F" />
          <path d="M5 95 Q50 82 95 95" stroke="#4D7C0F" strokeWidth="2.5" fill="none" />
        </svg>
      </span>
    );
  }

  // Full logo: bars + dot + curved baseline + "DealSignals" text
  // viewBox ratio: 420x120 → 3.5:1
  const h = size;
  const w = Math.round(h * 3.5);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", ...style }}>
      <svg width={w} height={h} viewBox="0 0 420 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Bars */}
        <rect x="20" y="70" width="12" height="30" rx="1.5" fill="#4D7C0F" />
        <rect x="38" y="55" width="12" height="45" rx="1.5" fill="#4D7C0F" />
        <rect x="56" y="40" width="12" height="60" rx="1.5" fill="#4D7C0F" />
        <rect x="74" y="25" width="12" height="75" rx="1.5" fill="#4D7C0F" />
        {/* Dot */}
        <circle cx="80" cy="18" r="6" fill="#4D7C0F" />
        {/* Curved baseline */}
        <path d="M15 105 Q60 95 105 105" stroke="#4D7C0F" strokeWidth="2" fill="none" />
        {/* Text */}
        <text x="120" y="72" fontFamily="'Plus Jakarta Sans', Inter, Arial, sans-serif" fontSize="38" fontWeight="700" fill="#4D7C0F">
          Deal
        </text>
        <text x="210" y="72" fontFamily="'Plus Jakarta Sans', Inter, Arial, sans-serif" fontSize="38" fontWeight="700" fill="#ffffff">
          Signals
        </text>
      </svg>
    </span>
  );
}
