"use client";

import React from "react";

interface DealSignalLogoProps {
  size?: number;        // icon size in px (default 32)
  fontSize?: number;    // text size in px (default 20)
  gap?: number;         // gap between icon and text (default 10)
  showText?: boolean;   // show "Deal Signal" text (default true)
  style?: React.CSSProperties;
}

export default function DealSignalLogo({
  size = 32,
  fontSize = 20,
  gap = 10,
  showText = true,
  style,
}: DealSignalLogoProps) {
  const iconRadius = size * 0.21875; // ~7/32 ratio

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
      {/* Orange rounded-square icon with trending-up arrow */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="32" rx="7" fill="#b9172f" />
        {/* Trending-up arrow polyline */}
        <polyline
          points="7,22 13,15 17,19 25,10"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Arrowhead */}
        <polyline
          points="20,10 25,10 25,15"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {/* "Deal Signal" text */}
      {showText && (
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
            fontSize,
            letterSpacing: "-0.025em",
            color: "#111827",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          Deal Signal
        </span>
      )}
    </span>
  );
}
