"use client";

import React from "react";

/**
 * SectionHeader
 *
 * The canonical section header used across DealSignals. Lifted from the
 * Detail Analysis block in RentRollDetailAnalysis.tsx because it reads well
 * and makes dense pages easier to scan: a small uppercase lime eyebrow,
 * a large navy headline, an optional muted subtitle, and a thin dark-lime
 * rule underneath.
 *
 * Use this instead of ad-hoc <h2>/<h3> headings on any long-form page
 * (property detail, share view, dealboard sub-sections, etc.) so the
 * visual hierarchy stays consistent.
 *
 * Example:
 *   <SectionHeader eyebrow="Retail Module" title="Detail Analysis"
 *     subtitle="Tenant-level diagnostics across 12 tenants" />
 */
export interface SectionHeaderProps {
  /** Small uppercase lime label above the title. Optional. */
  eyebrow?: string;
  /** Main headline. Required. */
  title: string;
  /** Muted line under the title. Optional. */
  subtitle?: string;
  /** Right-side slot for actions (buttons, pills, counts). Optional. */
  right?: React.ReactNode;
  /** Visual density. `"lg"` matches Detail Analysis; `"md"` is a notch tighter. */
  size?: "lg" | "md";
  /** Extra top margin, e.g. when following a prior section. Default 0. */
  topGap?: number;
  /** Extra bottom gap before the content. Default 18. */
  bottomGap?: number;
}

// Canonical token set. Kept inline so SectionHeader has no external style dep
// and can be dropped into any page (including server components' child trees).
const C = {
  primaryText: "#4D7C0F", // dark-lime eyebrow + rule
  onSurface: "#0F172A",   // navy title
  secondary: "#6B7280",   // muted subtitle
};

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  right,
  size = "lg",
  topGap = 0,
  bottomGap = 18,
}: SectionHeaderProps) {
  const titleSize = size === "lg" ? 30 : 22;
  const eyebrowSize = size === "lg" ? 11 : 10;
  const subtitleSize = size === "lg" ? 12.5 : 12;
  const padBottom = size === "lg" ? 14 : 10;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
        padding: `0 2px ${padBottom}px 2px`,
        marginTop: topGap,
        marginBottom: bottomGap,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div
            style={{
              fontSize: eyebrowSize,
              fontWeight: 800,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: C.primaryText,
              marginBottom: 6,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h2
          style={{
            margin: 0,
            fontSize: titleSize,
            fontWeight: 800,
            letterSpacing: -0.5,
            color: C.onSurface,
            lineHeight: 1.1,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <div
            style={{
              fontSize: subtitleSize,
              color: C.secondary,
              fontWeight: 500,
              marginTop: 6,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {right && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {right}
        </div>
      )}
    </div>
  );
}
