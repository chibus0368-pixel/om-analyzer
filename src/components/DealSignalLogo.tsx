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
  // Icon-only mode: just the bars + dot (SVG)
  if (iconOnly || !showText) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", ...style }}>
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="62" width="14" height="28" rx="2" fill="#84CC16" />
          <rect x="30" y="48" width="14" height="42" rx="2" fill="#84CC16" />
          <rect x="50" y="32" width="14" height="58" rx="2" fill="#84CC16" />
          <rect x="70" y="16" width="14" height="74" rx="2" fill="#84CC16" />
          <circle cx="77" cy="8" r="5" fill="#84CC16" />
          <path d="M5 95 Q50 82 95 95" stroke="#84CC16" strokeWidth="2.5" fill="none" />
        </svg>
      </span>
    );
  }

  // Full logo with text — PNG (993x253, ratio ~3.93:1)
  const logoHeight = size;
  const logoWidth = Math.round(logoHeight * (993 / 253));

  return (
    <span style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", ...style }}>
      <img
        src="/images/dealsignals-full-logo.png"
        alt="Deal Signals"
        height={logoHeight}
        width={logoWidth}
        style={{ display: "block", height: logoHeight, width: "auto" }}
      />
    </span>
  );
}
