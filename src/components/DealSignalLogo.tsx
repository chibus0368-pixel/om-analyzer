"use client";

import React from "react";

interface DealSignalLogoProps {
  size?: number;
  fontSize?: number;
  gap?: number;
  showText?: boolean;
  light?: boolean; // for dark backgrounds
  style?: React.CSSProperties;
}

export default function DealSignalLogo({
  size = 32,
  fontSize = 20,
  gap = 10,
  showText = true,
  light = false,
  style,
}: DealSignalLogoProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        textDecoration: "none",
        ...style,
      }}
    >
      {/* Modern mark: rounded square with signal pulse */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="ds-mark-bg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#b9172f" />
            <stop offset="100%" stopColor="#8B0D1F" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="9" fill="url(#ds-mark-bg)" />
        {/* Signal pulse line */}
        <polyline
          points="6,22 11,22 14,14 18,26 22,10 25,22 30,22"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {showText && (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3, whiteSpace: "nowrap" }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 800,
              fontSize,
              letterSpacing: "-0.03em",
              color: light ? "#ffffff" : "#0B1120",
              lineHeight: 1,
            }}
          >
            Deal
          </span>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 800,
              fontSize,
              letterSpacing: "-0.03em",
              color: "#b9172f",
              lineHeight: 1,
            }}
          >
            Signals
          </span>
        </span>
      )}
    </span>
  );
}
