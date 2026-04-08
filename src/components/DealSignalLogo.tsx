"use client";

import React from "react";

interface DealSignalLogoProps {
  size?: number;
  fontSize?: number;
  gap?: number;
  showText?: boolean;
  light?: boolean; // for dark backgrounds
  style?: React.CSSProperties;
  /** Show only the icon (no text), using the square icon image */
  iconOnly?: boolean;
}

export default function DealSignalLogo({
  size = 32,
  fontSize = 20,
  gap = 10,
  showText = true,
  light = false,
  style,
  iconOnly = false,
}: DealSignalLogoProps) {
  // Icon-only mode: just the square icon
  if (iconOnly || !showText) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          textDecoration: "none",
          ...style,
        }}
      >
        <img
          src="/images/dealsignals-logo-icon.png"
          alt="Deal Signals"
          width={size}
          height={size}
          style={{ display: "block" }}
        />
      </span>
    );
  }

  // Full logo with text — use the combined PNG
  // Original image is 396x112, ratio ~3.54:1
  // Height is driven by `size` (the icon height), width scales proportionally
  const logoHeight = size;
  const logoWidth = Math.round(logoHeight * (396 / 112));

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        textDecoration: "none",
        ...style,
      }}
    >
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
