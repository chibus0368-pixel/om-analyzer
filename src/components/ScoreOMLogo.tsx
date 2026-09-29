"use client";

import React from "react";

interface ScoreOMLogoProps {
  /** Height of the mark in px. The wordmark scales with it. */
  size?: number;
  showText?: boolean;
  /** true = dark text for light backgrounds. Default is white text for dark UI. */
  light?: boolean;
  style?: React.CSSProperties;
  iconOnly?: boolean;
}

const LIME = "#84CC16";

/** ScoreOM mark: a score ring (three-quarters filled) with a check inside. */
function Mark({ size, light }: { size: number; light: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="18" stroke={light ? "rgba(132,204,22,0.28)" : "rgba(132,204,22,0.22)"} strokeWidth="6" />
      <path d="M24 6A18 18 0 1 1 6 24" stroke={LIME} strokeWidth="6" strokeLinecap="round" />
      <path d="M16.5 24.5l5.5 5.5 10-11" stroke={LIME} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ScoreOMLogo({
  size = 32,
  showText = true,
  light = false,
  style,
  iconOnly = false,
}: ScoreOMLogoProps) {
  if (iconOnly || !showText) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", ...style }}>
        <Mark size={size} light={light} />
      </span>
    );
  }

  return (
    <span
      aria-label="ScoreOM"
      style={{
        display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.22),
        fontFamily: "'Plus Jakarta Sans', Inter, Arial, sans-serif",
        fontWeight: 800, fontSize: Math.round(size * 0.72), letterSpacing: "-0.02em", lineHeight: 1,
        color: light ? "#0d0d14" : "#ffffff",
        ...style,
      }}
    >
      <Mark size={size} light={light} />
      <span>Score<span style={{ color: LIME }}>OM</span></span>
    </span>
  );
}
